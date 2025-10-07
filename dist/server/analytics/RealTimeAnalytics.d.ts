import { EventEmitter } from 'events';
import { AuthenticatedWebSocket } from '../EnhancedWebSocketServer';
export interface AnalyticsConfig {
    realTime: {
        enabled: boolean;
        updateInterval: number;
        batchSize: number;
    };
    storage: {
        type: 'memory' | 'redis' | 'database';
        retentionPeriod: number;
        maxEvents: number;
    };
    dashboards: {
        enabled: boolean;
        refreshRate: number;
        widgets: string[];
    };
    alerts: {
        enabled: boolean;
        thresholds: {
            connectionSpike: number;
            errorRate: number;
            latencyIncrease: number;
        };
    };
}
export interface AnalyticsEvent {
    id: string;
    type: string;
    category: 'connection' | 'message' | 'device' | 'user' | 'performance' | 'security';
    timestamp: Date;
    userId?: string;
    connectionId?: string;
    deviceId?: string;
    sessionId?: string;
    data: any;
    metadata?: any;
}
export interface AnalyticsMetrics {
    connections: {
        total: number;
        active: number;
        byRegion: Map<string, number>;
        byDevice: Map<string, number>;
        byUser: Map<string, number>;
    };
    messages: {
        total: number;
        perSecond: number;
        byType: Map<string, number>;
        avgLatency: number;
    };
    performance: {
        cpuUsage: number;
        memoryUsage: number;
        throughput: number;
        errorRate: number;
    };
    users: {
        active: number;
        concurrent: number;
        sessionDuration: number;
    };
}
export interface DashboardWidget {
    id: string;
    type: 'chart' | 'metric' | 'table' | 'map';
    title: string;
    data: any;
    config: any;
}
export declare class RealTimeAnalytics extends EventEmitter {
    private static instance;
    private config;
    private logger;
    private metrics;
    private events;
    private eventBuffer;
    private processingTimer?;
    private currentMetrics;
    private metricsHistory;
    private dashboardWidgets;
    private connections;
    private connectionStats;
    private userSessions;
    private performanceSnapshots;
    private alertStates;
    private constructor();
    static getInstance(config: AnalyticsConfig): RealTimeAnalytics;
    private initialize;
    private initializeMetrics;
    recordEvent(eventData: Partial<AnalyticsEvent>): void;
    private startRealTimeProcessing;
    private processBatch;
    private processEvent;
    private updateRealTimeMetrics;
    private updateConnectionMetrics;
    private updateMessageMetrics;
    private updatePerformanceMetrics;
    private updateUserMetrics;
    private updateAggregatedMetrics;
    private handleRealTimeEvent;
    private initializeDashboards;
    private createWidget;
    private startDashboardUpdates;
    private updateDashboards;
    private updateWidgetData;
    private updateAllWidgets;
    private checkAlerts;
    private checkConnectionSpikeAlert;
    private checkErrorRateAlert;
    private checkLatencyAlert;
    private triggerAlert;
    getEventsInTimeRange(startTime: number, endTime: number): AnalyticsEvent[];
    getEventsByCategory(category: string, timeRange?: number): AnalyticsEvent[];
    getMetricsHistory(timeRange: number): AnalyticsMetrics[];
    generateReport(timeRange: number): any;
    private generateEventId;
    private startMetricsCollection;
    private calculateAverageConnections;
    private calculateAverageLatency;
    private calculatePeakConnections;
    private calculatePeakMessageRate;
    private calculateAverageMetric;
    private calculateUniqueUsers;
    private calculateAverageSessionDuration;
    private groupEventsByCategory;
    private groupEventsByType;
    private getConnectionChartData;
    private getPerformanceTableData;
    private getRegionalMapData;
    private handleConnectionSpike;
    private handleErrorRateIncrease;
    private handleLatencySpike;
    private handleSecurityThreat;
    getCurrentMetrics(): AnalyticsMetrics;
    getDashboardData(): DashboardWidget[];
    trackConnection(ws: AuthenticatedWebSocket): void;
    untrackConnection(connectionId: string): void;
    shutdown(): Promise<void>;
}
