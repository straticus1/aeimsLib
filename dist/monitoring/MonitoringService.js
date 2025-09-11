"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultMonitoringService = void 0;
const monitoring_1 = require("../interfaces/monitoring");
const prom_client_1 = require("prom-client");
const Logger_1 = require("../utils/Logger");
const AnalyticsCollector_1 = require("./AnalyticsCollector");
const os_1 = __importDefault(require("os"));
class DefaultMonitoringService {
    constructor(deviceManager) {
        this.logger = Logger_1.Logger.getInstance();
        this.deviceManager = deviceManager;
        this.metrics = new Map();
        this.alerts = [];
    }
    static getInstance(deviceManager) {
        if (!DefaultMonitoringService.instance) {
            DefaultMonitoringService.instance = new DefaultMonitoringService(deviceManager);
        }
        return DefaultMonitoringService.instance;
    }
    async initialize(config) {
        this.config = config;
        if (!config.enabled) {
            return;
        }
        // Initialize default metrics
        this.setupDefaultMetrics();
        // Start metrics collection
        this.startMetricsCollection();
        this.logger.info('Monitoring service initialized');
    }
    setupDefaultMetrics() {
        // Device metrics
        this.createMetric('device_total', monitoring_1.MetricType.GAUGE, 'Total number of devices');
        this.createMetric('device_connected', monitoring_1.MetricType.GAUGE, 'Number of connected devices');
        this.createMetric('device_errors', monitoring_1.MetricType.COUNTER, 'Number of device errors');
        this.createMetric('device_commands', monitoring_1.MetricType.COUNTER, 'Number of device commands');
        this.createMetric('device_command_latency', monitoring_1.MetricType.HISTOGRAM, 'Device command latency', {
            buckets: [0.1, 0.5, 1, 2, 5]
        });
        // WebSocket metrics
        this.createMetric('ws_connections_total', monitoring_1.MetricType.COUNTER, 'Total WebSocket connections');
        this.createMetric('ws_connections_active', monitoring_1.MetricType.GAUGE, 'Active WebSocket connections');
        this.createMetric('ws_messages_sent', monitoring_1.MetricType.COUNTER, 'WebSocket messages sent');
        this.createMetric('ws_messages_received', monitoring_1.MetricType.COUNTER, 'WebSocket messages received');
        this.createMetric('ws_errors', monitoring_1.MetricType.COUNTER, 'WebSocket errors');
        // System metrics
        this.createMetric('system_cpu_usage', monitoring_1.MetricType.GAUGE, 'CPU usage percentage');
        this.createMetric('system_memory_usage', monitoring_1.MetricType.GAUGE, 'Memory usage percentage');
        this.createMetric('system_uptime', monitoring_1.MetricType.GAUGE, 'System uptime in seconds');
    }
    createMetric(name, type, help, config = {}) {
        const fullName = `${this.config.metrics.prefix}_${name}`;
        let metric;
        switch (type) {
            case monitoring_1.MetricType.COUNTER:
                metric = new prom_client_1.Counter({
                    name: fullName,
                    help,
                    labelNames: Object.keys(this.config.metrics.labels)
                });
                break;
            case monitoring_1.MetricType.GAUGE:
                metric = new prom_client_1.Gauge({
                    name: fullName,
                    help,
                    labelNames: Object.keys(this.config.metrics.labels)
                });
                break;
            case monitoring_1.MetricType.HISTOGRAM:
                metric = new prom_client_1.Histogram({
                    name: fullName,
                    help,
                    labelNames: Object.keys(this.config.metrics.labels),
                    buckets: config.buckets || [0.1, 0.5, 1, 2, 5]
                });
                break;
            case monitoring_1.MetricType.SUMMARY:
                metric = new prom_client_1.Summary({
                    name: fullName,
                    help,
                    labelNames: Object.keys(this.config.metrics.labels),
                    maxAgeSeconds: config.maxAgeSeconds || 600,
                    ageBuckets: config.ageBuckets || 5
                });
                break;
        }
        this.metrics.set(name, metric);
    }
    startMetricsCollection() {
        if (!this.config.enabled) {
            return;
        }
        this.collectionInterval = setInterval(() => this.collectMetrics(), this.config.interval);
    }
    stopMetricsCollection() {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = undefined;
        }
    }
    async collectMetrics() {
        try {
            const devices = this.deviceManager.getAllDevices();
            const connectedDevices = devices.filter(d => d.status.connected);
            // Update device metrics
            this.recordMetric('device_total', devices.length);
            this.recordMetric('device_connected', connectedDevices.length);
            // Update system metrics
            const cpuUsage = os_1.default.loadavg()[0] / os_1.default.cpus().length * 100;
            const totalMemory = os_1.default.totalmem();
            const freeMemory = os_1.default.freemem();
            const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;
            this.recordMetric('system_cpu_usage', cpuUsage);
            this.recordMetric('system_memory_usage', memoryUsage);
            this.recordMetric('system_uptime', os_1.default.uptime());
            // Check health thresholds and trigger alerts if needed
            await this.checkHealthThresholds({
                cpuUsage,
                memoryUsage,
                deviceErrors: devices.filter(d => d.status.error).length,
                connectedDevices: connectedDevices.length
            });
        }
        catch (error) {
            this.logger.error(`Metrics collection failed: ${error}`);
        }
    }
    recordMetric(name, value, labels) {
        if (!this.config.enabled) {
            return;
        }
        const metric = this.metrics.get(name);
        if (!metric) {
            this.logger.warn(`Metric ${name} not found`);
            return;
        }
        try {
            const allLabels = { ...this.config.metrics.labels, ...labels };
            if (metric instanceof prom_client_1.Counter) {
                metric.inc(allLabels, value);
            }
            else if (metric instanceof prom_client_1.Gauge) {
                metric.set(allLabels, value);
            }
            else if (metric instanceof prom_client_1.Histogram) {
                metric.observe(allLabels, value);
            }
            else if (metric instanceof prom_client_1.Summary) {
                metric.observe(allLabels, value);
            }
        }
        catch (error) {
            this.logger.error(`Failed to record metric ${name}: ${error}`);
        }
    }
    async getMetrics() {
        const devices = this.deviceManager.getAllDevices();
        const deviceMetrics = new Map();
        const sessionMetrics = new Map();
        // Collect device metrics
        for (const device of devices) {
            deviceMetrics.set(device.info.id, {
                deviceId: device.info.id,
                status: device.status,
                connectionUptime: device.status.connected ?
                    Date.now() - device.status.lastSeen.getTime() : 0,
                commandsProcessed: 0, // This should be tracked in the device manager
                commandErrors: 0,
                averageLatency: 0,
                batteryLevel: device.status.batteryLevel
            });
        }
        // Get system metrics
        const metrics = {
            timestamp: new Date(),
            period: this.config.interval,
            websocket: await this.getWebSocketStats(),
            devices: deviceMetrics,
            sessions: sessionMetrics,
            system: {
                cpu: os_1.default.loadavg()[0] / os_1.default.cpus().length * 100,
                memory: (os_1.default.totalmem() - os_1.default.freemem()) / os_1.default.totalmem() * 100,
                uptime: os_1.default.uptime(),
                errorRate: this.calculateErrorRate()
            }
        };
        return metrics;
    }
    async getDeviceMetrics(deviceId) {
        const device = this.deviceManager.getDevice(deviceId);
        return {
            deviceId: device.info.id,
            status: device.status,
            connectionUptime: device.status.connected ?
                Date.now() - device.status.lastSeen.getTime() : 0,
            commandsProcessed: 0, // This should be tracked in the device manager
            commandErrors: 0,
            averageLatency: 0,
            batteryLevel: device.status.batteryLevel
        };
    }
    async getSessionMetrics(sessionId) {
        try {
            // Get session data from analytics collector
            const analytics = AnalyticsCollector_1.AnalyticsCollector.getInstance();
            const sessionEvents = analytics.queryEvents({
                sessionIds: [sessionId],
                startTime: Date.now() - 3600000 // Last hour
            });
            const deviceEvents = sessionEvents.filter(event => event.type === AnalyticsCollector_1.AnalyticsEventType.COMMAND_COMPLETED ||
                event.type === AnalyticsCollector_1.AnalyticsEventType.DEVICE_CONNECTED ||
                event.type === AnalyticsCollector_1.AnalyticsEventType.DEVICE_DISCONNECTED);
            const totalCommands = deviceEvents.filter(event => event.type === AnalyticsCollector_1.AnalyticsEventType.COMMAND_COMPLETED).length;
            const successfulCommands = deviceEvents.filter(event => event.type === AnalyticsCollector_1.AnalyticsEventType.COMMAND_COMPLETED &&
                event.data?.success === true).length;
            const connectedDevices = new Set(deviceEvents
                .filter(event => event.type === AnalyticsCollector_1.AnalyticsEventType.DEVICE_CONNECTED)
                .map(event => event.deviceId)).size;
            const averageLatency = deviceEvents
                .filter(event => event.type === AnalyticsCollector_1.AnalyticsEventType.COMMAND_COMPLETED && event.data?.duration)
                .reduce((sum, event) => sum + (event.data.duration || 0), 0) / totalCommands || 0;
            return {
                sessionId,
                totalCommands,
                successfulCommands,
                errorRate: totalCommands > 0 ? (totalCommands - successfulCommands) / totalCommands : 0,
                averageLatency,
                connectedDevices,
                sessionDuration: 0, // Would need session start/end tracking
                featuresUsed: [], // Would need feature usage tracking
                lastActivity: new Date()
            };
        }
        catch (error) {
            this.logger.error('Failed to get session metrics', { sessionId, error: error.message });
            throw new Error(`Failed to get session metrics: ${error.message}`);
        }
    }
    async checkHealth() {
        const devices = this.deviceManager.getAllDevices();
        const connectedDevices = devices.filter(d => d.status.connected);
        const errorDevices = devices.filter(d => d.status.error);
        const wsStats = await this.getWebSocketStats();
        const health = {
            status: 'healthy',
            timestamp: new Date(),
            details: {
                websocket: {
                    status: wsStats.errors > this.config.alerts.thresholds.errorRate ? 'down' : 'up',
                    connections: wsStats.activeConnections,
                    errorRate: wsStats.errors / wsStats.totalConnections || 0
                },
                devices: {
                    total: devices.length,
                    connected: connectedDevices.length,
                    error: errorDevices.length
                },
                resources: {
                    cpu: os_1.default.loadavg()[0] / os_1.default.cpus().length * 100,
                    memory: (os_1.default.totalmem() - os_1.default.freemem()) / os_1.default.totalmem() * 100,
                    uptime: os_1.default.uptime()
                }
            }
        };
        // Determine overall health status
        if (health.details.websocket.status === 'down' ||
            health.details.devices.error > this.config.alerts.thresholds.deviceErrors ||
            health.details.resources.cpu > 90 ||
            health.details.resources.memory > 90) {
            health.status = 'unhealthy';
        }
        else if (health.details.devices.connected < health.details.devices.total * 0.8 ||
            health.details.resources.cpu > 70 ||
            health.details.resources.memory > 70) {
            health.status = 'degraded';
        }
        return health;
    }
    async triggerAlert(alert) {
        this.alerts.push(alert);
        // Log alert
        this.logger.warn(`Alert triggered: ${alert.title}`, {
            alert: {
                id: alert.id,
                severity: alert.severity,
                message: alert.message
            }
        });
        // Record metric
        this.recordMetric('alerts_triggered', 1, {
            severity: alert.severity,
            type: alert.title
        });
        // Send alerts to configured endpoints
        for (const endpoint of this.config.alerts.endpoints) {
            try {
                // Implement alert notification (e.g., webhook, email, etc.)
                await this.sendAlertNotification(endpoint, alert);
            }
            catch (error) {
                this.logger.error(`Failed to send alert to ${endpoint}: ${error}`);
            }
        }
    }
    async acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            this.logger.info(`Alert ${alertId} acknowledged`);
        }
    }
    async getActiveAlerts() {
        return this.alerts.filter(a => !a.acknowledged);
    }
    async sendAlertNotification(endpoint, alert) {
        // Implement alert notification based on your needs
        // This is a placeholder
        this.logger.info(`Would send alert to ${endpoint}`, { alert });
    }
    calculateErrorRate() {
        const errorMetric = this.metrics.get('device_errors');
        const commandMetric = this.metrics.get('device_commands');
        if (!errorMetric || !commandMetric) {
            return 0;
        }
        const errors = errorMetric.get().values[0].value;
        const commands = commandMetric.get().values[0].value;
        return commands > 0 ? errors / commands : 0;
    }
    async getWebSocketStats() {
        const wsConnectionsMetric = this.metrics.get('ws_connections_active');
        const wsErrorsMetric = this.metrics.get('ws_errors');
        const wsMessagesSentMetric = this.metrics.get('ws_messages_sent');
        const wsMessagesReceivedMetric = this.metrics.get('ws_messages_received');
        return {
            totalConnections: wsConnectionsMetric?.get().values[0].value || 0,
            activeConnections: wsConnectionsMetric?.get().values[0].value || 0,
            messagesReceived: wsMessagesReceivedMetric?.get().values[0].value || 0,
            messagesSent: wsMessagesSentMetric?.get().values[0].value || 0,
            errors: wsErrorsMetric?.get().values[0].value || 0,
            lastError: undefined
        };
    }
    async checkHealthThresholds(metrics) {
        // Check CPU usage
        if (metrics.cpuUsage > this.config.alerts.thresholds.deviceErrors) {
            await this.triggerAlert({
                id: crypto.randomBytes(16).toString('hex'),
                severity: monitoring_1.AlertSeverity.WARNING,
                title: 'High CPU Usage',
                message: `CPU usage is at ${metrics.cpuUsage.toFixed(1)}%`,
                source: 'system',
                timestamp: new Date(),
                acknowledged: false
            });
        }
        // Check memory usage
        if (metrics.memoryUsage > 90) {
            await this.triggerAlert({
                id: crypto.randomBytes(16).toString('hex'),
                severity: monitoring_1.AlertSeverity.CRITICAL,
                title: 'Critical Memory Usage',
                message: `Memory usage is at ${metrics.memoryUsage.toFixed(1)}%`,
                source: 'system',
                timestamp: new Date(),
                acknowledged: false
            });
        }
        // Check device errors
        if (metrics.deviceErrors > this.config.alerts.thresholds.deviceErrors) {
            await this.triggerAlert({
                id: crypto.randomBytes(16).toString('hex'),
                severity: monitoring_1.AlertSeverity.ERROR,
                title: 'High Device Error Rate',
                message: `${metrics.deviceErrors} devices are reporting errors`,
                source: 'devices',
                timestamp: new Date(),
                acknowledged: false
            });
        }
        // Check connection drops
        if (metrics.connectedDevices < this.deviceManager.getAllDevices().length * 0.8) {
            await this.triggerAlert({
                id: crypto.randomBytes(16).toString('hex'),
                severity: monitoring_1.AlertSeverity.WARNING,
                title: 'Low Device Connection Rate',
                message: `Only ${metrics.connectedDevices} devices are connected`,
                source: 'devices',
                timestamp: new Date(),
                acknowledged: false
            });
        }
    }
}
exports.DefaultMonitoringService = DefaultMonitoringService;
//# sourceMappingURL=MonitoringService.js.map