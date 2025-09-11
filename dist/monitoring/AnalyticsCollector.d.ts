import { EventEmitter } from 'events';
import { Device } from '../interfaces/device';
export declare enum AnalyticsEventType {
    DEVICE_CONNECTED = "device_connected",
    DEVICE_DISCONNECTED = "device_disconnected",
    COMMAND_SENT = "command_sent",
    COMMAND_COMPLETED = "command_completed",
    COMMAND_FAILED = "command_failed",
    PATTERN_STARTED = "pattern_started",
    PATTERN_STOPPED = "pattern_stopped",
    PATTERN_MODIFIED = "pattern_modified",
    SESSION_STARTED = "session_started",
    SESSION_ENDED = "session_ended",
    ERROR_OCCURRED = "error_occurred",
    STATE_CHANGED = "state_changed",
    FEATURE_USED = "feature_used"
}
export interface AnalyticsEvent {
    type: AnalyticsEventType;
    timestamp: number;
    deviceId?: string;
    userId?: string;
    sessionId?: string;
    data?: Record<string, any>;
    duration?: number;
    success?: boolean;
    error?: Error;
    metadata?: Record<string, string>;
}
export interface DeviceUsageStats {
    deviceId: string;
    totalConnections: number;
    totalCommandsSent: number;
    totalCommandsFailed: number;
    totalPatternRuns: number;
    totalSessionTime: number;
    averageSessionDuration: number;
    lastSeen: number;
    topFeatures: Array<{
        feature: string;
        count: number;
    }>;
    errorRates: Record<string, number>;
}
export interface AnalyticsSnapshot {
    events: AnalyticsEvent[];
    deviceStats: Record<string, DeviceUsageStats>;
    period: {
        start: number;
        end: number;
    };
}
export interface EventFilter {
    types?: AnalyticsEventType[];
    deviceIds?: string[];
    userIds?: string[];
    sessionIds?: string[];
    startTime?: number;
    endTime?: number;
    limit?: number;
}
export declare class AnalyticsCollector extends EventEmitter {
    private static instance;
    private events;
    private deviceStats;
    private activeSessions;
    private logger;
    private retentionPeriodMs;
    private readonly maxEventsPerDevice;
    private flushInterval;
    private readonly defaultFlushIntervalMs;
    private constructor();
    static getInstance(): AnalyticsCollector;
    trackEvent(event: AnalyticsEvent): void;
    trackDeviceConnection(device: Device, userId?: string, sessionId?: string): void;
    trackDeviceDisconnection(deviceId: string, userId?: string, sessionId?: string): void;
    trackCommandExecution(deviceId: string, commandType: string, success: boolean, duration: number, error?: Error, metadata?: Record<string, string>): void;
    trackPatternUsage(deviceId: string, patternId: string, action: 'start' | 'stop' | 'modify', params?: Record<string, any>, metadata?: Record<string, string>): void;
    startSession(sessionId: string, userId?: string): void;
    endSession(sessionId: string, userId?: string): void;
    trackError(error: Error, context: Record<string, any>, deviceId?: string, userId?: string, sessionId?: string): void;
    trackStateChange(deviceId: string, stateKey: string, oldValue: any, newValue: any, metadata?: Record<string, string>): void;
    trackFeatureUsage(feature: string, deviceId?: string, userId?: string, sessionId?: string, metadata?: Record<string, string>): void;
    queryEvents(filter?: EventFilter): AnalyticsEvent[];
    getDeviceStats(deviceId: string): DeviceUsageStats | undefined;
    getAllDeviceStats(): DeviceUsageStats[];
    getSnapshot(startTime?: number, endTime?: number): AnalyticsSnapshot;
    setRetentionPeriod(days: number): void;
    private startPeriodicFlush;
    private flush;
    private cleanupOldEvents;
    private getOrCreateDeviceStats;
    private updateDeviceStats;
    dispose(): void;
}
