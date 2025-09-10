import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  SecurityService,
  SecurityPolicy,
  EncryptedData,
  TokenPayload,
  SecurityContext,
  AuditLogEntry,
  SecurityEvent,
  SecurityEventType
} from '../interfaces/security';
import { MonitoringService } from '../interfaces/monitoring';
import { Logger } from '../utils/Logger';
import Redis from 'ioredis';

export class DefaultSecurityService implements SecurityService {
  private static instance: DefaultSecurityService;
  private policy: SecurityPolicy;
  private monitoring?: MonitoringService;
  private logger: Logger;
  private redis?: Redis;
  private activeKey?: Buffer;
  private keyId?: string;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): DefaultSecurityService {
    if (!DefaultSecurityService.instance) {
      DefaultSecurityService.instance = new DefaultSecurityService();
    }
    return DefaultSecurityService.instance;
  }

  async initialize(policy: SecurityPolicy): Promise<void> {
    this.policy = policy;

    // Initialize Redis if rate limiting is enabled
    if (policy.rateLimit.enabled) {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      });
    }

    // Generate initial encryption key
    if (policy.encryption.enabled) {
      await this.rotateEncryptionKey();
    }

    this.logger.info('Security service initialized');
  }

  setMonitoringService(service: MonitoringService): void {
    this.monitoring = service;
  }

  async encrypt(data: Buffer): Promise<EncryptedData> {
    if (!this.policy.encryption.enabled) {
      throw new Error('Encryption is not enabled');
    }

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        this.policy.encryption.algorithm,
        this.activeKey!,
        iv,
        { authTagLength: this.policy.encryption.authTagLength }
      );

      const encrypted = Buffer.concat([
        cipher.update(data),
        cipher.final()
      ]);

      const authTag = cipher.getAuthTag();

      return {
        iv,
        data: encrypted,
        authTag,
        algorithm: this.policy.encryption.algorithm,
        keyId: this.keyId!
      };
    } catch (error) {
      this.logger.error(`Encryption failed: ${error}`);
      await this.logSecurityEvent({
        type: SecurityEventType.ENCRYPTION_ERROR,
        timestamp: new Date(),
        details: { error: String(error) },
        severity: 'high'
      });
      throw new Error('Encryption failed');
    }
  }

  async decrypt(encrypted: EncryptedData): Promise<Buffer> {
    if (!this.policy.encryption.enabled) {
      throw new Error('Encryption is not enabled');
    }

    try {
      const decipher = crypto.createDecipheriv(
        encrypted.algorithm,
        this.activeKey!,
        encrypted.iv,
        { authTagLength: this.policy.encryption.authTagLength }
      );

      if (encrypted.authTag) {
        decipher.setAuthTag(encrypted.authTag);
      }

      return Buffer.concat([
        decipher.update(encrypted.data),
        decipher.final()
      ]);
    } catch (error) {
      this.logger.error(`Decryption failed: ${error}`);
      await this.logSecurityEvent({
        type: SecurityEventType.ENCRYPTION_ERROR,
        timestamp: new Date(),
        details: { error: String(error) },
        severity: 'high'
      });
      throw new Error('Decryption failed');
    }
  }

  async generateToken(payload: Partial<TokenPayload>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const tokenPayload: TokenPayload = {
      userId: payload.userId!,
      deviceId: payload.deviceId,
      permissions: payload.permissions!,
      sessionId: payload.sessionId,
      exp: now + this.policy.authentication.tokenExpiration,
      iat: now
    };

    try {
      const token = jwt.sign(
        tokenPayload,
        this.policy.authentication.secret || '',
        {
          algorithm: 'HS256'
        }
      );

      await this.logSecurityEvent({
        type: SecurityEventType.TOKEN_GENERATED,
        timestamp: new Date(),
        userId: payload.userId,
        deviceId: payload.deviceId,
        sessionId: payload.sessionId,
        severity: 'low'
      });

      return token;
    } catch (error) {
      this.logger.error(`Token generation failed: ${error}`);
      throw new Error('Failed to generate token');
    }
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(
        token,
        this.policy.authentication.secret || ''
      ) as TokenPayload;

      return decoded;
    } catch (error) {
      this.logger.error(`Token verification failed: ${error}`);
      await this.logSecurityEvent({
        type: SecurityEventType.AUTH_FAILURE,
        timestamp: new Date(),
        details: { error: String(error) },
        severity: 'medium'
      });
      throw new Error('Invalid token');
    }
  }

  async createSecurityContext(token: string): Promise<SecurityContext> {
    const payload = await this.verifyToken(token);

    const context: SecurityContext = {
      userId: payload.userId,
      deviceId: payload.deviceId!,
      sessionId: payload.sessionId!,
      permissions: payload.permissions,
      encryptionKey: this.activeKey!,
      authenticated: true,
      lastActivity: new Date()
    };

    await this.logSecurityEvent({
      type: SecurityEventType.AUTH_SUCCESS,
      timestamp: new Date(),
      userId: payload.userId,
      deviceId: payload.deviceId,
      sessionId: payload.sessionId,
      severity: 'low'
    });

    return context;
  }

  validatePermissions(context: SecurityContext, action: string): boolean {
    // Basic permission check
    if (action === 'control' && !context.permissions.canControl) {
      return false;
    }
    if (action === 'configure' && !context.permissions.canConfigure) {
      return false;
    }
    if (action === 'monitor' && !context.permissions.canMonitor) {
      return false;
    }

    // Check time restrictions if they exist
    if (context.permissions.timeRestrictions) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: context.permissions.timeRestrictions.timezone
      });
      const [hours, minutes] = timeStr.split(':').map(Number);
      const currentTime = hours * 60 + minutes;

      const [startHours, startMinutes] = context.permissions.timeRestrictions.start.split(':').map(Number);
      const startTime = startHours * 60 + startMinutes;

      const [endHours, endMinutes] = context.permissions.timeRestrictions.end.split(':').map(Number);
      const endTime = endHours * 60 + endMinutes;

      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }

    return true;
  }

  async enforceRateLimit(userId: string, action: string): Promise<boolean> {
    if (!this.policy.rateLimit.enabled || !this.redis) {
      return true;
    }

    const key = `ratelimit:${userId}:${action}`;
    const now = Date.now();
    const windowStart = now - this.policy.rateLimit.windowMs;

    try {
      // Add the current request timestamp
      await this.redis.zadd(key, now.toString(), now.toString());
      
      // Remove old entries
      await this.redis.zremrangebyscore(key, '-inf', windowStart.toString());
      
      // Count requests in the current window
      const count = await this.redis.zcard(key);
      
      // Set expiry on the key
      await this.redis.expire(key, Math.ceil(this.policy.rateLimit.windowMs / 1000));

      if (count > this.policy.rateLimit.maxRequests) {
        await this.logSecurityEvent({
          type: SecurityEventType.RATE_LIMIT_EXCEEDED,
          timestamp: new Date(),
          userId,
          details: { action, count },
          severity: 'medium'
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Rate limiting error: ${error}`);
      return true; // Fail open in case of Redis errors
    }
  }

  async logAudit(entry: AuditLogEntry): Promise<void> {
    if (!this.policy.audit.enabled) {
      return;
    }

    try {
      // Log to configured audit storage
      // This could be extended to support different storage backends
      this.logger.info('Audit log entry', { audit: entry });

      // Record metric if monitoring is enabled
      if (this.monitoring) {
        this.monitoring.recordMetric('security_audit_logs', 1, {
          userId: entry.userId,
          action: entry.action,
          status: entry.status
        });
      }
    } catch (error) {
      this.logger.error(`Failed to log audit entry: ${error}`);
    }
  }

  private async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Log the event
      this.logger.info('Security event', { event });

      // Record metric if monitoring is enabled
      if (this.monitoring) {
        this.monitoring.recordMetric('security_events', 1, {
          type: event.type,
          severity: event.severity
        });
      }

      // Create audit log entry for significant events
      if (event.severity === 'high' || event.severity === 'critical') {
        await this.logAudit({
          timestamp: event.timestamp,
          userId: event.userId || 'system',
          deviceId: event.deviceId,
          action: event.type,
          resource: 'security',
          status: 'failure',
          details: event.details
        });
      }
    } catch (error) {
      this.logger.error(`Failed to log security event: ${error}`);
    }
  }

  private async rotateEncryptionKey(): Promise<void> {
    this.activeKey = crypto.randomBytes(this.policy.encryption.keySize);
    this.keyId = crypto.randomBytes(16).toString('hex');
    
    await this.logSecurityEvent({
      type: SecurityEventType.TOKEN_GENERATED,
      timestamp: new Date(),
      details: { keyId: this.keyId },
      severity: 'low'
    });
  }
}
