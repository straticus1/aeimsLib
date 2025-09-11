"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsCollector = exports.AnalyticsEventType = void 0;
const events_1 = require("events");
const Logger_1 = require("../utils/Logger");
var AnalyticsEventType;
(function (AnalyticsEventType) {
    AnalyticsEventType["DEVICE_CONNECTED"] = "device_connected";
    AnalyticsEventType["DEVICE_DISCONNECTED"] = "device_disconnected";
    AnalyticsEventType["COMMAND_SENT"] = "command_sent";
    AnalyticsEventType["COMMAND_COMPLETED"] = "command_completed";
    AnalyticsEventType["COMMAND_FAILED"] = "command_failed";
    AnalyticsEventType["PATTERN_STARTED"] = "pattern_started";
    AnalyticsEventType["PATTERN_STOPPED"] = "pattern_stopped";
    AnalyticsEventType["PATTERN_MODIFIED"] = "pattern_modified";
    AnalyticsEventType["SESSION_STARTED"] = "session_started";
    AnalyticsEventType["SESSION_ENDED"] = "session_ended";
    AnalyticsEventType["ERROR_OCCURRED"] = "error_occurred";
    AnalyticsEventType["STATE_CHANGED"] = "state_changed";
    AnalyticsEventType["FEATURE_USED"] = "feature_used";
})(AnalyticsEventType || (exports.AnalyticsEventType = AnalyticsEventType = {}));
class AnalyticsCollector extends events_1.EventEmitter {
    constructor() {
        super();
        this.events = [];
        this.deviceStats = new Map();
        this.activeSessions = new Map(); // sessionId -> startTime
        this.retentionPeriodMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        this.maxEventsPerDevice = 1000;
        this.flushInterval = null;
        this.defaultFlushIntervalMs = 300000; // 5 minutes
        this.logger = Logger_1.Logger.getInstance();
        this.startPeriodicFlush();
    }
    static getInstance() {
        if (!AnalyticsCollector.instance) {
            AnalyticsCollector.instance = new AnalyticsCollector();
        }
        return AnalyticsCollector.instance;
    }
    trackEvent(event) {
        try {
            // Set timestamp if not provided
            if (!event.timestamp) {
                event.timestamp = Date.now();
            }
            this.events.push(event);
            this.updateDeviceStats(event);
            this.emit('eventTracked', event);
            // Clean up old events periodically
            if (this.events.length % 100 === 0) {
                this.cleanupOldEvents();
            }
        }
        catch (error) {
            this.logger.error('Error tracking analytics event', {
                error,
                event
            });
        }
    }
    trackDeviceConnection(device, userId, sessionId) {
        this.trackEvent({
            type: AnalyticsEventType.DEVICE_CONNECTED,
            timestamp: Date.now(),
            deviceId: device.id,
            userId,
            sessionId,
            data: {
                deviceInfo: device.info
            }
        });
        const stats = this.getOrCreateDeviceStats(device.id);
        stats.totalConnections++;
        stats.lastSeen = Date.now();
    }
    trackDeviceDisconnection(deviceId, userId, sessionId) {
        this.trackEvent({
            type: AnalyticsEventType.DEVICE_DISCONNECTED,
            timestamp: Date.now(),
            deviceId,
            userId,
            sessionId
        });
    }
    trackCommandExecution(deviceId, commandType, success, duration, error, metadata) {
        const eventType = success
            ? AnalyticsEventType.COMMAND_COMPLETED
            : AnalyticsEventType.COMMAND_FAILED;
        this.trackEvent({
            type: eventType,
            timestamp: Date.now(),
            deviceId,
            data: { commandType },
            duration,
            success,
            error,
            metadata
        });
        const stats = this.getOrCreateDeviceStats(deviceId);
        stats.totalCommandsSent++;
        if (!success) {
            stats.totalCommandsFailed++;
            const errorType = error?.name || 'UnknownError';
            stats.errorRates[errorType] = (stats.errorRates[errorType] || 0) + 1;
        }
    }
    trackPatternUsage(deviceId, patternId, action, params, metadata) {
        let eventType;
        switch (action) {
            case 'start':
                eventType = AnalyticsEventType.PATTERN_STARTED;
                break;
            case 'stop':
                eventType = AnalyticsEventType.PATTERN_STOPPED;
                break;
            case 'modify':
                eventType = AnalyticsEventType.PATTERN_MODIFIED;
                break;
        }
        this.trackEvent({
            type: eventType,
            timestamp: Date.now(),
            deviceId,
            data: {
                patternId,
                ...params
            },
            metadata
        });
        const stats = this.getOrCreateDeviceStats(deviceId);
        if (action === 'start') {
            stats.totalPatternRuns++;
        }
    }
    startSession(sessionId, userId) {
        this.activeSessions.set(sessionId, Date.now());
        this.trackEvent({
            type: AnalyticsEventType.SESSION_STARTED,
            timestamp: Date.now(),
            sessionId,
            userId
        });
    }
    endSession(sessionId, userId) {
        const startTime = this.activeSessions.get(sessionId);
        if (!startTime) {
            this.logger.warn('Attempting to end unknown session', { sessionId });
            return;
        }
        const duration = Date.now() - startTime;
        this.activeSessions.delete(sessionId);
        this.trackEvent({
            type: AnalyticsEventType.SESSION_ENDED,
            timestamp: Date.now(),
            sessionId,
            userId,
            duration
        });
        // Update device stats if session was associated with a device
        const sessionEvents = this.queryEvents({
            sessionIds: [sessionId]
        });
        const deviceId = sessionEvents[0]?.deviceId;
        if (deviceId) {
            const stats = this.getOrCreateDeviceStats(deviceId);
            stats.totalSessionTime += duration;
            const sessionCount = this.queryEvents({
                types: [AnalyticsEventType.SESSION_ENDED],
                deviceIds: [deviceId]
            }).length;
            stats.averageSessionDuration = stats.totalSessionTime / sessionCount;
        }
    }
    trackError(error, context, deviceId, userId, sessionId) {
        this.trackEvent({
            type: AnalyticsEventType.ERROR_OCCURRED,
            timestamp: Date.now(),
            deviceId,
            userId,
            sessionId,
            error,
            data: context
        });
        if (deviceId) {
            const stats = this.getOrCreateDeviceStats(deviceId);
            const errorType = error.name || 'UnknownError';
            stats.errorRates[errorType] = (stats.errorRates[errorType] || 0) + 1;
        }
    }
    trackStateChange(deviceId, stateKey, oldValue, newValue, metadata) {
        this.trackEvent({
            type: AnalyticsEventType.STATE_CHANGED,
            timestamp: Date.now(),
            deviceId,
            data: {
                stateKey,
                oldValue,
                newValue
            },
            metadata
        });
    }
    trackFeatureUsage(feature, deviceId, userId, sessionId, metadata) {
        this.trackEvent({
            type: AnalyticsEventType.FEATURE_USED,
            timestamp: Date.now(),
            deviceId,
            userId,
            sessionId,
            data: { feature },
            metadata
        });
        if (deviceId) {
            const stats = this.getOrCreateDeviceStats(deviceId);
            const featureUsage = stats.topFeatures.find(f => f.feature === feature);
            if (featureUsage) {
                featureUsage.count++;
            }
            else {
                stats.topFeatures.push({ feature, count: 1 });
            }
            // Sort by count in descending order
            stats.topFeatures.sort((a, b) => b.count - a.count);
        }
    }
    queryEvents(filter = {}) {
        return this.events.filter(event => {
            if (filter.types && !filter.types.includes(event.type))
                return false;
            if (filter.deviceIds && event.deviceId && !filter.deviceIds.includes(event.deviceId))
                return false;
            if (filter.userIds && event.userId && !filter.userIds.includes(event.userId))
                return false;
            if (filter.sessionIds && event.sessionId && !filter.sessionIds.includes(event.sessionId))
                return false;
            if (filter.startTime && event.timestamp < filter.startTime)
                return false;
            if (filter.endTime && event.timestamp > filter.endTime)
                return false;
            return true;
        }).slice(-(filter.limit || this.events.length));
    }
    getDeviceStats(deviceId) {
        return this.deviceStats.get(deviceId);
    }
    getAllDeviceStats() {
        return Array.from(this.deviceStats.values());
    }
    getSnapshot(startTime, endTime = Date.now()) {
        return {
            events: this.queryEvents({ startTime, endTime }),
            deviceStats: Object.fromEntries(this.deviceStats),
            period: {
                start: startTime || this.events[0]?.timestamp || Date.now(),
                end: endTime
            }
        };
    }
    setRetentionPeriod(days) {
        this.retentionPeriodMs = days * 24 * 60 * 60 * 1000;
        this.cleanupOldEvents();
    }
    startPeriodicFlush() {
        this.flushInterval = setInterval(() => {
            this.flush();
        }, this.defaultFlushIntervalMs);
    }
    async flush() {
        try {
            const snapshot = this.getSnapshot();
            this.emit('flush', snapshot);
            this.cleanupOldEvents();
        }
        catch (error) {
            this.logger.error('Error flushing analytics', { error });
        }
    }
    cleanupOldEvents() {
        const cutoff = Date.now() - this.retentionPeriodMs;
        this.events = this.events.filter(event => event.timestamp >= cutoff);
        // Also cleanup old device stats
        for (const [deviceId, stats] of this.deviceStats) {
            if (stats.lastSeen < cutoff) {
                this.deviceStats.delete(deviceId);
            }
        }
    }
    getOrCreateDeviceStats(deviceId) {
        let stats = this.deviceStats.get(deviceId);
        if (!stats) {
            stats = {
                deviceId,
                totalConnections: 0,
                totalCommandsSent: 0,
                totalCommandsFailed: 0,
                totalPatternRuns: 0,
                totalSessionTime: 0,
                averageSessionDuration: 0,
                lastSeen: Date.now(),
                topFeatures: [],
                errorRates: {}
            };
            this.deviceStats.set(deviceId, stats);
        }
        return stats;
    }
    updateDeviceStats(event) {
        if (!event.deviceId)
            return;
        const stats = this.getOrCreateDeviceStats(event.deviceId);
        stats.lastSeen = event.timestamp;
        // Additional stats updates are handled in specific tracking methods
    }
    dispose() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        this.removeAllListeners();
        this.events = [];
        this.deviceStats.clear();
        this.activeSessions.clear();
    }
}
exports.AnalyticsCollector = AnalyticsCollector;
//# sourceMappingURL=AnalyticsCollector.js.map