import { EventEmitter } from 'events';
export declare enum MetricType {
    COUNTER = "counter",
    GAUGE = "gauge",
    HISTOGRAM = "histogram",
    METER = "meter"
}
export declare enum MetricCategory {
    DEVICE = "device",
    PROTOCOL = "protocol",
    WEBSOCKET = "websocket",
    PERFORMANCE = "performance",
    SECURITY = "security",
    ERROR = "error"
}
export interface MetricValue {
    value: number;
    timestamp: number;
    tags: Record<string, string>;
}
export interface MetricConfig {
    name: string;
    type: MetricType;
    category: MetricCategory;
    description: string;
    unit?: string;
    aggregation?: 'sum' | 'avg' | 'min' | 'max';
    buckets?: number[];
    retentionPeriod?: number;
}
export interface MetricSummary {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50?: number;
    p90?: number;
    p95?: number;
    p99?: number;
}
export interface MetricQuery {
    name?: string;
    category?: MetricCategory;
    type?: MetricType;
    tags?: Record<string, string>;
    startTime?: number;
    endTime?: number;
    limit?: number;
}
export declare class MetricsCollector extends EventEmitter {
    private static instance;
    private metrics;
    private metricValues;
    private logger;
    private cleanupInterval;
    private readonly MAX_VALUES;
    private constructor();
    static getInstance(): MetricsCollector;
    registerMetric(config: MetricConfig): void;
    recordMetric(name: string, value: number, tags?: Record<string, string>): void;
    getMetrics(query?: MetricQuery): Record<string, MetricSummary>;
    getMetricValues(name: string, query?: MetricQuery): MetricValue[];
    getMetricConfig(name: string): MetricConfig | undefined;
    getAllMetricConfigs(): MetricConfig[];
    clearMetric(name: string): void;
    private validateMetricValue;
    private trimOldValues;
    private matchTags;
    private calculateMetricSummary;
    private calculatePercentile;
    private cleanupOldMetrics;
    dispose(): void;
    registerStandardMetrics(): void;
}
