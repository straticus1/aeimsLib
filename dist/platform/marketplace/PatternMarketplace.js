"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternMarketplace = void 0;
const events_1 = require("events");
/**
 * Pattern Marketplace
 * Provides pattern discovery, sharing, and management capabilities
 */
class PatternMarketplace extends events_1.EventEmitter {
    constructor(security, telemetry, patternFactory, options = {}) {
        super();
        this.security = security;
        this.telemetry = telemetry;
        this.patternFactory = patternFactory;
        this.cache = new Map();
        this.options = this.initializeOptions(options);
        this.startCacheCleanup();
    }
    /**
     * Search patterns
     */
    async searchPatterns(options = {}) {
        const cacheKey = this.getCacheKey('search', options);
        const cached = this.getFromCache(cacheKey);
        if (cached)
            return cached;
        const response = await this.apiRequest('GET', '/patterns/search', {
            params: options
        });
        this.setInCache(cacheKey, response);
        // Track search
        await this.telemetry.track({
            type: 'marketplace_search',
            timestamp: Date.now(),
            data: {
                options,
                results: response.total
            }
        });
        return response;
    }
    /**
     * Get pattern details
     */
    async getPattern(id) {
        const cacheKey = this.getCacheKey('pattern', id);
        const cached = this.getFromCache(cacheKey);
        if (cached)
            return cached;
        const response = await this.apiRequest('GET', `/patterns/${id}`);
        this.setInCache(cacheKey, response);
        // Track view
        await this.telemetry.track({
            type: 'marketplace_pattern_view',
            timestamp: Date.now(),
            data: {
                patternId: id
            }
        });
        return response;
    }
    /**
     * Get pattern reviews
     */
    async getPatternReviews(id, options = {}) {
        const response = await this.apiRequest('GET', `/patterns/${id}/reviews`, {
            params: options
        });
        // Track reviews view
        await this.telemetry.track({
            type: 'marketplace_reviews_view',
            timestamp: Date.now(),
            data: {
                patternId: id,
                options
            }
        });
        return response;
    }
    /**
     * Submit pattern review
     */
    async submitReview(patternId, rating, comment) {
        if (rating < this.options.minRating || rating > this.options.maxRating) {
            throw new Error(`Rating must be between ${this.options.minRating} and ${this.options.maxRating}`);
        }
        const response = await this.apiRequest('POST', `/patterns/${patternId}/reviews`, {
            body: {
                rating,
                comment
            }
        });
        // Invalidate pattern cache
        this.removeFromCache(this.getCacheKey('pattern', patternId));
        // Track review submission
        await this.telemetry.track({
            type: 'marketplace_review_submit',
            timestamp: Date.now(),
            data: {
                patternId,
                rating
            }
        });
        return response;
    }
    /**
     * Download pattern
     */
    async downloadPattern(id) {
        const response = await this.apiRequest('GET', `/patterns/${id}/download`);
        // Track download
        await this.telemetry.track({
            type: 'marketplace_pattern_download',
            timestamp: Date.now(),
            data: {
                patternId: id
            }
        });
        return this.patternFactory.create(response.pattern.type, response.pattern.params);
    }
    /**
     * Publish pattern
     */
    async publishPattern(pattern, metadata) {
        const response = await this.apiRequest('POST', '/patterns', {
            body: {
                pattern,
                metadata
            }
        });
        // Track publish
        await this.telemetry.track({
            type: 'marketplace_pattern_publish',
            timestamp: Date.now(),
            data: {
                pattern: response
            }
        });
        return response;
    }
    /**
     * Update pattern
     */
    async updatePattern(id, updates) {
        const response = await this.apiRequest('PUT', `/patterns/${id}`, {
            body: updates
        });
        // Invalidate caches
        this.removeFromCache(this.getCacheKey('pattern', id));
        // Track update
        await this.telemetry.track({
            type: 'marketplace_pattern_update',
            timestamp: Date.now(),
            data: {
                patternId: id,
                updates
            }
        });
        return response;
    }
    /**
     * Delete pattern
     */
    async deletePattern(id) {
        await this.apiRequest('DELETE', `/patterns/${id}`);
        // Invalidate caches
        this.removeFromCache(this.getCacheKey('pattern', id));
        // Track deletion
        await this.telemetry.track({
            type: 'marketplace_pattern_delete',
            timestamp: Date.now(),
            data: {
                patternId: id
            }
        });
    }
    initializeOptions(options) {
        return {
            apiEndpoint: options.apiEndpoint || 'https://api.aeims.dev/marketplace',
            apiVersion: options.apiVersion || 'v1',
            timeout: options.timeout || 30000,
            cacheSize: options.cacheSize || 1000,
            cacheTTL: options.cacheTTL || 300000, // 5 minutes
            minRating: options.minRating || 1,
            maxRating: options.maxRating || 5,
            ratingWeight: options.ratingWeight || 1
        };
    }
    async apiRequest(method, path, options = {}) {
        const url = new URL(`${this.options.apiEndpoint}/${this.options.apiVersion}${path}`);
        if (options.params) {
            Object.entries(options.params).forEach(([key, value]) => {
                if (value !== undefined) {
                    url.searchParams.append(key, String(value));
                }
            });
        }
        const response = await fetch(url.toString(), {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                // Add auth headers using SecurityService
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: AbortSignal.timeout(this.options.timeout)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'API request failed');
        }
        return response.json();
    }
    getCacheKey(type, data) {
        return `${type}:${JSON.stringify(data)}`;
    }
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached)
            return null;
        if (Date.now() > cached.expires) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }
    setInCache(key, data) {
        // Enforce cache size limit
        while (this.cache.size >= this.options.cacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, {
            data,
            expires: Date.now() + this.options.cacheTTL
        });
    }
    removeFromCache(key) {
        this.cache.delete(key);
    }
    startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this.cache.entries()) {
                if (now > value.expires) {
                    this.cache.delete(key);
                }
            }
        }, 60000); // Clean up every minute
    }
}
exports.PatternMarketplace = PatternMarketplace;
//# sourceMappingURL=PatternMarketplace.js.map