import { EventEmitter } from 'events';
import { Pattern } from '../patterns/Pattern';
import { DeviceManager } from '../core/DeviceManager';
import { TelemetryManager } from '../core/telemetry/TelemetryManager';
import { AnalyticsProcessor } from '../core/telemetry/AnalyticsProcessor';
interface OptimizationConfig {
    objective: 'engagement' | 'satisfaction' | 'effectiveness';
    constraints: {
        minIntensity?: number;
        maxIntensity?: number;
        minDuration?: number;
        maxDuration?: number;
        allowedFeatures?: string[];
    };
    parameters: {
        populationSize?: number;
        generations?: number;
        mutationRate?: number;
        crossoverRate?: number;
    };
}
/**
 * AIPatternEnhancer
 * ML-powered pattern generation and optimization.
 */
export declare class AIPatternEnhancer extends EventEmitter {
    private deviceManager;
    private telemetry;
    private analytics;
    private userPreferences;
    private patternFeatures;
    private modelCache;
    constructor(deviceManager: DeviceManager, telemetry: TelemetryManager, analytics: AnalyticsProcessor);
    /**
     * Generate a personalized pattern
     */
    generatePattern(userId: string, type: string, constraints?: {
        duration?: number;
        intensity?: number;
        features?: string[];
    }): Promise<Pattern>;
    /**
     * Optimize an existing pattern
     */
    optimizePattern(pattern: Pattern, config: OptimizationConfig): Promise<Pattern>;
    /**
     * Record user feedback
     */
    recordFeedback(userId: string, patternId: string, rating: number, metadata?: Record<string, any>): Promise<void>;
    /**
     * Get pattern recommendations
     */
    getRecommendations(userId: string, count?: number): Promise<Pattern[]>;
    private initializeModels;
    private getUserPreferences;
    private getModel;
    private generateBasePattern;
    private enhancePattern;
    private extractPatternFeatures;
    private generatePopulation;
    private evaluatePattern;
    private selectPatterns;
    private evolvePopulation;
    private validateConstraints;
    private updateFeatureWeights;
    private findSimilarUsers;
    private getCollaborativePatterns;
    private getContentBasedPatterns;
    private predictRating;
}
export {};
