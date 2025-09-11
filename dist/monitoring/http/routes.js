"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const router = (0, express_1.Router)();
/**
 * Metrics Endpoints
 */
// Get all metrics
router.get('/metrics', (req, res) => {
    const metrics = index_1.MetricsCollector.getInstance();
    const { category, type, startTime, endTime, tags } = req.query;
    const query = {};
    if (category)
        query.category = category;
    if (type)
        query.type = type;
    if (startTime)
        query.startTime = parseInt(startTime);
    if (endTime)
        query.endTime = parseInt(endTime);
    if (tags)
        query.tags = JSON.parse(tags);
    const results = metrics.getMetrics(query);
    res.json(results);
});
// Get specific metric by name
router.get('/metrics/:name', (req, res) => {
    const metrics = index_1.MetricsCollector.getInstance();
    const { name } = req.params;
    const { startTime, endTime, tags, limit } = req.query;
    const query = {};
    if (startTime)
        query.startTime = parseInt(startTime);
    if (endTime)
        query.endTime = parseInt(endTime);
    if (tags)
        query.tags = JSON.parse(tags);
    if (limit)
        query.limit = parseInt(limit);
    try {
        const values = metrics.getMetricValues(name, query);
        const config = metrics.getMetricConfig(name);
        res.json({
            name,
            config,
            values
        });
    }
    catch (error) {
        res.status(404).json({
            error: `Metric '${name}' not found`
        });
    }
});
// Get metrics summary
router.get('/metrics/summary', (req, res) => {
    const metrics = index_1.MetricsCollector.getInstance();
    const { startTime = Date.now() - 3600000, // Last hour by default
    endTime = Date.now() } = req.query;
    const results = metrics.getMetrics({
        startTime: parseInt(startTime),
        endTime: parseInt(endTime)
    });
    // Add metric metadata
    const summary = Object.entries(results).reduce((acc, [name, data]) => {
        const config = metrics.getMetricConfig(name);
        acc[name] = {
            ...data,
            config
        };
        return acc;
    }, {});
    res.json(summary);
});
/**
 * Analytics Endpoints
 */
// Get analytics events
router.get('/analytics/events', (req, res) => {
    const analytics = index_1.AnalyticsCollector.getInstance();
    const { types, deviceIds, userIds, sessionIds, startTime, endTime, limit } = req.query;
    const filter = {};
    if (types)
        filter.types = types.split(',');
    if (deviceIds)
        filter.deviceIds = deviceIds.split(',');
    if (userIds)
        filter.userIds = userIds.split(',');
    if (sessionIds)
        filter.sessionIds = sessionIds.split(',');
    if (startTime)
        filter.startTime = parseInt(startTime);
    if (endTime)
        filter.endTime = parseInt(endTime);
    if (limit)
        filter.limit = parseInt(limit);
    const events = analytics.queryEvents(filter);
    res.json(events);
});
// Get device statistics
router.get('/analytics/devices/:deviceId/stats', (req, res) => {
    const analytics = index_1.AnalyticsCollector.getInstance();
    const { deviceId } = req.params;
    const stats = analytics.getDeviceStats(deviceId);
    if (!stats) {
        res.status(404).json({
            error: `No statistics found for device '${deviceId}'`
        });
        return;
    }
    res.json(stats);
});
// Get all device statistics
router.get('/analytics/devices/stats', (req, res) => {
    const analytics = index_1.AnalyticsCollector.getInstance();
    const stats = analytics.getAllDeviceStats();
    res.json(stats);
});
// Get session events
router.get('/analytics/sessions/:sessionId', (req, res) => {
    const analytics = index_1.AnalyticsCollector.getInstance();
    const { sessionId } = req.params;
    const events = analytics.queryEvents({
        sessionIds: [sessionId]
    });
    if (events.length === 0) {
        res.status(404).json({
            error: `No events found for session '${sessionId}'`
        });
        return;
    }
    // Get session duration if session has ended
    const sessionStart = events.find(e => e.type === 'session_started');
    const sessionEnd = events.find(e => e.type === 'session_ended');
    const duration = sessionEnd && sessionStart
        ? sessionEnd.timestamp - sessionStart.timestamp
        : undefined;
    res.json({
        sessionId,
        events,
        duration,
        isActive: !sessionEnd && !!sessionStart
    });
});
// Get analytics snapshot
router.get('/analytics/snapshot', (req, res) => {
    const analytics = index_1.AnalyticsCollector.getInstance();
    const { startTime, endTime = Date.now() } = req.query;
    const snapshot = analytics.getSnapshot(startTime ? parseInt(startTime) : undefined, parseInt(endTime));
    res.json(snapshot);
});
exports.default = router;
//# sourceMappingURL=routes.js.map