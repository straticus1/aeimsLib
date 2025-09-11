import { EventEmitter } from 'events';
import { Logger } from '../logging/Logger';
import { Database } from '../database/Database';
import { MetricsCollector } from './MetricsCollector';
/**
 * Telemetry Data Types
 */
export declare enum TelemetryType {
    SYSTEM = "system",
    PROCESS = "process",
    MEMORY = "memory",
    NETWORK = "network",
    DEVICE = "device",
    PROTOCOL = "protocol",
    COMMAND = "command",
    ERROR = "error",
    LATENCY = "latency",
    THROUGHPUT = "throughput",
    UTILIZATION = "utilization",
    CUSTOM = "custom"
}
/**
 * Telemetry Data Point
 */
export interface TelemetryPoint {
    id?: string;
    type: TelemetryType | string;
    source?: string;
    timestamp: number;
    values: {
        [key: string]: number | string | boolean;
    };
    context?: {
        deviceId?: string;
        protocol?: string;
        operation?: string;
        [key: string]: any;
    };
    tags?: string[];
}
/**
 * Telemetry Series
 */
export interface TelemetrySeries {
    id: string;
    name: string;
    type: TelemetryType;
    unit?: string;
    description?: string;
    aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
    retention?: number;
    resolution?: number;
    alerts?: Array<{
        condition: string;
        threshold: number;
        severity: 'info' | 'warning' | 'error' | 'critical';
        message: string;
    }>;
}
/**
 * Query Options
 */
export interface TelemetryQueryOptions {
    start?: number;
    end?: number;
    duration?: number;
    series?: string[];
    types?: TelemetryType[];
    sources?: string[];
    tags?: string[];
    aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
    interval?: number;
    groupBy?: string[];
    filter?: string;
    limit?: number;
}
/**
 * Telemetry System Options
 */
interface TelemetrySystemOptions {
    collectInterval?: number;
    batchSize?: number;
    bufferSize?: number;
    storagePrefix?: string;
    retentionDays?: number;
    processWorkers?: number;
    processInterval?: number;
    alertEnabled?: boolean;
    alertInterval?: number;
}
/**
 * Telemetry System
 * Collects, processes, and analyzes telemetry data
 */
export declare class TelemetrySystem extends EventEmitter {
    private database;
    private logger;
    private metrics;
    private options;
    private series;
    private buffer;
    private processTimer?;
    private collectTimer?;
    private alertTimer?;
    constructor(database: Database, logger: Logger, metrics: MetricsCollector, options?: TelemetrySystemOptions);
    /**
     * Initialize telemetry system
     */
    initialize(): Promise<void>;
    /**
     * Register telemetry series
     */
    registerSeries(series: TelemetrySeries): void;
    /**
     * Track telemetry point
     */
    track(point: TelemetryPoint): Promise<void>;
    /**
     * Query telemetry data
     */
    query(options: TelemetryQueryOptions): Promise<TelemetryPoint[]>;
    /**
     * Get telemetry statistics
     */
    getStats(options?: {
        types?: TelemetryType[];
        sources?: string[];
        duration?: number;
    }): Promise<{
        points: number;
        sources: number;
        types: number;
        size: number;
    }>;
    /**
     * Initialize options
     */
    private initializeOptions;
    /**
     * Setup processing timers
     */
    private setupTimers;
    /**
     * Load series definitions
     */
    private loadSeries;
    /**
     * Validate telemetry series
     */
    private validateSeries;
    /**
     * Start telemetry processing
     */
    private startProcessing;
    /**
     * Process telemetry buffer
     */
    private processBuffer;
    /**
     * Process batch of telemetry points
     */
    private processBatch;
    /**
     * Calculate batch statistics
     */
    private calculateStats;
    /**
     * Update telemetry statistics
     */
    private updateStats;
    /**
     * Check alerts for telemetry points
     */
    private checkAlertsForPoints;
    /**
     * Evaluate alert condition
     */
    private evaluateAlert;
    /**
     * Handle triggered alert
     */
    private handleAlert;
    /**
     * Check alerts periodically
     */
    private checkAlerts;
    /**
     * Check alert for series
     */
    private checkSeriesAlert;
    /**
     * Collect system metrics
     */
    private collectMetrics;
    /**
     * Manage data retention
     */
    private manageRetention;
    /**
     * Build database query
     */
    private buildQuery;
    /**
     * Transform query results
     */
    private transformResults;
    /**
     * Aggregate point values
     */
    private aggregateValues;
    /**
     * Generate point ID
     */
    private generatePointId;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
export {};
