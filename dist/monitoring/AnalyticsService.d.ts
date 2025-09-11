import { EventEmitter } from 'events';
import { DeviceEvent } from '../interfaces/device';
export interface DeviceMetrics {
    deviceId: string;
    connectionDuration: number;
    commandCount: number;
    errorCount: number;
    averageLatency: number;
    batteryDrain: number;
    lastSync: Date;
}
export interface SessionMetrics {
    sessionId: string;
    userId: string;
    deviceId: string;
    startTime: Date;
    endTime?: Date;
    duration: number;
    commandCount: number;
    errorCount: number;
    patterns: string[];
    maxIntensity: number;
    averageIntensity: number;
}
export interface PerformanceMetrics {
    timestamp: Date;
    cpuUsage: number;
    memoryUsage: number;
    activeConnections: number;
    messageQueueSize: number;
    commandLatency: number;
}
export declare class AnalyticsService extends EventEmitter {
    private static instance;
    private metrics;
    private sessions;
    private performanceLog;
    private readonly maxPerformanceLogSize;
    private constructor();
    static getInstance(): AnalyticsService;
    trackDeviceMetrics(deviceId: string, event: DeviceEvent): void;
    startSession(sessionId: string, userId: string, deviceId: string): void;
    endSession(sessionId: string): void;
    private startPerformanceMonitoring;
    getDeviceMetrics(deviceId: string): DeviceMetrics | undefined;
    getAllDeviceMetrics(): DeviceMetrics[];
    getSessionMetrics(sessionId: string): SessionMetrics | undefined;
    getUserSessions(userId: string): SessionMetrics[];
    getPerformanceMetrics(timeRange?: {
        start: Date;
        end: Date;
    }): PerformanceMetrics[];
    private createDefaultMetrics;
    private getActiveConnectionCount;
    private getMessageQueueSize;
    private calculateAverageLatency;
    cleanupOldData(retentionPeriod?: number): void;
}
