import { TelemetryManager } from './TelemetryManager';
type MetricType = 'counter' | 'gauge' | 'histogram';
interface MetricDefinition {
    name: string;
    type: MetricType;
    description: string;
    labels?: string[];
    buckets?: number[];
}
interface MetricValue {
    value: number;
    labels?: Record<string, string>;
    timestamp: number;
}
/**
 * MetricsCollector
 * Aggregates telemetry data into metrics for analysis.
 */
export declare class MetricsCollector {
    private telemetry;
    private metrics;
    private values;
    constructor(telemetry: TelemetryManager);
    /**
     * Register a new metric
     */
    registerMetric(metric: MetricDefinition): void;
    /**
     * Record a value for a metric
     */
    recordMetric(name: string, value: number, labels?: Record<string, string>): void;
    /**
     * Get metric values
     */
    getMetricValues(name: string, timeRange?: {
        start: number;
        end: number;
    }): MetricValue[];
    /**
     * Get metric statistics
     */
    getMetricStats(name: string, timeRange?: {
        start: number;
        end: number;
    }): {
        count: number;
        min: null;
        max: null;
        avg: null;
        p50: null;
        p90: null;
        p99: null;
    } | {
        count: number;
        min: number;
        max: number;
        avg: number;
        p50: number;
        p90: number;
        p99: number;
    };
    /**
     * Get all metrics
     */
    getMetrics(): MetricDefinition[];
    private initializeDefaultMetrics;
    private setupTelemetryListeners;
    private processEvent;
    private percentile;
}
export {};
