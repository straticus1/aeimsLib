import { MetricsCollector, MetricType, MetricCategory } from './MetricsCollector';
import { AnalyticsCollector, AnalyticsEventType, AnalyticsEvent, DeviceUsageStats, AnalyticsSnapshot } from './AnalyticsCollector';
import { DeviceManager } from '../devices/DeviceManager';
export { MetricsCollector, MetricType, MetricCategory, AnalyticsCollector, AnalyticsEventType, AnalyticsEvent, DeviceUsageStats, AnalyticsSnapshot };
/**
 * Initialize monitoring system with default configuration.
 */
export interface MonitoringOptions {
    deviceManager?: DeviceManager;
    aeims?: any;
    syncInterval?: number;
}
export declare function initializeMonitoring(options?: MonitoringOptions): void;
/**
 * Shutdown monitoring system and cleanup resources.
 */
export declare function shutdownMonitoring(): void;
export declare function getDeviceMonitor(deviceId: string): DeviceMonitoring;
export declare function getSessionMonitor(sessionId: string, userId?: string): SessionMonitoring;
export declare class DeviceMonitoring {
    private deviceId;
    private metrics;
    private analytics;
    constructor(deviceId: string);
    onConnect(userId?: string, sessionId?: string): void;
    onDisconnect(userId?: string, sessionId?: string): void;
    onCommandStart(commandType: string): void;
    onCommandComplete(commandType: string, duration: number, success: boolean, error?: Error): void;
    onError(error: Error, context: Record<string, any>): void;
    onStateChange(stateKey: string, oldValue: any, newValue: any, metadata?: Record<string, string>): void;
    onPatternUsage(patternId: string, action: 'start' | 'stop' | 'modify', params?: Record<string, any>): void;
    onFeatureUsed(feature: string, userId?: string, sessionId?: string): void;
    recordPerformanceMetric(name: string, value: number, tags?: Record<string, string>): void;
    getDeviceStats(): DeviceUsageStats | undefined;
}
/**
 * Helper class to simplify monitoring integration in session-related code.
 */
export declare class SessionMonitoring {
    private sessionId;
    private userId?;
    private analytics;
    constructor(sessionId: string, userId?: string);
    start(): void;
    end(): void;
    onFeatureUsed(feature: string, deviceId?: string): void;
    onError(error: Error, context: Record<string, any>, deviceId?: string): void;
}
