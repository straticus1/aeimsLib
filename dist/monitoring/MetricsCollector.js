"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = exports.MetricCategory = exports.MetricType = void 0;
const events_1 = require("events");
const Logger_1 = require("../utils/Logger");
var MetricType;
(function (MetricType) {
    MetricType["COUNTER"] = "counter";
    MetricType["GAUGE"] = "gauge";
    MetricType["HISTOGRAM"] = "histogram";
    MetricType["METER"] = "meter";
})(MetricType || (exports.MetricType = MetricType = {}));
var MetricCategory;
(function (MetricCategory) {
    MetricCategory["DEVICE"] = "device";
    MetricCategory["PROTOCOL"] = "protocol";
    MetricCategory["WEBSOCKET"] = "websocket";
    MetricCategory["PERFORMANCE"] = "performance";
    MetricCategory["SECURITY"] = "security";
    MetricCategory["ERROR"] = "error";
})(MetricCategory || (exports.MetricCategory = MetricCategory = {}));
class MetricsCollector extends events_1.EventEmitter {
    constructor() {
        super();
        this.MAX_VALUES = 10000;
        this.metrics = new Map();
        this.metricValues = new Map();
        this.logger = Logger_1.Logger.getInstance();
        // Start periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldMetrics();
        }, 60000); // Every minute
    }
    static getInstance() {
        if (!MetricsCollector.instance) {
            MetricsCollector.instance = new MetricsCollector();
        }
        return MetricsCollector.instance;
    }
    registerMetric(config) {
        if (this.metrics.has(config.name)) {
            throw new Error(`Metric ${config.name} already registered`);
        }
        this.metrics.set(config.name, {
            ...config,
            retentionPeriod: config.retentionPeriod || 24 * 60 * 60 * 1000 // 24 hours default
        });
        this.metricValues.set(config.name, []);
    }
    recordMetric(name, value, tags = {}) {
        const config = this.metrics.get(name);
        if (!config) {
            throw new Error(`Metric ${name} not registered`);
        }
        // Validate value based on metric type
        this.validateMetricValue(value, config);
        const metricValue = {
            value,
            timestamp: Date.now(),
            tags
        };
        const values = this.metricValues.get(name);
        values.push(metricValue);
        // Emit metric update event
        this.emit('metric', {
            name,
            value: metricValue,
            config
        });
        // Trim old values if needed
        if (values.length > this.MAX_VALUES) {
            const cutoff = Date.now() - config.retentionPeriod;
            this.trimOldValues(name, cutoff);
        }
    }
    getMetrics(query = {}) {
        const result = {};
        const startTime = query.startTime || 0;
        const endTime = query.endTime || Date.now();
        for (const [name, config] of this.metrics) {
            // Filter by query parameters
            if (query.name && query.name !== name)
                continue;
            if (query.category && query.category !== config.category)
                continue;
            if (query.type && query.type !== config.type)
                continue;
            const values = this.metricValues.get(name)
                .filter(v => v.timestamp >= startTime && v.timestamp <= endTime)
                .filter(v => this.matchTags(v.tags, query.tags));
            if (values.length === 0)
                continue;
            result[name] = this.calculateMetricSummary(values, config);
        }
        return result;
    }
    getMetricValues(name, query = {}) {
        const config = this.metrics.get(name);
        if (!config) {
            throw new Error(`Metric ${name} not registered`);
        }
        const startTime = query.startTime || 0;
        const endTime = query.endTime || Date.now();
        const limit = query.limit || this.MAX_VALUES;
        return this.metricValues.get(name)
            .filter(v => v.timestamp >= startTime && v.timestamp <= endTime)
            .filter(v => this.matchTags(v.tags, query.tags))
            .slice(-limit);
    }
    getMetricConfig(name) {
        return this.metrics.get(name);
    }
    getAllMetricConfigs() {
        return Array.from(this.metrics.values());
    }
    clearMetric(name) {
        const config = this.metrics.get(name);
        if (!config) {
            throw new Error(`Metric ${name} not registered`);
        }
        this.metricValues.set(name, []);
    }
    validateMetricValue(value, config) {
        switch (config.type) {
            case MetricType.COUNTER:
                if (value < 0) {
                    throw new Error('Counter values must be non-negative');
                }
                break;
            case MetricType.HISTOGRAM:
                if (!config.buckets) {
                    throw new Error('Histogram metric requires buckets configuration');
                }
                break;
            case MetricType.METER:
                if (value < 0) {
                    throw new Error('Meter values must be non-negative');
                }
                break;
        }
    }
    trimOldValues(name, cutoff) {
        const values = this.metricValues.get(name);
        const index = values.findIndex(v => v.timestamp >= cutoff);
        if (index > 0) {
            this.metricValues.set(name, values.slice(index));
        }
    }
    matchTags(tags, queryTags) {
        if (!queryTags)
            return true;
        return Object.entries(queryTags).every(([key, value]) => tags[key] === value);
    }
    calculateMetricSummary(values, config) {
        const numericValues = values.map(v => v.value);
        const sum = numericValues.reduce((a, b) => a + b, 0);
        const count = numericValues.length;
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        const avg = sum / count;
        const summary = {
            count,
            sum,
            min,
            max,
            avg
        };
        // Calculate percentiles for histograms
        if (config.type === MetricType.HISTOGRAM) {
            const sorted = [...numericValues].sort((a, b) => a - b);
            summary.p50 = this.calculatePercentile(sorted, 50);
            summary.p90 = this.calculatePercentile(sorted, 90);
            summary.p95 = this.calculatePercentile(sorted, 95);
            summary.p99 = this.calculatePercentile(sorted, 99);
        }
        return summary;
    }
    calculatePercentile(sorted, percentile) {
        const index = (percentile / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        if (upper === lower)
            return sorted[index];
        return (sorted[lower] * (1 - weight)) + (sorted[upper] * weight);
    }
    cleanupOldMetrics() {
        const now = Date.now();
        for (const [name, config] of this.metrics) {
            const cutoff = now - config.retentionPeriod;
            this.trimOldValues(name, cutoff);
        }
        this.emit('cleanup', {
            timestamp: now,
            metrics: Array.from(this.metrics.keys())
        });
    }
    dispose() {
        clearInterval(this.cleanupInterval);
        this.removeAllListeners();
        this.metrics.clear();
        this.metricValues.clear();
    }
    // Standard metrics registration
    registerStandardMetrics() {
        // Device metrics
        this.registerMetric({
            name: 'device.connections',
            type: MetricType.COUNTER,
            category: MetricCategory.DEVICE,
            description: 'Number of device connections'
        });
        this.registerMetric({
            name: 'device.commands',
            type: MetricType.COUNTER,
            category: MetricCategory.DEVICE,
            description: 'Number of device commands sent'
        });
        this.registerMetric({
            name: 'device.errors',
            type: MetricType.COUNTER,
            category: MetricCategory.DEVICE,
            description: 'Number of device errors'
        });
        this.registerMetric({
            name: 'device.latency',
            type: MetricType.HISTOGRAM,
            category: MetricCategory.DEVICE,
            description: 'Device command latency',
            unit: 'ms',
            buckets: [10, 50, 100, 200, 500, 1000]
        });
        // Protocol metrics
        this.registerMetric({
            name: 'protocol.messages',
            type: MetricType.COUNTER,
            category: MetricCategory.PROTOCOL,
            description: 'Number of protocol messages'
        });
        this.registerMetric({
            name: 'protocol.errors',
            type: MetricType.COUNTER,
            category: MetricCategory.PROTOCOL,
            description: 'Number of protocol errors'
        });
        // WebSocket metrics
        this.registerMetric({
            name: 'websocket.connections',
            type: MetricType.GAUGE,
            category: MetricCategory.WEBSOCKET,
            description: 'Number of active WebSocket connections'
        });
        this.registerMetric({
            name: 'websocket.messages',
            type: MetricType.COUNTER,
            category: MetricCategory.WEBSOCKET,
            description: 'Number of WebSocket messages'
        });
        this.registerMetric({
            name: 'websocket.errors',
            type: MetricType.COUNTER,
            category: MetricCategory.WEBSOCKET,
            description: 'Number of WebSocket errors'
        });
        // Performance metrics
        this.registerMetric({
            name: 'performance.memory',
            type: MetricType.GAUGE,
            category: MetricCategory.PERFORMANCE,
            description: 'Memory usage',
            unit: 'MB'
        });
        this.registerMetric({
            name: 'performance.cpu',
            type: MetricType.GAUGE,
            category: MetricCategory.PERFORMANCE,
            description: 'CPU usage',
            unit: '%'
        });
        this.registerMetric({
            name: 'performance.command_queue',
            type: MetricType.GAUGE,
            category: MetricCategory.PERFORMANCE,
            description: 'Command queue length'
        });
        // Security metrics
        this.registerMetric({
            name: 'security.auth_failures',
            type: MetricType.COUNTER,
            category: MetricCategory.SECURITY,
            description: 'Number of authentication failures'
        });
        this.registerMetric({
            name: 'security.rate_limits',
            type: MetricType.COUNTER,
            category: MetricCategory.SECURITY,
            description: 'Number of rate limit hits'
        });
        // Error metrics
        this.registerMetric({
            name: 'error.count',
            type: MetricType.COUNTER,
            category: MetricCategory.ERROR,
            description: 'Total error count'
        });
        this.registerMetric({
            name: 'error.types',
            type: MetricType.COUNTER,
            category: MetricCategory.ERROR,
            description: 'Error count by type'
        });
    }
}
exports.MetricsCollector = MetricsCollector;
//# sourceMappingURL=MetricsCollector.js.map