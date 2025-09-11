import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
interface ProfilerOptions {
    sampleInterval: number;
    bufferSize: number;
    historyLength: number;
    latencyThreshold: number;
    stallThreshold: number;
    resourceThreshold: number;
    reportInterval: number;
    metrics: string[];
}
interface ProfilerMetrics {
    avgLatency: number;
    maxLatency: number;
    p95Latency: number;
    p99Latency: number;
    jitter: number;
    commandRate: number;
    commandSuccess: number;
    commandErrors: number;
    queueLength: number;
    memoryUsage: number;
    cpuUsage: number;
    networkBps: number;
    bufferUsage: number;
    patternAccuracy: number;
    syncDeviation: number;
    batteryImpact: number;
}
interface PerformanceSample {
    timestamp: number;
    metrics: ProfilerMetrics;
    events: Array<{
        type: string;
        data: any;
    }>;
}
interface ProfilerReport {
    timeRange: {
        start: number;
        end: number;
    };
    summary: ProfilerMetrics;
    anomalies: Array<{
        type: string;
        severity: 'warning' | 'error';
        metric: string;
        value: number;
        threshold: number;
        timestamp: number;
    }>;
    recommendations: Array<{
        type: string;
        description: string;
        impact: 'low' | 'medium' | 'high';
        metrics: string[];
    }>;
}
/**
 * Performance Profiler
 * Analyzes device and pattern performance with detailed metrics and recommendations
 */
export declare class PerformanceProfiler extends EventEmitter {
    private telemetry;
    private options;
    private samples;
    private sampleTimer?;
    private reportTimer?;
    private startTime;
    constructor(telemetry: TelemetryManager, options?: Partial<ProfilerOptions>);
    /**
     * Start profiling session
     */
    start(): void;
    /**
     * Stop profiling session
     */
    stop(): void;
    /**
     * Add a performance event
     */
    addEvent(type: string, data: any): void;
    /**
     * Get current performance report
     */
    getReport(): Promise<ProfilerReport>;
    /**
     * Get raw performance data
     */
    getRawData(): PerformanceSample[];
    private initializeOptions;
    private startSampling;
    private startReporting;
    private collectSample;
    private collectMetrics;
    private calculateMetrics;
    private detectAnomalies;
    private generateRecommendations;
    private getCurrentSample;
    private isSignificantEvent;
    private calculateAverage;
    private calculateSum;
    private calculateStdDev;
    private calculatePercentile;
}
export {};
