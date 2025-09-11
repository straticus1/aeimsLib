import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
interface OAuth2Options {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    authorizeEndpoint: string;
    tokenEndpoint: string;
    userinfoEndpoint?: string;
    scope?: string[];
    responseType?: 'code' | 'token';
    grantType?: 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token';
    tokenExpiryBuffer?: number;
}
interface OAuth2Token {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    refreshToken?: string;
    scope?: string;
}
/**
 * OAuth2 Authentication Service
 * Handles OAuth2 authentication flows and token management
 */
export declare class OAuth2Service extends EventEmitter {
    private options;
    private telemetry;
    private states;
    private tokens;
    constructor(options: OAuth2Options, telemetry: TelemetryManager);
    /**
     * Generate authorization URL for OAuth2 flow
     */
    generateAuthUrl(): Promise<{
        url: string;
        state: string;
    }>;
    /**
     * Handle OAuth2 callback and exchange code for tokens
     */
    handleCallback(state: string, code: string): Promise<OAuth2Token>;
    /**
     * Refresh an expired access token
     */
    refreshToken(state: string, refreshToken: string): Promise<OAuth2Token>;
    /**
     * Get user info using access token
     */
    getUserInfo(accessToken: string): Promise<any>;
    /**
     * Revoke tokens for a state
     */
    revokeTokens(state: string): Promise<void>;
    /**
     * Clean up expired states
     */
    private cleanupStates;
    private generateRandomString;
    private generateCodeChallenge;
}
export {};
