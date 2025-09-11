"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultSecurityService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const security_1 = require("../interfaces/security");
const Logger_1 = require("../utils/Logger");
const ioredis_1 = __importDefault(require("ioredis"));
class DefaultSecurityService {
    constructor() {
        this.logger = Logger_1.Logger.getInstance();
    }
    static getInstance() {
        if (!DefaultSecurityService.instance) {
            DefaultSecurityService.instance = new DefaultSecurityService();
        }
        return DefaultSecurityService.instance;
    }
    async initialize(policy) {
        this.policy = policy;
        // Initialize Redis if rate limiting is enabled
        if (policy.rateLimit.enabled) {
            this.redis = new ioredis_1.default({
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
    setMonitoringService(service) {
        this.monitoring = service;
    }
    async encrypt(data) {
        if (!this.policy.encryption.enabled) {
            throw new Error('Encryption is not enabled');
        }
        try {
            const iv = crypto_1.default.randomBytes(16);
            const cipher = crypto_1.default.createCipheriv(this.policy.encryption.algorithm, this.activeKey, iv, { authTagLength: this.policy.encryption.authTagLength });
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
                keyId: this.keyId
            };
        }
        catch (error) {
            this.logger.error(`Encryption failed: ${error}`);
            await this.logSecurityEvent({
                type: security_1.SecurityEventType.ENCRYPTION_ERROR,
                timestamp: new Date(),
                details: { error: String(error) },
                severity: 'high'
            });
            throw new Error('Encryption failed');
        }
    }
    async decrypt(encrypted) {
        if (!this.policy.encryption.enabled) {
            throw new Error('Encryption is not enabled');
        }
        try {
            const decipher = crypto_1.default.createDecipheriv(encrypted.algorithm, this.activeKey, encrypted.iv, { authTagLength: this.policy.encryption.authTagLength });
            if (encrypted.authTag) {
                decipher.setAuthTag(encrypted.authTag);
            }
            return Buffer.concat([
                decipher.update(encrypted.data),
                decipher.final()
            ]);
        }
        catch (error) {
            this.logger.error(`Decryption failed: ${error}`);
            await this.logSecurityEvent({
                type: security_1.SecurityEventType.ENCRYPTION_ERROR,
                timestamp: new Date(),
                details: { error: String(error) },
                severity: 'high'
            });
            throw new Error('Decryption failed');
        }
    }
    async generateToken(payload) {
        const now = Math.floor(Date.now() / 1000);
        const tokenPayload = {
            userId: payload.userId,
            deviceId: payload.deviceId,
            permissions: payload.permissions,
            sessionId: payload.sessionId,
            exp: now + this.policy.authentication.tokenExpiration,
            iat: now
        };
        try {
            const token = jsonwebtoken_1.default.sign(tokenPayload, this.policy.authentication.secret || '', {
                algorithm: 'HS256'
            });
            await this.logSecurityEvent({
                type: security_1.SecurityEventType.TOKEN_GENERATED,
                timestamp: new Date(),
                userId: payload.userId,
                deviceId: payload.deviceId,
                sessionId: payload.sessionId,
                severity: 'low'
            });
            return token;
        }
        catch (error) {
            this.logger.error(`Token generation failed: ${error}`);
            throw new Error('Failed to generate token');
        }
    }
    async verifyToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.policy.authentication.secret || '');
            return decoded;
        }
        catch (error) {
            this.logger.error(`Token verification failed: ${error}`);
            await this.logSecurityEvent({
                type: security_1.SecurityEventType.AUTH_FAILURE,
                timestamp: new Date(),
                details: { error: String(error) },
                severity: 'medium'
            });
            throw new Error('Invalid token');
        }
    }
    async createSecurityContext(token) {
        const payload = await this.verifyToken(token);
        const context = {
            userId: payload.userId,
            deviceId: payload.deviceId,
            sessionId: payload.sessionId,
            permissions: payload.permissions,
            encryptionKey: this.activeKey,
            authenticated: true,
            lastActivity: new Date()
        };
        await this.logSecurityEvent({
            type: security_1.SecurityEventType.AUTH_SUCCESS,
            timestamp: new Date(),
            userId: payload.userId,
            deviceId: payload.deviceId,
            sessionId: payload.sessionId,
            severity: 'low'
        });
        return context;
    }
    validatePermissions(context, action) {
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
    async enforceRateLimit(userId, action) {
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
                    type: security_1.SecurityEventType.RATE_LIMIT_EXCEEDED,
                    timestamp: new Date(),
                    userId,
                    details: { action, count },
                    severity: 'medium'
                });
                return false;
            }
            return true;
        }
        catch (error) {
            this.logger.error(`Rate limiting error: ${error}`);
            return true; // Fail open in case of Redis errors
        }
    }
    async logAudit(entry) {
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
        }
        catch (error) {
            this.logger.error(`Failed to log audit entry: ${error}`);
        }
    }
    async logSecurityEvent(event) {
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
        }
        catch (error) {
            this.logger.error(`Failed to log security event: ${error}`);
        }
    }
    async rotateEncryptionKey() {
        this.activeKey = crypto_1.default.randomBytes(this.policy.encryption.keySize);
        this.keyId = crypto_1.default.randomBytes(16).toString('hex');
        await this.logSecurityEvent({
            type: security_1.SecurityEventType.TOKEN_GENERATED,
            timestamp: new Date(),
            details: { keyId: this.keyId },
            severity: 'low'
        });
    }
}
exports.DefaultSecurityService = DefaultSecurityService;
//# sourceMappingURL=SecurityService.js.map