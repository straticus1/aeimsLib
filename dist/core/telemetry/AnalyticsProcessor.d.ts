import { TelemetryManager } from './TelemetryManager';
import { MetricsCollector } from './MetricsCollector';
interface AnalyticsPeriod {
    start: number;
    end: number;
    resolution: 'minute' | 'hour' | 'day';
}
interface UsageMetrics {
    activeUsers: number;
    activeDevices: number;
    totalSessions: number;
    avgSessionDuration: number;
    patternUsage: Record<string, number>;
    deviceTypeUsage: Record<string, number>;
}
interface PerformanceMetrics {
    avgLatency: number;
    p95Latency: number;
    errorRate: number;
    deviceErrors: Record<string, number>;
    patternErrors: Record<string, number>;
}
interface UserExperienceMetrics {
    sessionCompletionRate: number;
    avgPatternDuration: number;
    patternSuccessRate: Record<string, number>;
    deviceReliability: Record<string, number>;
}
/**
 * AnalyticsProcessor
 * Processes telemetry data into actionable insights.
 */
export declare class AnalyticsProcessor {
    private telemetry;
    private metrics;
    private sessionData;
    constructor(telemetry: TelemetryManager, metrics: MetricsCollector);
    /**
     * Get usage analytics for a time period
     */
    getUsageAnalytics(period: AnalyticsPeriod): Promise<UsageMetrics>;
    /**
     * Get performance analytics for a time period
     */
    getPerformanceAnalytics(period: AnalyticsPeriod): Promise<PerformanceMetrics>;
    /**
     * Get user experience analytics for a time period
     */
    getUserExperienceAnalytics(period: AnalyticsPeriod): Promise<UserExperienceMetrics>;
    private setupListeners;
    private getEventsInPeriod;
    private countEventsInPeriod;
}
export {};
