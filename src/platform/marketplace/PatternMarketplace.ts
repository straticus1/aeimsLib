import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
import { SecurityService } from '../../security/SecurityService';
import { PatternFactory } from '../../patterns/PatternFactory';

interface MarketplaceOptions {
  // API settings
  apiEndpoint: string;
  apiVersion: string;
  timeout: number;

  // Cache settings
  cacheSize: number;
  cacheTTL: number;

  // Rating settings
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
export class PatternMarketplace extends EventEmitter {
  private options: Required<MarketplaceOptions>;
  private cache: Map<string, {
    data: any;
    expires: number;
  }> = new Map();

  constructor(
    private security: SecurityService,
    private telemetry: TelemetryManager,
    private patternFactory: PatternFactory,
    options: Partial<MarketplaceOptions> = {}
  ) {
    super();
    this.options = this.initializeOptions(options);
    this.startCacheCleanup();
  }

  /**
   * Search patterns
   */
  async searchPatterns(options: SearchOptions = {}): Promise<{
    patterns: PatternMetadata[];
    total: number;
    page: number;
    pages: number;
  }> {
    const cacheKey = this.getCacheKey('search', options);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

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
  async getPattern(id: string): Promise<{
    metadata: PatternMetadata;
    assets: PatternAsset[];
    pattern: any;
  }> {
    const cacheKey = this.getCacheKey('pattern', id);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

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
  async getPatternReviews(
    id: string,
    options: {
      page?: number;
      limit?: number;
      sort?: 'recent' | 'rating' | 'likes';
    } = {}
  ): Promise<{
    reviews: PatternReview[];
    total: number;
    page: number;
    pages: number;
  }> {
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
  async submitReview(
    patternId: string,
    rating: number,
    comment: string
  ): Promise<PatternReview> {
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
  async downloadPattern(id: string): Promise<any> {
    const response = await this.apiRequest('GET', `/patterns/${id}/download`);

    // Track download
    await this.telemetry.track({
      type: 'marketplace_pattern_download',
      timestamp: Date.now(),
      data: {
        patternId: id
      }
    });

    return this.patternFactory.create(
      response.pattern.type,
      response.pattern.params
    );
  }

  /**
   * Publish pattern
   */
  async publishPattern(
    pattern: any,
    metadata: Omit<PatternMetadata, 'id' | 'author' | 'created' | 'updated' | 'downloads' | 'rating'>
  ): Promise<PatternMetadata> {
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
  async updatePattern(
    id: string,
    updates: {
      pattern?: any;
      metadata?: Partial<PatternMetadata>;
    }
  ): Promise<PatternMetadata> {
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
  async deletePattern(id: string): Promise<void> {
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

  private initializeOptions(options: Partial<MarketplaceOptions>): Required<MarketplaceOptions> {
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

  private async apiRequest(
    method: string,
    path: string,
    options: {
      params?: any;
      body?: any;
    } = {}
  ): Promise<any> {
    const url = new URL(
      `${this.options.apiEndpoint}/${this.options.apiVersion}${path}`
    );

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

  private getCacheKey(type: string, data: any): string {
    return `${type}:${JSON.stringify(data)}`;
  }

  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setInCache(key: string, data: any): void {
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

  private removeFromCache(key: string): void {
    this.cache.delete(key);
  }

  private startCacheCleanup(): void {
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
