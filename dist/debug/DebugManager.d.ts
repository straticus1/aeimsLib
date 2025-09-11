import { EventEmitter } from 'events';
import { DeviceManager } from '../core/DeviceManager';
import { Pattern } from '../patterns/Pattern';
import { TelemetryManager } from '../core/telemetry/TelemetryManager';
import { MetricsCollector } from '../core/telemetry/MetricsCollector';
interface LatencyAnalysis {
    average: number;
    p50: number;
    p90: number;
    p99: number;
    histogram: Record<string, number>;
    trends: {
        window: number;
        values: number[];
    }[];
}
interface PatternVisualization {
    timeline: {
        time: number;
        intensity: number;
        type: string;
        metadata?: Record<string, any>;
    }[];
    heatmap?: {
        x: number;
        y: number;
        intensity: number;
    }[];
    stats: {
        minIntensity: number;
        maxIntensity: number;
        avgIntensity: number;
        duration: number;
        transitions: number;
    };
}
interface DeviceSnapshot {
    timestamp: number;
    deviceId: string;
    state: {
        connected: boolean;
        pattern?: string;
        intensity?: number;
        mode?: string;
    };
    metrics: {
        latency?: number;
        battery?: number;
        temperature?: number;
        errors?: number;
    };
    history: {
        commands: {
            type: string;
            timestamp: number;
            success: boolean;
        }[];
        patterns: {
            id: string;
            startTime: number;
            endTime?: number;
        }[];
    };
}
/**
 * DebugManager
 * Advanced debugging and analysis tools for device control system.
 */
export declare class DebugManager extends EventEmitter {
    private deviceManager;
    private telemetry;
    private metrics;
    private latencyBuffer;
    private patternHistory;
    private deviceSnapshots;
    constructor(deviceManager: DeviceManager, telemetry: TelemetryManager, metrics: MetricsCollector);
    /**
     * Analyze command latency for a device
     */
    analyzeLatency(deviceId: string, options?: {
        window?: number;
        bucketSize?: number;
    }): LatencyAnalysis;
    /**
     * Visualize a pattern's behavior
     */
    visualizePattern(pattern: Pattern): PatternVisualization;
    /**
     * Take a snapshot of device state
     */
    takeDeviceSnapshot(deviceId: string): Promise<DeviceSnapshot>;
    /**
     * Get device history
     */
    getDeviceHistory(deviceId: string, options?: {
        startTime?: number;
        endTime?: number;
        limit?: number;
    }): DeviceSnapshot[];
    /**
     * Compare pattern executions
     */
    comparePatternExecutions(pattern: Pattern, executions: {
        deviceId: string;
        startTime: number;
        endTime: number;
    }[]): {
        pattern: PatternVisualization;
        executions: {
            deviceId: string;
            duration: number;
            latency: {
                avg: number | null;
                p90: number | null;
            };
            events: any;
            deviation: number;
        }[];
        analysis: {
            durationVariance: number;
            latencyVariance: number;
            deviationStats: {
                min: number;
                max: number;
                avg: number;
            };
        };
    };
    /**
     * Generate a debug report
     */
    generateDebugReport(deviceId: string, timeRange: {
        start: number;
        end: number;
    }): Promise<{
        device: {
            id: string;
            type: any;
            firmware: any;
            capabilities: any;
        };
        timeRange: {
            start: number;
            end: number;
        };
        snapshots: DeviceSnapshot[];
        latencyAnalysis: LatencyAnalysis;
        metrics: {
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
        events: any;
        patterns: any;
        summary: {
            totalPatterns: any;
            successRate: number;
            avgLatency: number | null;
            errorRate: number;
            disconnections: any;
        };
    }>;
    private initializeMonitoring;
    private generatePatternHeatmap;
    private calculatePatternDeviation;
    private calculateVariance;
    private percentile;
}
export {};
