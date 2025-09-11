"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebSocketEvents = setupWebSocketEvents;
const express_1 = require("express");
const index_1 = require("../index");
const router = (0, express_1.Router)();
/**
 * Metrics Visualization
 */
// Get real-time metrics for visualization
router.get('/visualization/metrics/realtime', (req, res) => {
    const metrics = index_1.MetricsCollector.getInstance();
    const { types = Object.values(index_1.MetricType), categories = Object.values(index_1.MetricCategory), timeWindow = 3600000 // 1 hour default
     } = req.query;
    const now = Date.now();
    const startTime = now - timeWindow;
    const data = metrics.getMetrics({
        startTime,
        endTime: now,
        type: types,
        category: categories
    });
    // Transform data for visualization
    const visualData = Object.entries(data).map(([name, metric]) => {
        const config = metrics.getMetricConfig(name);
        return {
            name,
            type: config?.type,
            category: config?.category,
            description: config?.description,
            data: {
                current: metric.avg,
                min: metric.min,
                max: metric.max,
                percentiles: {
                    p50: metric.p50,
                    p90: metric.p90,
                    p95: metric.p95,
                    p99: metric.p99
                },
                trend: metric.values?.map(v => ({
                    value: v.value,
                    timestamp: v.timestamp
                }))
            }
        };
    });
    res.json({
        timeRange: {
            start: startTime,
            end: now
        },
        metrics: visualData
    });
});
// Get device activity timeline
router.get('/visualization/timeline/:deviceId', (req, res) => {
    const analytics = index_1.AnalyticsCollector.getInstance();
    const { deviceId } = req.params;
    const { timeWindow = 86400000 } = req.query; // 24 hours default
    const now = Date.now();
    const startTime = now - timeWindow;
    // Get all device events
    const events = analytics.queryEvents({
        deviceIds: [deviceId],
        startTime,
        endTime: now
    });
    // Group events by type
    const eventGroups = events.reduce((groups, event) => {
        const group = groups[event.type] || [];
        group.push({
            timestamp: event.timestamp,
            duration: event.duration,
            success: event.success,
            metadata: event.metadata
        });
        groups[event.type] = group;
        return groups;
    }, {});
    res.json({
        deviceId,
        timeRange: {
            start: startTime,
            end: now
        },
        events: eventGroups
    });
});
// Get pattern usage heatmap
router.get('/visualization/patterns/heatmap', (req, res) => {
    const analytics = index_1.AnalyticsCollector.getInstance();
    const { timeWindow = 604800000 } = req.query; // 7 days default
    const now = Date.now();
    const startTime = now - timeWindow;
    // Get pattern events
    const events = analytics.queryEvents({
        types: [
            'pattern_started',
            'pattern_stopped',
            'pattern_modified'
        ],
        startTime,
        endTime: now
    });
    // Create hourly buckets for the heatmap
    const hourlyBuckets = Array(24).fill(0);
    const dayBuckets = Array(7).fill(() => Array(24).fill(0));
    events.forEach(event => {
        const date = new Date(event.timestamp);
        const hour = date.getHours();
        const day = date.getDay();
        if (event.type === 'pattern_started') {
            hourlyBuckets[hour]++;
            dayBuckets[day][hour]++;
        }
    });
    res.json({
        timeRange: {
            start: startTime,
            end: now
        },
        hourly: hourlyBuckets,
        daily: dayBuckets
    });
});
// Get error rate tracking
router.get('/visualization/errors', (req, res) => {
    const analytics = index_1.AnalyticsCollector.getInstance();
    const metrics = index_1.MetricsCollector.getInstance();
    const { timeWindow = 86400000 } = req.query; // 24 hours default
    const now = Date.now();
    const startTime = now - timeWindow;
    // Get error events
    const events = analytics.queryEvents({
        types: ['error_occurred'],
        startTime,
        endTime: now
    });
    // Group errors by type
    const errorTypes = events.reduce((types, event) => {
        const type = event.error?.name || 'unknown';
        types[type] = (types[type] || 0) + 1;
        return types;
    }, {});
    // Get error rate metrics
    const errorMetrics = metrics.getMetrics({
        category: index_1.MetricCategory.ERROR,
        startTime,
        endTime: now
    });
    res.json({
        timeRange: {
            start: startTime,
            end: now
        },
        errorCounts: errorTypes,
        errorRates: errorMetrics
    });
});
// Get performance dashboard data
router.get('/visualization/performance', (req, res) => {
    const metrics = index_1.MetricsCollector.getInstance();
    const { timeWindow = 3600000 } = req.query; // 1 hour default
    const now = Date.now();
    const startTime = now - timeWindow;
    // Get performance metrics
    const performanceMetrics = metrics.getMetrics({
        category: index_1.MetricCategory.PERFORMANCE,
        startTime,
        endTime: now
    });
    // Get device latency data
    const latencyData = metrics.getMetricValues('device.latency', {
        startTime,
        endTime: now
    });
    // Calculate latency percentiles
    const latencies = latencyData.map(d => d.value).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    // Get command queue metrics
    const queueMetrics = metrics.getMetricValues('performance.command_queue', {
        startTime,
        endTime: now
    });
    res.json({
        timeRange: {
            start: startTime,
            end: now
        },
        systemMetrics: {
            memory: performanceMetrics['performance.memory'],
            cpu: performanceMetrics['performance.cpu']
        },
        latency: {
            current: latencies[latencies.length - 1],
            average: latencies.reduce((a, b) => a + b, 0) / latencies.length,
            percentiles: { p50, p95, p99 }
        },
        commandQueue: {
            current: queueMetrics[queueMetrics.length - 1]?.value || 0,
            history: queueMetrics.map(m => ({
                value: m.value,
                timestamp: m.timestamp
            }))
        }
    });
});
/**
 * WebSocket Events for Real-time Updates
 */
function setupWebSocketEvents(io) {
    const metrics = index_1.MetricsCollector.getInstance();
    const analytics = index_1.AnalyticsCollector.getInstance();
    // Emit metric updates
    metrics.on('metric', (data) => {
        io.emit('metric_update', {
            name: data.name,
            value: data.value,
            config: data.config
        });
    });
    // Emit analytics events
    analytics.on('eventTracked', (event) => {
        io.emit('analytics_event', {
            type: event.type,
            deviceId: event.deviceId,
            timestamp: event.timestamp,
            data: event.data
        });
    });
    // Handle client connections
    io.on('connection', (socket) => {
        // Subscribe to specific device updates
        socket.on('subscribe_device', (deviceId) => {
            socket.join(`device:${deviceId}`);
        });
        // Unsubscribe from device updates
        socket.on('unsubscribe_device', (deviceId) => {
            socket.leave(`device:${deviceId}`);
        });
        // Subscribe to metric category
        socket.on('subscribe_metrics', (category) => {
            socket.join(`metrics:${category}`);
        });
        // Unsubscribe from metric category
        socket.on('unsubscribe_metrics', (category) => {
            socket.leave(`metrics:${category}`);
        });
    });
    // Emit device-specific events
    analytics.on('eventTracked', (event) => {
        if (event.deviceId) {
            io.to(`device:${event.deviceId}`).emit('device_event', {
                type: event.type,
                timestamp: event.timestamp,
                data: event.data
            });
        }
    });
    // Emit category-specific metrics
    metrics.on('metric', (data) => {
        if (data.config.category) {
            io.to(`metrics:${data.config.category}`).emit('category_metric', {
                category: data.config.category,
                name: data.name,
                value: data.value
            });
        }
    });
}
exports.default = router;
//# sourceMappingURL=visualization.js.map