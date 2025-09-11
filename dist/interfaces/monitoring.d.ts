import { DeviceStatus } from './device';
import { WebSocketStats } from './websocket';
/**
 * Metric types
 */
export declare enum MetricType {
    COUNTER = "counter",
    GAUGE = "gauge",
    HISTOGRAM = "histogram",
    SUMMARY = "summary"
}
/**
 * Metric labels
 */
export interface MetricLabels {
    [key: string]: string | number;
}
/**
 * Base metric interface
 */
export interface Metric {
    name: string;
    help: string;
    type: MetricType;
    labels?: MetricLabels;
}
/**
 * Metric value with timestamp
 */
export interface MetricValue {
    value: number;
    timestamp: number;
    labels?: MetricLabels;
}
/**
 * System health status
 */
export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    details: {
        websocket: {
            status: 'up' | 'down';
            connections: number;
            errorRate: number;
        };
        devices: {
            total: number;
            connected: number;
            error: number;
        };
        resources: {
            cpu: number;
            memory: number;
            uptime: number;
        };
    };
}
/**
 * Device metrics
 */
export interface DeviceMetrics {
    deviceId: string;
    status: DeviceStatus;
    connectionUptime: number;
    commandsProcessed: number;
    commandErrors: number;
    averageLatency: number;
    batteryLevel?: number;
    signalStrength?: number;
}
/**
 * Session metrics
 */
export interface SessionMetrics {
    sessionId: string;
    userId: string;
    deviceId: string;
    duration: number;
    commandCount: number;
    patternChanges: number;
    averageIntensity: number;
    cost: number;
}
/**
 * Performance metrics
 */
export interface PerformanceMetrics {
    timestamp: Date;
    period: number;
    websocket: WebSocketStats;
    devices: Map<string, DeviceMetrics>;
    sessions: Map<string, SessionMetrics>;
    system: {
        cpu: number;
        memory: number;
        uptime: number;
        errorRate: number;
    };
}
/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
    enabled: boolean;
    interval: number;
    retention: number;
    metrics: {
        prefix: string;
        labels: MetricLabels;
        types: string[];
    };
    alerts: {
        enabled: boolean;
        endpoints: string[];
        thresholds: {
            errorRate: number;
            latency: number;
            deviceErrors: number;
            connectionDrop: number;
        };
    };
}
/**
 * Alert severity levels
 */
export declare enum AlertSeverity {
    INFO = "info",
    WARNING = "warning",
    ERROR = "error",
    CRITICAL = "critical"
}
/**
 * Alert interface
 */
export interface Alert {
    id: string;
    severity: AlertSeverity;
    title: string;
    message: string;
    source: string;
    timestamp: Date;
    data?: any;
    acknowledged: boolean;
}
/**
 * Monitoring service interface
 */
export interface MonitoringService {
    initialize(config: MonitoringConfig): Promise<void>;
    startMetricsCollection(): void;
    stopMetricsCollection(): void;
    recordMetric(name: string, value: number, labels?: MetricLabels): void;
    getMetrics(): Promise<PerformanceMetrics>;
    getDeviceMetrics(deviceId: string): Promise<DeviceMetrics>;
    getSessionMetrics(sessionId: string): Promise<SessionMetrics>;
    checkHealth(): Promise<SystemHealth>;
    triggerAlert(alert: Alert): Promise<void>;
    acknowledgeAlert(alertId: string): Promise<void>;
    getActiveAlerts(): Promise<Alert[]>;
}
