"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedSecurityManager = void 0;
const events_1 = require("events");
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Logger_1 = require("../../utils/Logger");
const MetricsCollector_1 = require("../../monitoring/MetricsCollector");
class EnhancedSecurityManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.logger = Logger_1.Logger.getInstance();
        this.metrics = MetricsCollector_1.MetricsCollector.getInstance();
        this.globalRateLimits = new Map();
        this.connectionRateLimits = new Map();
        this.userRateLimits = new Map();
        this.connectionCounts = new Map();
        this.blacklistedIPs = new Set();
        this.suspiciousPatterns = new Map();
        this.encryptionKeys = new Map();
        this.securityEvents = [];
        this.activeThreat = new Map();
        this.failedAttempts = new Map();
        this.currentKeyId = this.generateKeyId();
        this.initialize();
    }
    static getInstance(config) {
        if (!EnhancedSecurityManager.instance) {
            EnhancedSecurityManager.instance = new EnhancedSecurityManager(config);
        }
        return EnhancedSecurityManager.instance;
    }
    async initialize() {
        // Initialize encryption keys
        await this.initializeEncryption();
        // Start security monitoring
        this.startSecurityMonitoring();
        // Start key rotation if enabled
        if (this.config.encryption.keyRotationInterval > 0) {
            this.startKeyRotation();
        }
        this.logger.info('Enhanced security manager initialized', {
            ddosProtection: this.config.ddosProtection.enabled,
            messageEncryption: this.config.encryption.messageEncryption,
            multiFactorAuth: this.config.authentication.multiFactorAuth
        });
    }
    // Authentication and Authorization
    async authenticateConnection(token, clientIP) {
        try {
            // Check if IP is blacklisted
            if (this.blacklistedIPs.has(clientIP)) {
                this.recordSecurityEvent({
                    type: 'blocked_connection',
                    ip: clientIP,
                    details: { reason: 'blacklisted_ip' }
                });
                throw new Error('Connection blocked: IP blacklisted');
            }
            // Verify JWT token
            const decoded = jsonwebtoken_1.default.verify(token, this.config.authentication.jwtSecret);
            // Additional security checks
            await this.performSecurityChecks(decoded, clientIP);
            this.recordSecurityEvent({
                type: 'successful_authentication',
                ip: clientIP,
                details: { userId: decoded.userId }
            });
            return decoded;
        }
        catch (error) {
            this.handleAuthenticationFailure(clientIP, error.message);
            throw error;
        }
    }
    async performSecurityChecks(decoded, clientIP) {
        // Check token expiration
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
            throw new Error('Token expired');
        }
        // Check for suspicious patterns
        if (this.config.ddosProtection.suspiciousPatternDetection) {
            const suspicious = await this.detectSuspiciousActivity(decoded.userId, clientIP);
            if (suspicious) {
                this.createThreat({
                    type: 'suspicious_pattern',
                    severity: 'medium',
                    source: clientIP,
                    description: 'Suspicious authentication pattern detected',
                    metadata: { userId: decoded.userId }
                });
            }
        }
        // Multi-factor authentication check
        if (this.config.authentication.multiFactorAuth && !decoded.mfaVerified) {
            throw new Error('Multi-factor authentication required');
        }
    }
    handleAuthenticationFailure(clientIP, reason) {
        const attempts = this.failedAttempts.get(clientIP) || 0;
        this.failedAttempts.set(clientIP, attempts + 1);
        this.recordSecurityEvent({
            type: 'authentication_failure',
            ip: clientIP,
            details: { reason, attempts: attempts + 1 }
        });
        // Check for brute force attack
        if (attempts + 1 >= this.config.monitoring.alertThresholds.failedLogins) {
            this.createThreat({
                type: 'brute_force',
                severity: 'high',
                source: clientIP,
                description: `Multiple authentication failures: ${attempts + 1}`,
                metadata: { attempts: attempts + 1 }
            });
            // Temporarily blacklist IP
            this.blacklistedIPs.add(clientIP);
            setTimeout(() => {
                this.blacklistedIPs.delete(clientIP);
                this.failedAttempts.delete(clientIP);
            }, 3600000); // 1 hour
        }
        this.metrics.recordMetric('security.auth_failures', 1, { ip: clientIP, reason });
    }
    // Rate Limiting
    checkRateLimit(type, identifier) {
        const config = this.config.rateLimiting[type];
        const limitsMap = this.getRateLimitMap(type);
        let bucket = limitsMap.get(identifier);
        const now = Date.now();
        if (!bucket || now >= bucket.resetTime) {
            bucket = {
                count: 0,
                resetTime: now + config.windowMs,
                blocked: false
            };
            limitsMap.set(identifier, bucket);
        }
        bucket.count++;
        if (bucket.count > config.maxRequests) {
            bucket.blocked = true;
            this.recordSecurityEvent({
                type: 'rate_limit_exceeded',
                ip: identifier,
                details: { type, count: bucket.count, limit: config.maxRequests }
            });
            this.createThreat({
                type: 'rate_limit',
                severity: 'medium',
                source: identifier,
                description: `Rate limit exceeded: ${bucket.count}/${config.maxRequests}`,
                metadata: { type, window: config.windowMs }
            });
            this.metrics.recordMetric('security.rate_limits', 1, { type, identifier });
            return false;
        }
        return true;
    }
    getRateLimitMap(type) {
        switch (type) {
            case 'global': return this.globalRateLimits;
            case 'connection': return this.connectionRateLimits;
            case 'user': return this.userRateLimits;
        }
    }
    // DDoS Protection
    checkDDoSProtection(clientIP) {
        if (!this.config.ddosProtection.enabled)
            return true;
        const now = Date.now();
        let connectionData = this.connectionCounts.get(clientIP);
        if (!connectionData) {
            connectionData = { count: 0, firstConnection: now };
            this.connectionCounts.set(clientIP, connectionData);
        }
        // Reset if window expired
        if (now - connectionData.firstConnection > this.config.ddosProtection.connectionWindowMs) {
            connectionData.count = 0;
            connectionData.firstConnection = now;
        }
        connectionData.count++;
        if (connectionData.count > this.config.ddosProtection.maxConnectionsPerIP) {
            this.createThreat({
                type: 'ddos',
                severity: 'critical',
                source: clientIP,
                description: `DDoS attack detected: ${connectionData.count} connections`,
                metadata: { connections: connectionData.count, window: this.config.ddosProtection.connectionWindowMs }
            });
            // Blacklist IP temporarily
            this.blacklistedIPs.add(clientIP);
            setTimeout(() => {
                this.blacklistedIPs.delete(clientIP);
                this.connectionCounts.delete(clientIP);
            }, this.config.ddosProtection.connectionWindowMs);
            this.metrics.recordMetric('security.ddos_blocks', 1, { ip: clientIP });
            return false;
        }
        return true;
    }
    // Message Encryption
    async encryptMessage(message, connectionId) {
        if (!this.config.encryption.messageEncryption) {
            return Buffer.from(JSON.stringify(message));
        }
        const key = this.encryptionKeys.get(this.currentKeyId);
        if (!key) {
            throw new Error('Encryption key not available');
        }
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipher(this.config.encryption.algorithm, key);
        let encrypted = cipher.update(JSON.stringify(message), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const result = {
            keyId: this.currentKeyId,
            iv: iv.toString('hex'),
            data: encrypted
        };
        return Buffer.from(JSON.stringify(result));
    }
    async decryptMessage(encryptedData, connectionId) {
        if (!this.config.encryption.messageEncryption) {
            return JSON.parse(encryptedData.toString());
        }
        const { keyId, iv, data } = JSON.parse(encryptedData.toString());
        const key = this.encryptionKeys.get(keyId);
        if (!key) {
            throw new Error('Decryption key not found');
        }
        const decipher = crypto_1.default.createDecipher(this.config.encryption.algorithm, key);
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    }
    // Suspicious Activity Detection
    async detectSuspiciousActivity(userId, clientIP) {
        const patternKey = `${userId}_${clientIP}`;
        let pattern = this.suspiciousPatterns.get(patternKey);
        if (!pattern) {
            pattern = {
                connections: 0,
                lastConnection: Date.now(),
                locations: new Set([clientIP]),
                timePattern: []
            };
            this.suspiciousPatterns.set(patternKey, pattern);
        }
        const now = Date.now();
        pattern.connections++;
        pattern.locations.add(clientIP);
        pattern.timePattern.push(now);
        pattern.lastConnection = now;
        // Clean old time patterns (keep only last hour)
        pattern.timePattern = pattern.timePattern.filter(time => now - time < 3600000);
        // Check for suspicious patterns
        const suspicious = pattern.locations.size > 5 || // Multiple IPs for same user
            pattern.connections > 100 || // Too many connections
            this.detectRapidConnections(pattern.timePattern); // Rapid connection pattern
        if (suspicious) {
            this.metrics.recordMetric('security.suspicious_activity', 1, { userId, ip: clientIP });
        }
        return suspicious;
    }
    detectRapidConnections(timePattern) {
        if (timePattern.length < 10)
            return false;
        // Check for more than 10 connections in 60 seconds
        const recentConnections = timePattern.filter(time => Date.now() - time < 60000);
        return recentConnections.length > 10;
    }
    // Encryption Key Management
    async initializeEncryption() {
        // Generate initial encryption key
        const key = crypto_1.default.randomBytes(32);
        this.encryptionKeys.set(this.currentKeyId, key);
        this.logger.info('Encryption initialized', {
            algorithm: this.config.encryption.algorithm,
            keyId: this.currentKeyId
        });
    }
    startKeyRotation() {
        this.keyRotationTimer = setInterval(() => {
            this.rotateEncryptionKey();
        }, this.config.encryption.keyRotationInterval);
    }
    rotateEncryptionKey() {
        const oldKeyId = this.currentKeyId;
        this.currentKeyId = this.generateKeyId();
        const newKey = crypto_1.default.randomBytes(32);
        this.encryptionKeys.set(this.currentKeyId, newKey);
        // Keep old key for some time to decrypt existing messages
        setTimeout(() => {
            this.encryptionKeys.delete(oldKeyId);
        }, 300000); // 5 minutes
        this.logger.info('Encryption key rotated', {
            oldKeyId,
            newKeyId: this.currentKeyId
        });
        this.metrics.recordMetric('security.key_rotations', 1);
    }
    generateKeyId() {
        return crypto_1.default.randomBytes(8).toString('hex');
    }
    // Security Monitoring
    startSecurityMonitoring() {
        setInterval(() => {
            this.analyzeSecurityEvents();
            this.cleanupOldEvents();
            this.publishSecurityMetrics();
        }, 30000); // Every 30 seconds
    }
    analyzeSecurityEvents() {
        const recentEvents = this.getRecentSecurityEvents(300000); // Last 5 minutes
        // Analyze patterns
        const eventsByType = this.groupEventsByType(recentEvents);
        for (const [type, events] of eventsByType) {
            if (events.length > this.config.monitoring.alertThresholds.suspiciousActivity) {
                this.createThreat({
                    type: 'suspicious_pattern',
                    severity: 'medium',
                    source: 'system',
                    description: `High frequency of ${type} events: ${events.length}`,
                    metadata: { eventType: type, count: events.length }
                });
            }
        }
    }
    getRecentSecurityEvents(timeWindowMs) {
        const cutoff = Date.now() - timeWindowMs;
        return this.securityEvents.filter(event => event.timestamp.getTime() > cutoff);
    }
    groupEventsByType(events) {
        const grouped = new Map();
        for (const event of events) {
            if (!grouped.has(event.type)) {
                grouped.set(event.type, []);
            }
            grouped.get(event.type).push(event);
        }
        return grouped;
    }
    cleanupOldEvents() {
        const cutoff = Date.now() - 3600000; // Keep events for 1 hour
        this.securityEvents = this.securityEvents.filter(event => event.timestamp.getTime() > cutoff);
    }
    publishSecurityMetrics() {
        this.metrics.recordMetric('security.active_threats', this.activeThreat.size);
        this.metrics.recordMetric('security.blacklisted_ips', this.blacklistedIPs.size);
        this.metrics.recordMetric('security.recent_events', this.getRecentSecurityEvents(300000).length);
    }
    // Security Event Management
    recordSecurityEvent(eventData) {
        const event = {
            id: crypto_1.default.randomUUID(),
            timestamp: new Date(),
            ...eventData
        };
        this.securityEvents.push(event);
        if (this.config.monitoring.logSecurityEvents) {
            this.logger.info('Security event recorded', event);
        }
        this.emit('securityEvent', event);
    }
    createThreat(threatData) {
        const threat = {
            id: crypto_1.default.randomUUID(),
            timestamp: new Date(),
            ...threatData
        };
        this.activeThreat.set(threat.id, threat);
        this.logger.warn('Security threat detected', threat);
        this.emit('securityThreat', threat);
        this.metrics.recordMetric('security.threats_detected', 1, {
            type: threat.type,
            severity: threat.severity
        });
        // Auto-resolve some threats after timeout
        if (threat.type !== 'ddos' && threat.severity !== 'critical') {
            setTimeout(() => {
                this.resolveThreat(threat.id);
            }, 1800000); // 30 minutes
        }
    }
    // Public API
    validateWebSocketConnection(ws) {
        if (!ws.userId || !ws.sessionId) {
            return false;
        }
        // Check rate limits
        if (!this.checkRateLimit('user', ws.userId) ||
            !this.checkRateLimit('connection', ws.connectionId || '')) {
            return false;
        }
        return true;
    }
    getSecurityStatus() {
        return {
            activeThreats: this.activeThreat.size,
            blacklistedIPs: this.blacklistedIPs.size,
            recentEvents: this.getRecentSecurityEvents(300000).length,
            rateLimits: {
                global: this.globalRateLimits.size,
                connection: this.connectionRateLimits.size,
                user: this.userRateLimits.size
            },
            encryption: {
                enabled: this.config.encryption.messageEncryption,
                currentKeyId: this.currentKeyId,
                keyCount: this.encryptionKeys.size
            }
        };
    }
    getActiveThreat() {
        return Array.from(this.activeThreat.values());
    }
    resolveThreat(threatId) {
        const resolved = this.activeThreat.delete(threatId);
        if (resolved) {
            this.logger.info('Security threat resolved', { threatId });
            this.emit('threatResolved', threatId);
        }
        return resolved;
    }
    blacklistIP(ip, duration = 3600000) {
        this.blacklistedIPs.add(ip);
        this.recordSecurityEvent({
            type: 'ip_blacklisted',
            ip,
            details: { duration }
        });
        setTimeout(() => {
            this.blacklistedIPs.delete(ip);
            this.recordSecurityEvent({
                type: 'ip_unblacklisted',
                ip,
                details: { reason: 'timeout' }
            });
        }, duration);
    }
    whitelistIP(ip) {
        this.blacklistedIPs.delete(ip);
        this.failedAttempts.delete(ip);
        this.recordSecurityEvent({
            type: 'ip_whitelisted',
            ip,
            details: { reason: 'manual' }
        });
    }
    async shutdown() {
        if (this.keyRotationTimer) {
            clearInterval(this.keyRotationTimer);
        }
        // Clear sensitive data
        this.encryptionKeys.clear();
        this.failedAttempts.clear();
        this.logger.info('Enhanced security manager shutdown complete');
    }
}
exports.EnhancedSecurityManager = EnhancedSecurityManager;
//# sourceMappingURL=EnhancedSecurityManager.js.map