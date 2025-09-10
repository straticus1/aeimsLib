import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';

interface RateLimitRule {
  name: string;
  type: 'fixed' | 'sliding' | 'token';
  limit: number;
  window: number;
  cost?: number;
  burst?: number;
  timeout?: number;
}

interface RateLimit {
  rule: RateLimitRule;
  count: number;
  tokens?: number;
  lastRefill?: number;
  lastRequest?: number;
  blocked?: boolean;
  blockedUntil?: number;
}

interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * Rate Limiting Service
 * Provides advanced rate limiting with multiple algorithms and dynamic rules
 */
export class RateLimitService extends EventEmitter {
  private limits: Map<string, Map<string, RateLimit>> = new Map();
  private rules: Map<string, RateLimitRule> = new Map();

  constructor(private telemetry: TelemetryManager) {
    super();
  }

  /**
   * Add a rate limit rule
   */
  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.name, rule);

    // Track rule addition
    this.telemetry.track({
      type: 'rate_limit_rule_added',
      timestamp: Date.now(),
      data: {
        ruleName: rule.name,
        type: rule.type,
        limit: rule.limit,
        window: rule.window
      }
    });
  }

  /**
   * Check if an action is allowed
   */
  async checkLimit(
    key: string,
    ruleName: string,
    cost: number = 1
  ): Promise<RateLimitCheck> {
    const rule = this.rules.get(ruleName);
    if (!rule) {
      throw new Error(`Rate limit rule '${ruleName}' not found`);
    }

    // Get or create limit tracking
    let keyLimits = this.limits.get(key);
    if (!keyLimits) {
      keyLimits = new Map();
      this.limits.set(key, keyLimits);
    }

    let limit = keyLimits.get(ruleName);
    if (!limit) {
      limit = this.initializeLimit(rule);
      keyLimits.set(ruleName, limit);
    }

    // Check if blocked
    if (limit.blocked && limit.blockedUntil && Date.now() < limit.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        reset: limit.blockedUntil,
        retryAfter: Math.ceil((limit.blockedUntil - Date.now()) / 1000)
      };
    }

    // Check limit based on type
    const check = await this.checkLimitByType(limit, cost);

    // Track check
    await this.telemetry.track({
      type: 'rate_limit_check',
      timestamp: Date.now(),
      data: {
        key,
        ruleName,
        cost,
        allowed: check.allowed,
        remaining: check.remaining
      }
    });

    return check;
  }

  /**
   * Record rate limit hit
   */
  async recordHit(
    key: string,
    ruleName: string,
    cost: number = 1
  ): Promise<void> {
    const keyLimits = this.limits.get(key);
    if (!keyLimits) return;

    const limit = keyLimits.get(ruleName);
    if (!limit) return;

    switch (limit.rule.type) {
      case 'fixed':
        limit.count += cost;
        break;

      case 'sliding':
        limit.count += cost;
        limit.lastRequest = Date.now();
        break;

      case 'token':
        if (limit.tokens !== undefined) {
          limit.tokens = Math.max(0, limit.tokens - cost);
          limit.lastRequest = Date.now();
        }
        break;
    }

    // Check for block threshold
    if (limit.count >= limit.rule.limit * 1.5) {
      limit.blocked = true;
      limit.blockedUntil = Date.now() + (limit.rule.timeout || 3600000);

      // Track block
      await this.telemetry.track({
        type: 'rate_limit_blocked',
        timestamp: Date.now(),
        data: {
          key,
          ruleName,
          count: limit.count,
          blockedUntil: limit.blockedUntil
        }
      });
    }
  }

  /**
   * Reset rate limits for a key
   */
  async resetLimits(key: string): Promise<void> {
    const keyLimits = this.limits.get(key);
    if (!keyLimits) return;

    for (const [ruleName, limit] of keyLimits.entries()) {
      limit.count = 0;
      limit.tokens = limit.rule.limit;
      limit.lastRefill = Date.now();
      limit.blocked = false;
      limit.blockedUntil = undefined;

      // Track reset
      await this.telemetry.track({
        type: 'rate_limit_reset',
        timestamp: Date.now(),
        data: {
          key,
          ruleName
        }
      });
    }
  }

  /**
   * Clean up expired limits
   */
  private cleanupLimits(): void {
    const now = Date.now();
    for (const [key, keyLimits] of this.limits.entries()) {
      for (const [ruleName, limit] of keyLimits.entries()) {
        // Remove expired blocks
        if (limit.blocked && limit.blockedUntil && now >= limit.blockedUntil) {
          limit.blocked = false;
          limit.blockedUntil = undefined;
        }

        // Remove expired sliding windows
        if (limit.rule.type === 'sliding' &&
            limit.lastRequest &&
            now - limit.lastRequest > limit.rule.window) {
          keyLimits.delete(ruleName);
        }
      }

      // Remove empty key maps
      if (keyLimits.size === 0) {
        this.limits.delete(key);
      }
    }
  }

  private initializeLimit(rule: RateLimitRule): RateLimit {
    const limit: RateLimit = {
      rule,
      count: 0
    };

    if (rule.type === 'token') {
      limit.tokens = rule.limit;
      limit.lastRefill = Date.now();
    }

    return limit;
  }

  private async checkLimitByType(
    limit: RateLimit,
    cost: number
  ): Promise<RateLimitCheck> {
    const now = Date.now();

    switch (limit.rule.type) {
      case 'fixed':
        return this.checkFixedLimit(limit, cost, now);

      case 'sliding':
        return this.checkSlidingLimit(limit, cost, now);

      case 'token':
        return this.checkTokenLimit(limit, cost, now);

      default:
        throw new Error(`Unknown rate limit type: ${limit.rule.type}`);
    }
  }

  private checkFixedLimit(
    limit: RateLimit,
    cost: number,
    now: number
  ): RateLimitCheck {
    // Reset on window boundary
    const windowStart = Math.floor(now / limit.rule.window) * limit.rule.window;
    if (!limit.lastRequest || limit.lastRequest < windowStart) {
      limit.count = 0;
    }

    const remaining = Math.max(0, limit.rule.limit - limit.count);
    const allowed = remaining >= cost;
    const reset = windowStart + limit.rule.window;

    return {
      allowed,
      remaining,
      reset,
      retryAfter: allowed ? undefined : Math.ceil((reset - now) / 1000)
    };
  }

  private checkSlidingLimit(
    limit: RateLimit,
    cost: number,
    now: number
  ): RateLimitCheck {
    // Expire old count
    if (limit.lastRequest && now - limit.lastRequest > limit.rule.window) {
      limit.count = 0;
    }

    const remaining = Math.max(0, limit.rule.limit - limit.count);
    const allowed = remaining >= cost;
    const reset = limit.lastRequest
      ? limit.lastRequest + limit.rule.window
      : now + limit.rule.window;

    return {
      allowed,
      remaining,
      reset,
      retryAfter: allowed ? undefined : Math.ceil((reset - now) / 1000)
    };
  }

  private checkTokenLimit(
    limit: RateLimit,
    cost: number,
    now: number
  ): RateLimitCheck {
    // Refill tokens
    if (limit.lastRefill && limit.tokens !== undefined) {
      const timePassed = now - limit.lastRefill;
      const refillAmount = Math.floor(timePassed * (limit.rule.limit / limit.rule.window));
      limit.tokens = Math.min(
        limit.rule.limit,
        limit.tokens + refillAmount
      );
      limit.lastRefill = now;
    }

    const remaining = Math.max(0, limit.tokens || 0);
    const allowed = remaining >= cost;
    const refillTime = cost * (limit.rule.window / limit.rule.limit);
    const reset = now + refillTime;

    return {
      allowed,
      remaining,
      reset,
      retryAfter: allowed ? undefined : Math.ceil(refillTime / 1000)
    };
  }
}
