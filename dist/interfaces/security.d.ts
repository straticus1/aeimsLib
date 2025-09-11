/**
 * Encryption configuration interface
 */
export interface EncryptionConfig {
    enabled: boolean;
    algorithm: string;
    keySize: number;
    iv?: Buffer;
    authTagLength?: number;
}
/**
 * Encryption key management
 */
export interface KeyManagement {
    generateKey(): Promise<Buffer>;
    rotateKey(): Promise<void>;
    getActiveKey(): Promise<Buffer>;
    revokeKey(keyId: string): Promise<void>;
}
/**
 * Authentication configuration
 */
export interface AuthConfig {
    type: 'jwt' | 'oauth2' | 'basic';
    secret?: string;
    publicKey?: string;
    privateKey?: string;
    tokenExpiration: number;
    refreshTokenExpiration: number;
}
/**
 * User permissions
 */
export interface Permissions {
    canControl: boolean;
    canConfigure: boolean;
    canMonitor: boolean;
    allowedPatterns: string[];
    maxIntensity: number;
    timeRestrictions?: {
        start: string;
        end: string;
        timezone: string;
    };
}
/**
 * Authentication token payload
 */
export interface TokenPayload {
    userId: string;
    deviceId?: string;
    permissions: Permissions;
    sessionId?: string;
    exp: number;
    iat: number;
}
/**
 * Session security context
 */
export interface SecurityContext {
    userId: string;
    deviceId: string;
    sessionId: string;
    permissions: Permissions;
    encryptionKey: Buffer;
    authenticated: boolean;
    lastActivity: Date;
}
/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    message: string;
}
/**
 * Security audit log entry
 */
export interface AuditLogEntry {
    timestamp: Date;
    userId: string;
    deviceId?: string;
    action: string;
    resource: string;
    status: 'success' | 'failure';
    details?: any;
    ip?: string;
    userAgent?: string;
}
/**
 * Security policy configuration
 */
export interface SecurityPolicy {
    encryption: EncryptionConfig;
    authentication: AuthConfig;
    rateLimit: RateLimitConfig;
    audit: {
        enabled: boolean;
        retention: number;
        detailLevel: 'basic' | 'detailed';
    };
}
/**
 * Encrypted data container
 */
export interface EncryptedData {
    iv: Buffer;
    data: Buffer;
    authTag?: Buffer;
    algorithm: string;
    keyId: string;
}
/**
 * Security service interface
 */
export interface SecurityService {
    initialize(policy: SecurityPolicy): Promise<void>;
    encrypt(data: Buffer): Promise<EncryptedData>;
    decrypt(encrypted: EncryptedData): Promise<Buffer>;
    generateToken(payload: Partial<TokenPayload>): Promise<string>;
    verifyToken(token: string): Promise<TokenPayload>;
    createSecurityContext(token: string): Promise<SecurityContext>;
    validatePermissions(context: SecurityContext, action: string): boolean;
    logAudit(entry: AuditLogEntry): Promise<void>;
    enforceRateLimit(userId: string, action: string): Promise<boolean>;
}
/**
 * Two-factor authentication configuration
 */
export interface TwoFactorConfig {
    enabled: boolean;
    type: 'totp' | 'sms' | 'email';
    issuer: string;
    digits: number;
    window: number;
}
/**
 * Device encryption protocol
 */
export interface DeviceEncryption {
    initialize(config: EncryptionConfig): Promise<void>;
    encryptCommand(command: Buffer): Promise<Buffer>;
    decryptResponse(response: Buffer): Promise<Buffer>;
    rotateKeys(): Promise<void>;
    validateConnection(): Promise<boolean>;
}
/**
 * Security event types
 */
export declare enum SecurityEventType {
    AUTH_SUCCESS = "auth_success",
    AUTH_FAILURE = "auth_failure",
    TOKEN_GENERATED = "token_generated",
    TOKEN_REVOKED = "token_revoked",
    ENCRYPTION_ERROR = "encryption_error",
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
    PERMISSION_DENIED = "permission_denied",
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
}
/**
 * Security event interface
 */
export interface SecurityEvent {
    type: SecurityEventType;
    timestamp: Date;
    userId?: string;
    deviceId?: string;
    sessionId?: string;
    details: any;
    severity: 'low' | 'medium' | 'high' | 'critical';
}
