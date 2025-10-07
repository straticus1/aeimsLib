import { EventEmitter } from 'events';
import { AuthenticatedWebSocket } from '../EnhancedWebSocketServer';
export interface SecurityConfig {
    authentication: {
        jwtSecret: string;
        tokenExpiration: number;
        refreshTokenEnabled: boolean;
        multiFactorAuth: boolean;
    };
    rateLimiting: {
        global: {
            windowMs: number;
            maxRequests: number;
        };
        perConnection: {
            windowMs: number;
            maxRequests: number;
        };
        perUser: {
            windowMs: number;
            maxRequests: number;
        };
    };
    ddosProtection: {
        enabled: boolean;
        maxConnectionsPerIP: number;
        connectionWindowMs: number;
        suspiciousPatternDetection: boolean;
    };
    encryption: {
        algorithm: string;
        keyRotationInterval: number;
        messageEncryption: boolean;
    };
    monitoring: {
        logSecurityEvents: boolean;
        alertThresholds: {
            failedLogins: number;
            suspiciousActivity: number;
            rateLimitViolations: number;
        };
    };
}
export interface SecurityThreat {
    id: string;
    type: 'brute_force' | 'ddos' | 'rate_limit' | 'suspicious_pattern' | 'unauthorized_access';
    severity: 'low' | 'medium' | 'high' | 'critical';
    source: string;
    description: string;
    timestamp: Date;
    metadata: any;
}
export interface SecurityEvent {
    id: string;
    type: string;
    userId?: string;
    connectionId?: string;
    ip: string;
    timestamp: Date;
    details: any;
}
export interface RateLimitBucket {
    count: number;
    resetTime: number;
    blocked: boolean;
}
export declare class EnhancedSecurityManager extends EventEmitter {
    private static instance;
    private config;
    private logger;
    private metrics;
    private globalRateLimits;
    private connectionRateLimits;
    private userRateLimits;
    private connectionCounts;
    private blacklistedIPs;
    private suspiciousPatterns;
    private encryptionKeys;
    private currentKeyId;
    private keyRotationTimer?;
    private securityEvents;
    private activeThreat;
    private failedAttempts;
    private constructor();
    static getInstance(config: SecurityConfig): EnhancedSecurityManager;
    private initialize;
    authenticateConnection(token: string, clientIP: string): Promise<any>;
    private performSecurityChecks;
    private handleAuthenticationFailure;
    checkRateLimit(type: 'global' | 'connection' | 'user', identifier: string): boolean;
    private getRateLimitMap;
    checkDDoSProtection(clientIP: string): boolean;
    encryptMessage(message: any, connectionId: string): Promise<Buffer>;
    decryptMessage(encryptedData: Buffer, connectionId: string): Promise<any>;
    private detectSuspiciousActivity;
    private detectRapidConnections;
    private initializeEncryption;
    private startKeyRotation;
    private rotateEncryptionKey;
    private generateKeyId;
    private startSecurityMonitoring;
    private analyzeSecurityEvents;
    private getRecentSecurityEvents;
    private groupEventsByType;
    private cleanupOldEvents;
    private publishSecurityMetrics;
    private recordSecurityEvent;
    private createThreat;
    validateWebSocketConnection(ws: AuthenticatedWebSocket): boolean;
    getSecurityStatus(): any;
    getActiveThreat(): SecurityThreat[];
    resolveThreat(threatId: string): boolean;
    blacklistIP(ip: string, duration?: number): void;
    whitelistIP(ip: string): void;
    shutdown(): Promise<void>;
}
