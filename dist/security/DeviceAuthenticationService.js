"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceAuthenticationService = void 0;
const jsonwebtoken_1 = require("jsonwebtoken");
const crypto_1 = require("crypto");
const security_1 = require("../interfaces/security");
const AnalyticsService_1 = require("../monitoring/AnalyticsService");
class DeviceAuthenticationService {
    constructor() {
        this.config = {
            type: 'jwt',
            tokenExpiration: 3600, // 1 hour
            refreshTokenExpiration: 7 * 24 * 3600, // 7 days
        };
        this.tokenBlacklist = new Set();
        this.analytics = AnalyticsService_1.AnalyticsService.getInstance();
    }
    static getInstance() {
        if (!DeviceAuthenticationService.instance) {
            DeviceAuthenticationService.instance = new DeviceAuthenticationService();
        }
        return DeviceAuthenticationService.instance;
    }
    /**
     * Generate a device authentication token
     */
    async generateDeviceToken(userId, deviceId, permissions) {
        if (!this.config.secret) {
            throw new Error('Authentication secret not configured');
        }
        const payload = {
            userId,
            deviceId,
            permissions,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + this.config.tokenExpiration
        };
        const token = (0, jsonwebtoken_1.sign)(payload, this.config.secret, {
            algorithm: 'HS256',
            jwtid: this.generateTokenId()
        });
        this.logSecurityEvent({
            type: security_1.SecurityEventType.TOKEN_GENERATED,
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
    async validateDeviceToken(token) {
        if (!this.config.secret) {
            throw new Error('Authentication secret not configured');
        }
        try {
            // Verify token hasn't been blacklisted
            const decoded = (0, jsonwebtoken_1.verify)(token, this.config.secret, {
                algorithms: ['HS256']
            });
            if (this.isTokenBlacklisted(decoded.jti)) {
                throw new Error('Token has been revoked');
            }
            // Create security context
            const context = {
                userId: decoded.userId,
                deviceId: decoded.deviceId,
                sessionId: decoded.jti,
                permissions: decoded.permissions,
                authenticated: true,
                lastActivity: new Date()
            };
            this.logSecurityEvent({
                type: security_1.SecurityEventType.AUTH_SUCCESS,
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
        }
        catch (error) {
            this.logSecurityEvent({
                type: security_1.SecurityEventType.AUTH_FAILURE,
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
    async revokeDeviceToken(token) {
        const decoded = (0, jsonwebtoken_1.verify)(token, this.config.secret);
        this.tokenBlacklist.add(decoded.jti);
        this.logSecurityEvent({
            type: security_1.SecurityEventType.TOKEN_REVOKED,
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
    validatePermissions(context, requiredPermissions) {
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
                type: security_1.SecurityEventType.PERMISSION_DENIED,
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
    isTokenBlacklisted(tokenId) {
        return this.tokenBlacklist.has(tokenId);
    }
    /**
     * Generate a unique token ID
     */
    generateTokenId() {
        return (0, crypto_1.randomBytes)(16).toString('hex');
    }
    /**
     * Clean up expired entries from the token blacklist
     */
    cleanupBlacklist() {
        // Implementation would remove expired tokens based on their original expiration time
        // This is a simplified version that just keeps the blacklist from growing too large
        if (this.tokenBlacklist.size > 10000) {
            this.tokenBlacklist.clear();
            this.logSecurityEvent({
                type: security_1.SecurityEventType.TOKEN_REVOKED,
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
    logSecurityEvent(event) {
        // Log to analytics service
        this.analytics.recordSecurityEvent(event);
        // Additional logging could be added here (e.g., to a security monitoring service)
    }
    /**
     * Update authentication configuration
     */
    updateConfig(config) {
        this.config = {
            ...this.config,
            ...config
        };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
exports.DeviceAuthenticationService = DeviceAuthenticationService;
//# sourceMappingURL=DeviceAuthenticationService.js.map