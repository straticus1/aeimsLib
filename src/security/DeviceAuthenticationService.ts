import { sign, verify } from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import {
  AuthConfig,
  TokenPayload,
  Permissions,
  SecurityContext,
  SecurityEvent,
  SecurityEventType
} from '../interfaces/security';
import { AnalyticsService } from '../monitoring/AnalyticsService';

export class DeviceAuthenticationService {
  private static instance: DeviceAuthenticationService;
  private config: AuthConfig;
  private tokenBlacklist: Set<string>;
  private analytics: AnalyticsService;

  private constructor() {
    this.config = {
      type: 'jwt',
      tokenExpiration: 3600, // 1 hour
      refreshTokenExpiration: 7 * 24 * 3600, // 7 days
    };
    this.tokenBlacklist = new Set();
    this.analytics = AnalyticsService.getInstance();
  }

  static getInstance(): DeviceAuthenticationService {
    if (!DeviceAuthenticationService.instance) {
      DeviceAuthenticationService.instance = new DeviceAuthenticationService();
    }
    return DeviceAuthenticationService.instance;
  }

  /**
   * Generate a device authentication token
   */
  async generateDeviceToken(
    userId: string,
    deviceId: string,
    permissions: Permissions
  ): Promise<string> {
    if (!this.config.secret) {
      throw new Error('Authentication secret not configured');
    }

    const payload: TokenPayload = {
      userId,
      deviceId,
      permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.tokenExpiration
    };

    const token = sign(payload, this.config.secret, {
      algorithm: 'HS256',
      jwtid: this.generateTokenId()
    });

    this.logSecurityEvent({
      type: SecurityEventType.TOKEN_GENERATED,
      timestamp: new Date(),
      userId,
      deviceId,
      details: {
        tokenId: payload.jti,
        expires: new Date(payload.exp * 1000)
      },
      severity: 'low'
    });

    return token;
  }

  /**
   * Validate a device authentication token
   */
  async validateDeviceToken(token: string): Promise<SecurityContext> {
    if (!this.config.secret) {
      throw new Error('Authentication secret not configured');
    }

    try {
      // Verify token hasn't been blacklisted
      const decoded = verify(token, this.config.secret, {
        algorithms: ['HS256']
      }) as TokenPayload;

      if (this.isTokenBlacklisted(decoded.jti)) {
        throw new Error('Token has been revoked');
      }

      // Create security context
      const context: SecurityContext = {
        userId: decoded.userId,
        deviceId: decoded.deviceId,
        sessionId: decoded.jti,
        permissions: decoded.permissions,
        authenticated: true,
        lastActivity: new Date()
      };

      this.logSecurityEvent({
        type: SecurityEventType.AUTH_SUCCESS,
        timestamp: new Date(),
        userId: decoded.userId,
        deviceId: decoded.deviceId,
        sessionId: decoded.jti,
        details: {
          authenticationType: 'jwt',
          expiresAt: new Date(decoded.exp * 1000)
        },
        severity: 'low'
      });

      return context;
    } catch (error) {
      this.logSecurityEvent({
        type: SecurityEventType.AUTH_FAILURE,
        timestamp: new Date(),
        details: {
          error: error.message,
          token: token.substring(0, 10) + '...' // Log only first part of token
        },
        severity: 'medium'
      });

      throw error;
    }
  }

  /**
   * Revoke a device token
   */
  async revokeDeviceToken(token: string): Promise<void> {
    const decoded = verify(token, this.config.secret!) as TokenPayload;
    
    this.tokenBlacklist.add(decoded.jti);

    this.logSecurityEvent({
      type: SecurityEventType.TOKEN_REVOKED,
      timestamp: new Date(),
      userId: decoded.userId,
      deviceId: decoded.deviceId,
      sessionId: decoded.jti,
      details: {
        reason: 'Manual revocation'
      },
      severity: 'medium'
    });

    // Clean up old blacklist entries periodically
    this.cleanupBlacklist();
  }

  /**
   * Validate specific permissions
   */
  validatePermissions(context: SecurityContext, requiredPermissions: string[]): boolean {
    // Check if context is still valid
    if (!context.authenticated || this.isTokenBlacklisted(context.sessionId)) {
      return false;
    }

    const hasPermission = requiredPermissions.every(permission => {
      switch (permission) {
        case 'control':
          return context.permissions.canControl;
        case 'configure':
          return context.permissions.canConfigure;
        case 'monitor':
          return context.permissions.canMonitor;
        default:
          return false;
      }
    });

    if (!hasPermission) {
      this.logSecurityEvent({
        type: SecurityEventType.PERMISSION_DENIED,
        timestamp: new Date(),
        userId: context.userId,
        deviceId: context.deviceId,
        sessionId: context.sessionId,
        details: {
          requiredPermissions,
          grantedPermissions: context.permissions
        },
        severity: 'medium'
      });
    }

    return hasPermission;
  }

  /**
   * Check if a token has been blacklisted
   */
  private isTokenBlacklisted(tokenId: string): boolean {
    return this.tokenBlacklist.has(tokenId);
  }

  /**
   * Generate a unique token ID
   */
  private generateTokenId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Clean up expired entries from the token blacklist
   */
  private cleanupBlacklist(): void {
    // Implementation would remove expired tokens based on their original expiration time
    // This is a simplified version that just keeps the blacklist from growing too large
    if (this.tokenBlacklist.size > 10000) {
      this.tokenBlacklist.clear();
      
      this.logSecurityEvent({
        type: SecurityEventType.TOKEN_REVOKED,
        timestamp: new Date(),
        details: {
          reason: 'Blacklist cleanup',
          totalCleared: this.tokenBlacklist.size
        },
        severity: 'low'
      });
    }
  }

  /**
   * Log security events
   */
  private logSecurityEvent(event: SecurityEvent): void {
    // Log to analytics service
    this.analytics.recordSecurityEvent(event);

    // Additional logging could be added here (e.g., to a security monitoring service)
  }

  /**
   * Update authentication configuration
   */
  updateConfig(config: Partial<AuthConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): AuthConfig {
    return { ...this.config };
  }
}
