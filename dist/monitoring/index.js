"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionMonitoring = exports.DeviceMonitoring = exports.AnalyticsEventType = exports.AnalyticsCollector = exports.MetricCategory = exports.MetricType = exports.MetricsCollector = void 0;
exports.initializeMonitoring = initializeMonitoring;
exports.shutdownMonitoring = shutdownMonitoring;
exports.getDeviceMonitor = getDeviceMonitor;
exports.getSessionMonitor = getSessionMonitor;
const MetricsCollector_1 = require("./MetricsCollector");
Object.defineProperty(exports, "MetricsCollector", { enumerable: true, get: function () { return MetricsCollector_1.MetricsCollector; } });
Object.defineProperty(exports, "MetricType", { enumerable: true, get: function () { return MetricsCollector_1.MetricType; } });
Object.defineProperty(exports, "MetricCategory", { enumerable: true, get: function () { return MetricsCollector_1.MetricCategory; } });
const AnalyticsCollector_1 = require("./AnalyticsCollector");
Object.defineProperty(exports, "AnalyticsCollector", { enumerable: true, get: function () { return AnalyticsCollector_1.AnalyticsCollector; } });
Object.defineProperty(exports, "AnalyticsEventType", { enumerable: true, get: function () { return AnalyticsCollector_1.AnalyticsEventType; } });
function initializeMonitoring(options = {}) {
    const metrics = MetricsCollector_1.MetricsCollector.getInstance();
    const analytics = AnalyticsCollector_1.AnalyticsCollector.getInstance();
    // Register standard metrics
    metrics.registerStandardMetrics();
    // Set up device monitoring if manager provided
    if (options.deviceManager) {
        const manager = options.deviceManager;
        manager.on('deviceConnected', device => {
            const monitor = new DeviceMonitoring(device.info.id);
            monitor.onConnect();
        });
        manager.on('deviceDisconnected', device => {
            const monitor = new DeviceMonitoring(device.info.id);
            monitor.onDisconnect();
        });
        manager.on('deviceCommand', ({ device, command, success, error, duration }) => {
            const monitor = new DeviceMonitoring(device.info.id);
            if (success) {
                monitor.onCommandComplete(command.type, duration, true);
            }
            else {
                monitor.onCommandComplete(command.type, duration, false, error);
            }
        });
        manager.on('deviceError', ({ device, error, context }) => {
            const monitor = new DeviceMonitoring(device.info.id);
            monitor.onError(error, context);
        });
    }
    // Set up AEIMS platform integration if client provided
    if (options.aeims) {
        const syncInterval = options.syncInterval || 60000; // Default 1 minute
        // Periodic sync of metrics and analytics
        setInterval(() => {
            const snapshot = analytics.getSnapshot();
            options.aeims.sendAnalytics(snapshot);
            const metricData = metrics.getMetrics();
            options.aeims.sendMetrics(metricData);
        }, syncInterval);
        // Handle platform events
        options.aeims.on('sessionStart', ({ sessionId, userId }) => {
            const session = new SessionMonitoring(sessionId, userId);
            session.start();
        });
        options.aeims.on('sessionEnd', ({ sessionId, userId }) => {
            const session = new SessionMonitoring(sessionId, userId);
            session.end();
        });
    }
    // Register standard metrics
    metrics.registerStandardMetrics();
    // Set up event listeners to sync analytics with metrics
    analytics.on('eventTracked', (event) => {
        switch (event.type) {
            case AnalyticsCollector_1.AnalyticsEventType.DEVICE_CONNECTED:
                metrics.recordMetric('device.connections', 1, {
                    device_id: event.deviceId
                });
                break;
            case AnalyticsCollector_1.AnalyticsEventType.COMMAND_COMPLETED:
            case AnalyticsCollector_1.AnalyticsEventType.COMMAND_FAILED:
                metrics.recordMetric('device.commands', 1, {
                    device_id: event.deviceId,
                    status: event.success ? 'success' : 'failed'
                });
                if (event.duration) {
                    metrics.recordMetric('device.latency', event.duration, {
                        device_id: event.deviceId
                    });
                }
                if (!event.success) {
                    metrics.recordMetric('device.errors', 1, {
                        device_id: event.deviceId,
                        error_type: event.error?.name || 'unknown'
                    });
                }
                break;
            case AnalyticsCollector_1.AnalyticsEventType.ERROR_OCCURRED:
                metrics.recordMetric('error.count', 1, {
                    device_id: event.deviceId,
                    error_type: event.error?.name || 'unknown'
                });
                break;
        }
    });
}
/**
 * Shutdown monitoring system and cleanup resources.
 */
