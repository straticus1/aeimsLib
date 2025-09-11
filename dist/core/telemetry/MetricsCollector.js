"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = void 0;
/**
 * MetricsCollector
 * Aggregates telemetry data into metrics for analysis.
 */
class MetricsCollector {
    constructor(telemetry) {
        this.telemetry = telemetry;
        this.metrics = new Map();
        this.values = new Map();
        this.initializeDefaultMetrics();
        this.setupTelemetryListeners();
    }
    /**
     * Register a new metric
     */
    registerMetric(metric) {
        if (this.metrics.has(metric.name)) {
            throw new Error(`Metric ${metric.name} already exists`);
        }
        this.metrics.set(metric.name, metric);
        this.values.set(metric.name, []);
    }
    /**
     * Record a value for a metric
     */
    recordMetric(name, value, labels) {
        const metric = this.metrics.get(name);
        if (!metric) {
            throw new Error(`Metric ${name} not found`);
        }
        const metricValues = this.values.get(name) || [];
        metricValues.push({
            value,
            labels,
            timestamp: Date.now()
        });
        // Trim old values (keep last 1000)
        if (metricValues.length > 1000) {
            metricValues.splice(0, metricValues.length - 1000);
        }
        this.values.set(name, metricValues);
    }
    /**
     * Get metric values
     */
    getMetricValues(name, timeRange) {
        const values = this.values.get(name) || [];
        if (!timeRange)
            return values;
        return values.filter(v => v.timestamp >= timeRange.start &&
            v.timestamp <= timeRange.end);
    }
    /**
     * Get metric statistics
     */
    getMetricStats(name, timeRange) {
        const metric = this.metrics.get(name);
        if (!metric) {
            throw new Error(`Metric ${name} not found`);
        }
        const values = this.getMetricValues(name, timeRange)
            .map(v => v.value);
        if (values.length === 0) {
            return {
                count: 0,
                min: null,
                max: null,
                avg: null,
                p50: null,
                p90: null,
                p99: null
            };
        }
        const sorted = [...values].sort((a, b) => a - b);
        return {
            count: values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            p50: this.percentile(sorted, 50),
            p90: this.percentile(sorted, 90),
            p99: this.percentile(sorted, 99)
        };
    }
    /**
     * Get all metrics
     */
    getMetrics() {
        return Array.from(this.metrics.values());
    }
    initializeDefaultMetrics() {
        // Device metrics
        this.registerMetric({
            name: 'device_connected_total',
            type: 'counter',
            description: 'Total number of device connections'
        });
        this.registerMetric({
            name: 'device_errors_total',
            type: 'counter',
            description: 'Total number of device errors',
            labels: ['error_type']
        });
        this.registerMetric({
            name: 'device_latency_ms',
            type: 'histogram',
            description: 'Device command latency in milliseconds',
            buckets: [10, 50, 100, 200, 500, 1000]
        });
        // Pattern metrics
        this.registerMetric({
            name: 'pattern_executions_total',
            type: 'counter',
            description: 'Total number of pattern executions',
            labels: ['pattern_type']
        });
        this.registerMetric({
            name: 'pattern_duration_ms',
            type: 'histogram',
            description: 'Pattern execution duration in milliseconds',
            buckets: [1000, 5000, 10000, 30000, 60000]
        });
        // Session metrics
        this.registerMetric({
            name: 'active_sessions',
            type: 'gauge',
            description: 'Number of currently active sessions'
        });
        this.registerMetric({
            name: 'session_duration_ms',
            type: 'histogram',
            description: 'Session duration in milliseconds',
            buckets: [60000, 300000, 900000, 1800000, 3600000]
        });
    }
    setupTelemetryListeners() {
        this.telemetry.on('event', (event) => {
            this.processEvent(event);
        });
    }
    processEvent(event) {
        switch (event.type) {
            case 'device_connected':
                this.recordMetric('device_connected_total', 1);
                break;
            case 'device_error':
                this.recordMetric('device_errors_total', 1, {
                    error_type: event.error?.name || 'unknown'
                });
                break;
            case 'pattern_start':
                this.recordMetric('pattern_executions_total', 1, {
                    pattern_type: event.data?.patternType || 'unknown'
                });
                break;
            case 'pattern_end':
                if (event.durationMs) {
                    this.recordMetric('pattern_duration_ms', event.durationMs);
                }
                break;
            case 'session_start':
                this.recordMetric('active_sessions', 1);
                break;
            case 'session_end':
                this.recordMetric('active_sessions', -1);
                if (event.durationMs) {
                    this.recordMetric('session_duration_ms', event.durationMs);
                }
                break;
        }
    }
    percentile(sorted, p) {
        if (sorted.length === 0)
            return 0;
        if (sorted.length === 1)
            return sorted[0];
        if (p <= 0)
            return sorted[0];
        if (p >= 100)
            return sorted[sorted.length - 1];
        const index = (p / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        if (upper === lower)
            return sorted[index];
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }
}
exports.MetricsCollector = MetricsCollector;
//# sourceMappingURL=MetricsCollector.js.map