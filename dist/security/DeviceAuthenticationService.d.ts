import { AuthConfig, Permissions, SecurityContext } from '../interfaces/security';
export declare class DeviceAuthenticationService {
    private static instance;
    private config;
    private tokenBlacklist;
    private analytics;
    private constructor();
    static getInstance(): DeviceAuthenticationService;
    /**
     * Generate a device authentication token
     */
    generateDeviceToken(userId: string, deviceId: string, permissions: Permissions): Promise<string>;
    /**
     * Validate a device authentication token
     */
    validateDeviceToken(token: string): Promise<SecurityContext>;
    /**
     * Revoke a device token
     */
    revokeDeviceToken(token: string): Promise<void>;
    /**
     * Validate specific permissions
     */
    validatePermissions(context: SecurityContext, requiredPermissions: string[]): boolean;
    /**
     * Check if a token has been blacklisted
     */
    private isTokenBlacklisted;
    /**
     * Generate a unique token ID
     */
    private generateTokenId;
    /**
     * Clean up expired entries from the token blacklist
     */
    private cleanupBlacklist;
    /**
     * Log security events
     */
    private logSecurityEvent;
    /**
     * Update authentication configuration
     */
    updateConfig(config: Partial<AuthConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): AuthConfig;
}
