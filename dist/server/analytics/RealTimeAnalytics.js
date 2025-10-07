"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealTimeAnalytics = void 0;
const events_1 = require("events");
const Logger_1 = require("../../utils/Logger");
const MetricsCollector_1 = require("../../monitoring/MetricsCollector");
class RealTimeAnalytics extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.logger = Logger_1.Logger.getInstance();
        this.metrics = MetricsCollector_1.MetricsCollector.getInstance();
        this.events = [];
        this.eventBuffer = [];
        this.metricsHistory = [];
        this.dashboardWidgets = new Map();
        this.connections = new Map();
        this.connectionStats = new Map();
        this.userSessions = new Map();
        this.performanceSnapshots = [];
        this.alertStates = new Map();
        this.currentMetrics = this.initializeMetrics();
        this.initialize();
    }
    static getInstance(config) {
        if (!RealTimeAnalytics.instance) {
            RealTimeAnalytics.instance = new RealTimeAnalytics(config);
        }
        return RealTimeAnalytics.instance;
    }
    async initialize() {
        if (this.config.realTime.enabled) {
            this.startRealTimeProcessing();
        }
        if (this.config.dashboards.enabled) {
            this.initializeDashboards();
        }
        this.startMetricsCollection();
        this.logger.info('Real-time analytics initialized', {
            realTime: this.config.realTime.enabled,
            dashboards: this.config.dashboards.enabled,
            storage: this.config.storage.type
        });
    }
    initializeMetrics() {
        return {
            connections: {
                total: 0,
                active: 0,
                byRegion: new Map(),
                byDevice: new Map(),
                byUser: new Map()
            },
            messages: {
                total: 0,
                perSecond: 0,
                byType: new Map(),
                avgLatency: 0
            },
            performance: {
                cpuUsage: 0,
                memoryUsage: 0,
                throughput: 0,
                errorRate: 0
            },
            users: {
                active: 0,
                concurrent: 0,
                sessionDuration: 0
            }
        };
    }
    // Event Recording
    recordEvent(eventData) {
        const event = {
            id: this.generateEventId(),
            timestamp: new Date(),
            ...eventData
        };
        this.eventBuffer.push(event);
        // Process immediately for high-priority events
        if (event.category === 'security' || event.type === 'error') {
            this.processEvent(event);
        }
        // Update real-time metrics
        this.updateRealTimeMetrics(event);
        this.emit('event', event);
    }
    startRealTimeProcessing() {
        this.processingTimer = setInterval(() => {
            this.processBatch();
            this.updateDashboards();
            this.checkAlerts();
        }, this.config.realTime.updateInterval);
    }
    processBatch() {
        if (this.eventBuffer.length === 0)
            return;
        const batchSize = Math.min(this.config.realTime.batchSize, this.eventBuffer.length);
        const batch = this.eventBuffer.splice(0, batchSize);
        for (const event of batch) {
            this.processEvent(event);
        }
        this.metrics.recordMetric('analytics.events_processed', batch.length);
    }
    processEvent(event) {
        // Store event
        this.events.push(event);
        // Update aggregated metrics
        this.updateAggregatedMetrics(event);
        // Trigger real-time actions
        this.handleRealTimeEvent(event);
        // Cleanup old events
        if (this.events.length > this.config.storage.maxEvents) {
            const cutoff = Date.now() - this.config.storage.retentionPeriod;
            this.events = this.events.filter(e => e.timestamp.getTime() > cutoff);
        }
    }
    updateRealTimeMetrics(event) {
        switch (event.category) {
            case 'connection':
                this.updateConnectionMetrics(event);
                break;
            case 'message':
                this.updateMessageMetrics(event);
                break;
            case 'performance':
                this.updatePerformanceMetrics(event);
                break;
            case 'user':
                this.updateUserMetrics(event);
                break;
        }
    }
    updateConnectionMetrics(event) {
        const metrics = this.currentMetrics.connections;
        switch (event.type) {
            case 'connection_opened':
                metrics.total++;
                metrics.active++;
                if (event.data?.region) {
                    const regionCount = metrics.byRegion.get(event.data.region) || 0;
                    metrics.byRegion.set(event.data.region, regionCount + 1);
                }
                if (event.deviceId) {
                    const deviceCount = metrics.byDevice.get(event.deviceId) || 0;
                    metrics.byDevice.set(event.deviceId, deviceCount + 1);
                }
                if (event.userId) {
                    const userCount = metrics.byUser.get(event.userId) || 0;
                    metrics.byUser.set(event.userId, userCount + 1);
                }
                break;
            case 'connection_closed':
                metrics.active = Math.max(0, metrics.active - 1);
                if (event.data?.region) {
                    const regionCount = metrics.byRegion.get(event.data.region) || 0;
                    metrics.byRegion.set(event.data.region, Math.max(0, regionCount - 1));
                }
                break;
        }
        this.emit('connectionMetricsUpdated', metrics);
    }
    updateMessageMetrics(event) {
        const metrics = this.currentMetrics.messages;
        switch (event.type) {
            case 'message_received':
            case 'message_sent':
                metrics.total++;
                if (event.data?.messageType) {
                    const typeCount = metrics.byType.get(event.data.messageType) || 0;
                    metrics.byType.set(event.data.messageType, typeCount + 1);
                }
                if (event.data?.latency) {
                    metrics.avgLatency = (metrics.avgLatency + event.data.latency) / 2;
                }
                break;
        }
        this.emit('messageMetricsUpdated', metrics);
    }
    updatePerformanceMetrics(event) {
        const metrics = this.currentMetrics.performance;
        if (event.data) {
            if (event.data.cpuUsage !== undefined) {
                metrics.cpuUsage = event.data.cpuUsage;
            }
            if (event.data.memoryUsage !== undefined) {
                metrics.memoryUsage = event.data.memoryUsage;
            }
            if (event.data.throughput !== undefined) {
                metrics.throughput = event.data.throughput;
            }
            if (event.data.errorRate !== undefined) {
                metrics.errorRate = event.data.errorRate;
            }
        }
        this.emit('performanceMetricsUpdated', metrics);
    }
    updateUserMetrics(event) {
        const metrics = this.currentMetrics.users;
        switch (event.type) {
            case 'user_session_started':
                metrics.active++;
                metrics.concurrent++;
                if (event.userId && event.sessionId) {
                    this.userSessions.set(event.sessionId, {
                        userId: event.userId,
                        startTime: event.timestamp,
                        lastActivity: event.timestamp
                    });
                }
                break;
            case 'user_session_ended':
                metrics.concurrent = Math.max(0, metrics.concurrent - 1);
                if (event.sessionId) {
                    const session = this.userSessions.get(event.sessionId);
                    if (session) {
                        const duration = event.timestamp.getTime() - session.startTime.getTime();
                        metrics.sessionDuration = (metrics.sessionDuration + duration) / 2;
                        this.userSessions.delete(event.sessionId);
                    }
                }
                break;
            case 'user_activity':
                if (event.sessionId) {
                    const session = this.userSessions.get(event.sessionId);
                    if (session) {
                        session.lastActivity = event.timestamp;
                    }
                }
                break;
        }
        this.emit('userMetricsUpdated', metrics);
    }
    updateAggregatedMetrics(event) {
        // Calculate messages per second
        const recentEvents = this.getEventsInTimeRange(Date.now() - 1000, Date.now());
        const messageEvents = recentEvents.filter(e => e.category === 'message' && (e.type === 'message_received' || e.type === 'message_sent'));
        this.currentMetrics.messages.perSecond = messageEvents.length;
        // Update performance snapshots
        if (event.category === 'performance') {
            this.performanceSnapshots.push({
                timestamp: event.timestamp,
                data: event.data
            });
            // Keep only last hour of snapshots
            const cutoff = Date.now() - 3600000;
            this.performanceSnapshots = this.performanceSnapshots.filter(s => s.timestamp.getTime() > cutoff);
        }
    }
    handleRealTimeEvent(event) {
        // Handle specific real-time event types
        switch (event.type) {
            case 'connection_spike':
                this.handleConnectionSpike(event);
                break;
            case 'error_rate_increase':
                this.handleErrorRateIncrease(event);
                break;
            case 'latency_spike':
                this.handleLatencySpike(event);
                break;
            case 'security_threat':
                this.handleSecurityThreat(event);
                break;
        }
    }
    // Dashboard Management
    initializeDashboards() {
        this.createWidget('connections-chart', {
            type: 'chart',
            title: 'Real-time Connections',
            config: { chartType: 'line', timeRange: '1h' }
        });
        this.createWidget('messages-metric', {
            type: 'metric',
            title: 'Messages/Second',
            config: { format: 'number', color: 'blue' }
        });
        this.createWidget('performance-table', {
            type: 'table',
            title: 'Performance Metrics',
            config: { columns: ['metric', 'value', 'trend'] }
        });
        this.createWidget('regional-map', {
            type: 'map',
            title: 'Connection Distribution',
            config: { mapType: 'world', metric: 'connections' }
        });
        this.startDashboardUpdates();
    }
    createWidget(id, config) {
        const widget = {
            id,
            data: null,
            ...config
        };
        this.dashboardWidgets.set(id, widget);
        this.updateWidgetData(widget);
    }
    startDashboardUpdates() {
        setInterval(() => {
            this.updateAllWidgets();
        }, this.config.dashboards.refreshRate);
    }
    updateDashboards() {
        if (!this.config.dashboards.enabled)
            return;
        for (const widget of this.dashboardWidgets.values()) {
            this.updateWidgetData(widget);
        }
        this.emit('dashboardUpdated', {
            widgets: Array.from(this.dashboardWidgets.values()),
            timestamp: new Date()
        });
    }
    updateWidgetData(widget) {
        switch (widget.id) {
            case 'connections-chart':
                widget.data = this.getConnectionChartData();
                break;
            case 'messages-metric':
                widget.data = this.currentMetrics.messages.perSecond;
                break;
            case 'performance-table':
                widget.data = this.getPerformanceTableData();
                break;
            case 'regional-map':
                widget.data = this.getRegionalMapData();
                break;
        }
    }
    updateAllWidgets() {
        for (const widget of this.dashboardWidgets.values()) {
            this.updateWidgetData(widget);
        }
    }
    // Alert Management
    checkAlerts() {
        if (!this.config.alerts.enabled)
            return;
        this.checkConnectionSpikeAlert();
        this.checkErrorRateAlert();
        this.checkLatencyAlert();
    }
    checkConnectionSpikeAlert() {
        const threshold = this.config.alerts.thresholds.connectionSpike;
        const currentConnections = this.currentMetrics.connections.active;
        const avgConnections = this.calculateAverageConnections();
        if (currentConnections > avgConnections * (1 + threshold)) {
            if (!this.alertStates.get('connection_spike')) {
                this.triggerAlert('connection_spike', {
                    current: currentConnections,
                    average: avgConnections,
                    threshold
                });
                this.alertStates.set('connection_spike', true);
            }
        }
        else {
            this.alertStates.set('connection_spike', false);
        }
    }
    checkErrorRateAlert() {
        const threshold = this.config.alerts.thresholds.errorRate;
        const currentErrorRate = this.currentMetrics.performance.errorRate;
        if (currentErrorRate > threshold) {
            if (!this.alertStates.get('error_rate')) {
                this.triggerAlert('error_rate', {
                    current: currentErrorRate,
                    threshold
                });
                this.alertStates.set('error_rate', true);
            }
        }
        else {
            this.alertStates.set('error_rate', false);
        }
    }
    checkLatencyAlert() {
        const threshold = this.config.alerts.thresholds.latencyIncrease;
        const currentLatency = this.currentMetrics.messages.avgLatency;
        const avgLatency = this.calculateAverageLatency();
        if (currentLatency > avgLatency * (1 + threshold)) {
            if (!this.alertStates.get('latency_increase')) {
                this.triggerAlert('latency_increase', {
                    current: currentLatency,
                    average: avgLatency,
                    threshold
                });
                this.alertStates.set('latency_increase', true);
            }
        }
        else {
            this.alertStates.set('latency_increase', false);
        }
    }
    triggerAlert(type, data) {
        const alert = {
            type,
            severity: 'warning',
            timestamp: new Date(),
            data
        };
        this.logger.warn('Analytics alert triggered', alert);
        this.emit('alert', alert);
        this.recordEvent({
            type: 'alert_triggered',
            category: 'performance',
            data: alert
        });
    }
    // Data Retrieval and Analysis
    getEventsInTimeRange(startTime, endTime) {
        return this.events.filter(event => {
            const timestamp = event.timestamp.getTime();
            return timestamp >= startTime && timestamp <= endTime;
        });
    }
    getEventsByCategory(category, timeRange) {
        let events = this.events.filter(event => event.category === category);
        if (timeRange) {
            const cutoff = Date.now() - timeRange;
            events = events.filter(event => event.timestamp.getTime() > cutoff);
        }
        return events;
    }
    getMetricsHistory(timeRange) {
        const cutoff = Date.now() - timeRange;
        return this.metricsHistory.filter(metrics => metrics.timestamp && metrics.timestamp.getTime() > cutoff);
    }
    generateReport(timeRange) {
        const events = this.getEventsInTimeRange(Date.now() - timeRange, Date.now());
        return {
            summary: {
                totalEvents: events.length,
                eventsByCategory: this.groupEventsByCategory(events),
                eventsByType: this.groupEventsByType(events),
                timeRange
            },
            connections: {
                total: this.currentMetrics.connections.total,
                peak: this.calculatePeakConnections(timeRange),
                average: this.calculateAverageConnections(timeRange)
            },
            messages: {
                total: this.currentMetrics.messages.total,
                peakRate: this.calculatePeakMessageRate(timeRange),
                averageLatency: this.calculateAverageLatency(timeRange)
            },
            performance: {
                avgCpu: this.calculateAverageMetric('cpuUsage', timeRange),
                avgMemory: this.calculateAverageMetric('memoryUsage', timeRange),
                errorRate: this.currentMetrics.performance.errorRate
            },
            users: {
                uniqueUsers: this.calculateUniqueUsers(timeRange),
                averageSessionDuration: this.calculateAverageSessionDuration(timeRange)
            }
        };
    }
    // Helper Methods
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    startMetricsCollection() {
        setInterval(() => {
            // Take snapshot of current metrics
            const snapshot = JSON.parse(JSON.stringify(this.currentMetrics));
            snapshot.timestamp = new Date();
            this.metricsHistory.push(snapshot);
            // Keep only last 24 hours of history
            const cutoff = Date.now() - 86400000;
            this.metricsHistory = this.metricsHistory.filter(m => m.timestamp && m.timestamp.getTime() > cutoff);
        }, 60000); // Every minute
    }
    calculateAverageConnections(timeRange = 3600000) {
        const history = this.getMetricsHistory(timeRange);
        if (history.length === 0)
            return 0;
        return history.reduce((sum, m) => sum + m.connections.active, 0) / history.length;
    }
    calculateAverageLatency(timeRange = 3600000) {
        const history = this.getMetricsHistory(timeRange);
        if (history.length === 0)
            return 0;
        return history.reduce((sum, m) => sum + m.messages.avgLatency, 0) / history.length;
    }
    calculatePeakConnections(timeRange) {
        const history = this.getMetricsHistory(timeRange);
        return Math.max(...history.map(m => m.connections.active), 0);
    }
    calculatePeakMessageRate(timeRange) {
        const history = this.getMetricsHistory(timeRange);
        return Math.max(...history.map(m => m.messages.perSecond), 0);
    }
    calculateAverageMetric(metric, timeRange) {
        const snapshots = this.performanceSnapshots.filter(s => Date.now() - s.timestamp.getTime() < timeRange);
        if (snapshots.length === 0)
            return 0;
        return snapshots.reduce((sum, s) => sum + (s.data[metric] || 0), 0) / snapshots.length;
    }
    calculateUniqueUsers(timeRange) {
        const events = this.getEventsInTimeRange(Date.now() - timeRange, Date.now());
        const uniqueUsers = new Set(events.filter(e => e.userId).map(e => e.userId));
        return uniqueUsers.size;
    }
    calculateAverageSessionDuration(timeRange) {
        const sessionEvents = this.getEventsInTimeRange(Date.now() - timeRange, Date.now())
            .filter(e => e.type === 'user_session_ended');
        if (sessionEvents.length === 0)
            return 0;
        const durations = sessionEvents.map(e => e.data?.duration || 0);
        return durations.reduce((sum, d) => sum + d, 0) / durations.length;
    }
    groupEventsByCategory(events) {
        const grouped = new Map();
        for (const event of events) {
            grouped.set(event.category, (grouped.get(event.category) || 0) + 1);
        }
        return grouped;
    }
    groupEventsByType(events) {
        const grouped = new Map();
        for (const event of events) {
            grouped.set(event.type, (grouped.get(event.type) || 0) + 1);
        }
        return grouped;
    }
    // Dashboard Data Helpers
    getConnectionChartData() {
        const history = this.getMetricsHistory(3600000); // Last hour
        return {
            labels: history.map(m => m.timestamp),
            datasets: [{
                    label: 'Active Connections',
                    data: history.map(m => m.connections.active),
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
        };
    }
    getPerformanceTableData() {
        return [
            { metric: 'CPU Usage', value: `${this.currentMetrics.performance.cpuUsage.toFixed(1)}%`, trend: 'stable' },
            { metric: 'Memory Usage', value: `${this.currentMetrics.performance.memoryUsage.toFixed(1)}%`, trend: 'stable' },
            { metric: 'Error Rate', value: `${(this.currentMetrics.performance.errorRate * 100).toFixed(2)}%`, trend: 'stable' },
            { metric: 'Throughput', value: `${this.currentMetrics.performance.throughput.toFixed(0)} ops/s`, trend: 'up' }
        ];
    }
    getRegionalMapData() {
        const regionData = [];
        for (const [region, count] of this.currentMetrics.connections.byRegion) {
            regionData.push({ region, connections: count });
        }
        return regionData;
    }
    // Event Handlers for Specific Cases
    handleConnectionSpike(event) {
        this.logger.warn('Connection spike detected', event.data);
        // Implement auto-scaling or load balancing logic
    }
    handleErrorRateIncrease(event) {
        this.logger.error('Error rate increase detected', event.data);
        // Implement error handling and recovery logic
    }
    handleLatencySpike(event) {
        this.logger.warn('Latency spike detected', event.data);
        // Implement performance optimization logic
    }
    handleSecurityThreat(event) {
        this.logger.error('Security threat detected', event.data);
        // Implement security response logic
    }
    // Public API
    getCurrentMetrics() {
        return JSON.parse(JSON.stringify(this.currentMetrics));
    }
    getDashboardData() {
        return Array.from(this.dashboardWidgets.values());
    }
    trackConnection(ws) {
        this.connections.set(ws.connectionId, ws);
        this.recordEvent({
            type: 'connection_opened',
            category: 'connection',
            userId: ws.userId,
            connectionId: ws.connectionId,
            deviceId: ws.deviceId,
            sessionId: ws.sessionId,
            data: {
                region: ws.region,
                userAgent: ws.protocol || 'unknown'
            }
        });
    }
    untrackConnection(connectionId) {
        const ws = this.connections.get(connectionId);
        if (ws) {
            this.recordEvent({
                type: 'connection_closed',
                category: 'connection',
                userId: ws.userId,
                connectionId,
                deviceId: ws.deviceId,
                sessionId: ws.sessionId,
                data: {
                    region: ws.region,
                    duration: Date.now() - (ws.lastActivity?.getTime() || Date.now())
                }
            });
            this.connections.delete(connectionId);
        }
    }
    async shutdown() {
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
        }
        // Process remaining events
        if (this.eventBuffer.length > 0) {
            this.processBatch();
        }
        this.logger.info('Real-time analytics shutdown complete', {
            totalEvents: this.events.length,
            finalMetrics: this.currentMetrics
        });
    }
}
exports.RealTimeAnalytics = RealTimeAnalytics;
//# sourceMappingURL=RealTimeAnalytics.js.map