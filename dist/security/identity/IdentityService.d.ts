import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
import { DeviceEncryptionService } from '../DeviceEncryptionService';
interface IdentityOptions {
    verificationTimeout?: number;
    verificationRetries?: number;
    verificationCooldown?: number;
    challengeLength?: number;
    challengeTimeout?: number;
    maxChallengeAttempts?: number;
    tokenExpiry?: number;
    refreshTokenExpiry?: number;
    minPasswordLength?: number;
    requireMFA?: boolean;
    mfaTimeout?: number;
}
interface IdentityChallenge {
    id: string;
    type: 'password' | 'mfa' | 'device';
    challenge: string;
    timestamp: number;
    attempts: number;
    verified: boolean;
}
interface IdentityToken {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    refreshExpiresAt: number;
}
/**
 * Identity Verification Service
 * Handles device and user identity verification, challenges, and token management
 */
export declare class IdentityService extends EventEmitter {
    private encryption;
    private telemetry;
    private options;
    private states;
    private challenges;
    constructor(encryption: DeviceEncryptionService, telemetry: TelemetryManager, options?: Partial<IdentityOptions>);
    /**
     * Start identity verification for a device or user
     */
    startVerification(id: string, type: 'password' | 'mfa' | 'device'): Promise<IdentityChallenge>;
    /**
     * Verify challenge response
     */
    verifyChallenge(id: string, challengeId: string, response: string): Promise<IdentityToken>;
    /**
     * Refresh an expired token
     */
    refreshToken(id: string, refreshToken: string): Promise<IdentityToken>;
    /**
     * Revoke all tokens for an identity
     */
    revokeTokens(id: string): Promise<void>;
    private initializeOptions;
    private getState;
    private generateChallenge;
    private verifyResponse;
    private verifyPassword;
    private verifyMFA;
    private verifyDevice;
    private generateToken;
}
export {};
