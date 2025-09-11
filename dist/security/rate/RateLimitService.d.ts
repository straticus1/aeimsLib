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
export declare class RateLimitService extends EventEmitter {
    private telemetry;
    private limits;
    private rules;
    constructor(telemetry: TelemetryManager);
    /**
     * Add a rate limit rule
     */
    addRule(rule: RateLimitRule): void;
    /**
     * Check if an action is allowed
     */
    checkLimit(key: string, ruleName: string, cost?: number): Promise<RateLimitCheck>;
    /**
     * Record rate limit hit
     */
    recordHit(key: string, ruleName: string, cost?: number): Promise<void>;
    /**
     * Reset rate limits for a key
     */
    resetLimits(key: string): Promise<void>;
    /**
     * Clean up expired limits
     */
    private cleanupLimits;
    private initializeLimit;
    private checkLimitByType;
    private checkFixedLimit;
    private checkSlidingLimit;
    private checkTokenLimit;
}
export {};
