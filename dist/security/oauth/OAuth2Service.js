"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuth2Service = void 0;
const events_1 = require("events");
/**
 * OAuth2 Authentication Service
 * Handles OAuth2 authentication flows and token management
 */
class OAuth2Service extends events_1.EventEmitter {
    constructor(options, telemetry) {
        super();
        this.options = options;
        this.telemetry = telemetry;
        this.states = new Map();
        this.tokens = new Map();
    }
    /**
     * Generate authorization URL for OAuth2 flow
     */
    async generateAuthUrl() {
        // Generate state and PKCE values
        const state = this.generateRandomString(32);
        const codeVerifier = this.generateRandomString(64);
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        const nonce = this.generateRandomString(16);
        // Store state
        this.states.set(state, {
            state,
            codeVerifier,
            nonce,
            timestamp: Date.now()
        });
        // Build auth URL
        const params = new URLSearchParams({
            client_id: this.options.clientId,
            redirect_uri: this.options.redirectUri,
            response_type: this.options.responseType || 'code',
            state,
            scope: (this.options.scope || []).join(' '),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            nonce
        });
        const url = `${this.options.authorizeEndpoint}?${params.toString()}`;
        // Track auth request
        await this.telemetry.track({
            type: 'oauth2_auth_request',
            timestamp: Date.now(),
            data: {
                state,
                scope: this.options.scope,
                responseType: this.options.responseType
            }
        });
        return { url, state };
    }
    /**
     * Handle OAuth2 callback and exchange code for tokens
     */
    async handleCallback(state, code) {
        const savedState = this.states.get(state);
        if (!savedState) {
            throw new Error('Invalid state');
        }
        // Clean up state
        this.states.delete(state);
        // Exchange code for token
        const params = new URLSearchParams({
            client_id: this.options.clientId,
            client_secret: this.options.clientSecret,
            redirect_uri: this.options.redirectUri,
            code,
            grant_type: 'authorization_code',
            code_verifier: savedState.codeVerifier
        });
        try {
            const response = await fetch(this.options.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });
            if (!response.ok) {
                throw new Error('Token exchange failed');
            }
            const data = await response.json();
            const token = {
                accessToken: data.access_token,
                tokenType: data.token_type,
                expiresIn: data.expires_in,
                refreshToken: data.refresh_token,
                scope: data.scope
            };
            // Store token
            this.tokens.set(state, token);
            // Track success
            await this.telemetry.track({
                type: 'oauth2_token_exchange',
                timestamp: Date.now(),
                data: {
                    state,
                    scope: token.scope,
                    expiresIn: token.expiresIn
                }
            });
            return token;
        }
        catch (error) {
            // Track failure
            await this.telemetry.track({
                type: 'oauth2_token_exchange_error',
                timestamp: Date.now(),
                data: {
                    state,
                    error: error.message
                }
            });
            throw error;
        }
    }
    /**
     * Refresh an expired access token
     */
    async refreshToken(state, refreshToken) {
        const params = new URLSearchParams({
            client_id: this.options.clientId,
            client_secret: this.options.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        });
        try {
            const response = await fetch(this.options.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });
            if (!response.ok) {
                throw new Error('Token refresh failed');
            }
            const data = await response.json();
            const token = {
                accessToken: data.access_token,
                tokenType: data.token_type,
                expiresIn: data.expires_in,
                refreshToken: data.refresh_token || refreshToken,
                scope: data.scope
            };
            // Update stored token
            this.tokens.set(state, token);
            // Track refresh
            await this.telemetry.track({
                type: 'oauth2_token_refresh',
                timestamp: Date.now(),
                data: {
                    state,
                    scope: token.scope,
                    expiresIn: token.expiresIn
                }
            });
            return token;
        }
        catch (error) {
            // Track failure
            await this.telemetry.track({
                type: 'oauth2_token_refresh_error',
                timestamp: Date.now(),
                data: {
                    state,
                    error: error.message
                }
            });
            throw error;
        }
    }
    /**
     * Get user info using access token
     */
    async getUserInfo(accessToken) {
        if (!this.options.userinfoEndpoint) {
            throw new Error('Userinfo endpoint not configured');
        }
        const response = await fetch(this.options.userinfoEndpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to get user info');
        }
        return response.json();
    }
    /**
     * Revoke tokens for a state
     */
    async revokeTokens(state) {
        this.tokens.delete(state);
        // Track revocation
        await this.telemetry.track({
            type: 'oauth2_tokens_revoked',
            timestamp: Date.now(),
            data: { state }
        });
    }
    /**
     * Clean up expired states
     */
    cleanupStates() {
        const now = Date.now();
        for (const [state, data] of this.states.entries()) {
            if (now - data.timestamp > 3600000) { // 1 hour
                this.states.delete(state);
            }
        }
    }
    generateRandomString(length) {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const randomValues = new Uint8Array(length);
        crypto.getRandomValues(randomValues);
        for (let i = 0; i < length; i++) {
            result += charset[randomValues[i] % charset.length];
        }
        return result;
    }
    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
}
exports.OAuth2Service = OAuth2Service;
//# sourceMappingURL=OAuth2Service.js.map