function shutdownMonitoring() {
    const metrics = MetricsCollector_1.MetricsCollector.getInstance();
    const analytics = AnalyticsCollector_1.AnalyticsCollector.getInstance();
    // Ensure final flush of analytics
    analytics['flush']().finally(() => {
        metrics.dispose();
        analytics.dispose();
    });
}
/**
 * Helper class to simplify monitoring integration in device-related code.
 */
// Cache monitoring instances
const deviceMonitors = new Map();
const sessionMonitors = new Map();
function getDeviceMonitor(deviceId) {
    let monitor = deviceMonitors.get(deviceId);
    if (!monitor) {
        monitor = new DeviceMonitoring(deviceId);
        deviceMonitors.set(deviceId, monitor);
    }
    return monitor;
}
function getSessionMonitor(sessionId, userId) {
    let monitor = sessionMonitors.get(sessionId);
    if (!monitor) {
        monitor = new SessionMonitoring(sessionId, userId);
        sessionMonitors.set(sessionId, monitor);
    }
    return monitor;
}
class DeviceMonitoring {
    constructor(deviceId) {
        this.deviceId = deviceId;
        this.metrics = MetricsCollector_1.MetricsCollector.getInstance();
        this.analytics = AnalyticsCollector_1.AnalyticsCollector.getInstance();
    }
    onConnect(userId, sessionId) {
        this.analytics.trackDeviceConnection({ id: this.deviceId, info: { id: this.deviceId } }, userId, sessionId);
    }
    onDisconnect(userId, sessionId) {
        this.analytics.trackDeviceDisconnection(this.deviceId, userId, sessionId);
    }
    onCommandStart(commandType) {
        this.metrics.recordMetric('command_queue_size', 1, {
            device_id: this.deviceId
        });
    }
    onCommandComplete(commandType, duration, success, error) {
        this.analytics.trackCommandExecution(this.deviceId, commandType, success, duration, error);
        this.metrics.recordMetric('command_queue_size', -1, {
            device_id: this.deviceId
        });
    }
    onError(error, context) {
        this.analytics.trackError(error, context, this.deviceId);
    }
    onStateChange(stateKey, oldValue, newValue, metadata) {
        this.analytics.trackStateChange(this.deviceId, stateKey, oldValue, newValue, metadata);
    }
    onPatternUsage(patternId, action, params) {
        this.analytics.trackPatternUsage(this.deviceId, patternId, action, params);
    }
    onFeatureUsed(feature, userId, sessionId) {
        this.analytics.trackFeatureUsage(feature, this.deviceId, userId, sessionId);
    }
    recordPerformanceMetric(name, value, tags = {}) {
        this.metrics.recordMetric(name, value, {
            device_id: this.deviceId,
            ...tags
        });
    }
    getDeviceStats() {
        return this.analytics.getDeviceStats(this.deviceId);
    }
}
exports.DeviceMonitoring = DeviceMonitoring;
/**
 * Helper class to simplify monitoring integration in session-related code.
 */
class SessionMonitoring {
    constructor(sessionId, userId) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.analytics = AnalyticsCollector_1.AnalyticsCollector.getInstance();
    }
    start() {
        this.analytics.startSession(this.sessionId, this.userId);
    }
    end() {
        this.analytics.endSession(this.sessionId, this.userId);
    }
    onFeatureUsed(feature, deviceId) {
        this.analytics.trackFeatureUsage(feature, deviceId, this.userId, this.sessionId);
    }
    onError(error, context, deviceId) {
        this.analytics.trackError(error, context, deviceId, this.userId, this.sessionId);
    }
}
exports.SessionMonitoring = SessionMonitoring;
//# sourceMappingURL=index.js.map