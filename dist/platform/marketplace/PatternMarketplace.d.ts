import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
import { SecurityService } from '../../security/SecurityService';
import { PatternFactory } from '../../patterns/PatternFactory';
interface MarketplaceOptions {
    apiEndpoint: string;
    apiVersion: string;
    timeout: number;
    cacheSize: number;
    cacheTTL: number;
    minRating: number;
    maxRating: number;
    ratingWeight: number;
}
interface PatternMetadata {
    id: string;
    name: string;
    description: string;
    author: {
        id: string;
        name: string;
        verified: boolean;
    };
    category: string;
    tags: string[];
    compatibility: string[];
    version: string;
    created: number;
    updated: number;
    downloads: number;
    rating: {
        average: number;
        count: number;
    };
    pricing?: {
        type: 'free' | 'premium' | 'subscription';
        price?: number;
        currency?: string;
    };
}
interface PatternAsset {
    id: string;
    type: 'preview' | 'thumbnail' | 'video' | 'data';
    url: string;
    size: number;
    format: string;
    checksum: string;
}
interface PatternReview {
    id: string;
    userId: string;
    rating: number;
    comment: string;
    created: number;
    likes: number;
    verified: boolean;
}
interface SearchOptions {
    query?: string;
    category?: string;
    tags?: string[];
    compatibility?: string[];
    rating?: number;
    price?: 'free' | 'premium' | 'all';
    sort?: 'recent' | 'popular' | 'rating';
    page?: number;
    limit?: number;
}
/**
 * Pattern Marketplace
 * Provides pattern discovery, sharing, and management capabilities
 */
export declare class PatternMarketplace extends EventEmitter {
    private security;
    private telemetry;
    private patternFactory;
    private options;
    private cache;
    constructor(security: SecurityService, telemetry: TelemetryManager, patternFactory: PatternFactory, options?: Partial<MarketplaceOptions>);
    /**
     * Search patterns
     */
    searchPatterns(options?: SearchOptions): Promise<{
        patterns: PatternMetadata[];
        total: number;
        page: number;
        pages: number;
    }>;
    /**
     * Get pattern details
     */
    getPattern(id: string): Promise<{
        metadata: PatternMetadata;
        assets: PatternAsset[];
        pattern: any;
    }>;
    /**
     * Get pattern reviews
     */
    getPatternReviews(id: string, options?: {
        page?: number;
        limit?: number;
        sort?: 'recent' | 'rating' | 'likes';
    }): Promise<{
        reviews: PatternReview[];
        total: number;
        page: number;
        pages: number;
    }>;
    /**
     * Submit pattern review
     */
    submitReview(patternId: string, rating: number, comment: string): Promise<PatternReview>;
    /**
     * Download pattern
     */
    downloadPattern(id: string): Promise<any>;
    /**
     * Publish pattern
     */
    publishPattern(pattern: any, metadata: Omit<PatternMetadata, 'id' | 'author' | 'created' | 'updated' | 'downloads' | 'rating'>): Promise<PatternMetadata>;
    /**
     * Update pattern
     */
    updatePattern(id: string, updates: {
        pattern?: any;
        metadata?: Partial<PatternMetadata>;
    }): Promise<PatternMetadata>;
    /**
     * Delete pattern
     */
    deletePattern(id: string): Promise<void>;
    private initializeOptions;
    private apiRequest;
    private getCacheKey;
    private getFromCache;
    private setInCache;
    private removeFromCache;
    private startCacheCleanup;
}
export {};
