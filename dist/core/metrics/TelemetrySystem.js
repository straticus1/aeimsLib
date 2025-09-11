"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetrySystem = exports.TelemetryType = void 0;
const events_1 = require("events");
const ValidationError_1 = require("../errors/ValidationError");
/**
 * Telemetry Data Types
 */
var TelemetryType;
(function (TelemetryType) {
    // System telemetry
    TelemetryType["SYSTEM"] = "system";
    TelemetryType["PROCESS"] = "process";
    TelemetryType["MEMORY"] = "memory";
    TelemetryType["NETWORK"] = "network";
    // Device telemetry
    TelemetryType["DEVICE"] = "device";
    TelemetryType["PROTOCOL"] = "protocol";
    TelemetryType["COMMAND"] = "command";
    TelemetryType["ERROR"] = "error";
    // Performance telemetry
    TelemetryType["LATENCY"] = "latency";
    TelemetryType["THROUGHPUT"] = "throughput";
    TelemetryType["UTILIZATION"] = "utilization";
    // Custom telemetry
    TelemetryType["CUSTOM"] = "custom";
})(TelemetryType || (exports.TelemetryType = TelemetryType = {}));
/**
 * Telemetry System
 * Collects, processes, and analyzes telemetry data
 */
class TelemetrySystem extends events_1.EventEmitter {
    constructor(database, logger, metrics, options = {}) {
        super();
        this.database = database;
        this.logger = logger;
        this.metrics = metrics;
        this.series = new Map();
        this.buffer = [];
        this.options = this.initializeOptions(options);
        this.setupTimers();
    }
    /**
     * Initialize telemetry system
     */
    async initialize() {
        try {
            // Load series definitions
            await this.loadSeries();
            // Start processing
            await this.startProcessing();
        }
        catch (error) {
            this.logger.error('Failed to initialize telemetry system:', error);
            throw error;
        }
    }
    /**
     * Register telemetry series
     */
    registerSeries(series) {
        // Validate series
        this.validateSeries(series);
        // Store series
        this.series.set(series.id, series);
    }
    /**
     * Track telemetry point
     */
    async track(point) {
        // Add point ID if missing
        if (!point.id) {
            point.id = this.generatePointId();
        }
        // Add to buffer
        this.buffer.push(point);
        // Check buffer size
        if (this.buffer.length >= this.options.bufferSize) {
            await this.processBuffer();
        }
    }
    /**
     * Query telemetry data
     */
    async query(options) {
        const query = this.buildQuery(options);
        const results = await this.database.query(query);
        return this.transformResults(results, options);
    }
    /**
     * Get telemetry statistics
     */
    async getStats(options) {
        const end = Date.now();
        const start = end - (options?.duration || 86400000); // Default 24 hours
        const results = await this.database.query({
            collection: 'telemetry_stats',
            filter: {
                timestamp: { $gte: start, $lte: end },
                ...(options?.types && { type: { $in: options.types } }),
                ...(options?.sources && { source: { $in: options.sources } })
            }
        });
        return {
            points: results.reduce((sum, r) => sum + r.points, 0),
            sources: new Set(results.map(r => r.source)).size,
            types: new Set(results.map(r => r.type)).size,
            size: results.reduce((sum, r) => sum + r.size, 0)
        };
    }
    /**
     * Initialize options
     */
    initializeOptions(options) {
        return {
            collectInterval: options.collectInterval || 1000,
            batchSize: options.batchSize || 1000,
            bufferSize: options.bufferSize || 10000,
            storagePrefix: options.storagePrefix || 'telemetry',
            retentionDays: options.retentionDays || 30,
            processWorkers: options.processWorkers || 1,
            processInterval: options.processInterval || 1000,
            alertEnabled: options.alertEnabled !== false,
            alertInterval: options.alertInterval || 60000
        };
    }
    /**
     * Setup processing timers
     */
    setupTimers() {
        // Process timer
        this.processTimer = setInterval(() => this.processBuffer().catch(err => this.logger.error('Process error:', err)), this.options.processInterval);
        // Collection timer
        this.collectTimer = setInterval(() => this.collectMetrics().catch(err => this.logger.error('Collection error:', err)), this.options.collectInterval);
        // Alert timer
        if (this.options.alertEnabled) {
            this.alertTimer = setInterval(() => this.checkAlerts().catch(err => this.logger.error('Alert error:', err)), this.options.alertInterval);
        }
    }
    /**
     * Load series definitions
     */
    async loadSeries() {
        try {
            const prefix = `${this.options.storagePrefix}:series:`;
            const keys = await this.database.keys(prefix);
            for (const key of keys) {
                const data = await this.database.get(key);
                if (!data)
                    continue;
                const series = JSON.parse(data);
                this.validateSeries(series);
                this.series.set(series.id, series);
            }
        }
        catch (error) {
            this.logger.error('Failed to load series:', error);
            throw error;
        }
    }
    /**
     * Validate telemetry series
     */
    validateSeries(series) {
        if (!series.id) {
            throw new ValidationError_1.ValidationError('Series must have an ID');
        }
        if (!series.name) {
            throw new ValidationError_1.ValidationError('Series must have a name');
        }
        if (!series.type) {
            throw new ValidationError_1.ValidationError('Series must have a type');
        }
        // Validate alerts
        if (series.alerts) {
            for (const alert of series.alerts) {
                if (!alert.condition) {
                    throw new ValidationError_1.ValidationError('Alert must have a condition');
                }
                if (alert.threshold === undefined) {
                    throw new ValidationError_1.ValidationError('Alert must have a threshold');
                }
                if (!alert.message) {
                    throw new ValidationError_1.ValidationError('Alert must have a message');
                }
            }
        }
    }
    /**
     * Start telemetry processing
     */
    async startProcessing() {
        // Ensure storage collections exist
        await this.database.createCollection('telemetry_points');
        await this.database.createCollection('telemetry_stats');
        await this.database.createCollection('telemetry_alerts');
        // Create indexes
        await this.database.createIndex('telemetry_points', {
            timestamp: 1,
            type: 1,
            source: 1
        });
        await this.database.createIndex('telemetry_stats', {
            timestamp: 1,
            type: 1,
            source: 1
        });
        // Start retention management
        this.manageRetention().catch(err => this.logger.error('Retention error:', err));
    }
    /**
     * Process telemetry buffer
     */
    async processBuffer() {
        if (this.buffer.length === 0) {
            return;
        }
        const points = this.buffer.splice(0, this.options.batchSize);
        const batches = [];
        // Split into batches
        for (let i = 0; i < points.length; i += this.options.batchSize) {
            batches.push(points.slice(i, i + this.options.batchSize));
        }
        // Process batches in parallel
        await Promise.all(batches.map(batch => this.processBatch(batch)));
    }
    /**
     * Process batch of telemetry points
     */
    async processBatch(points) {
        try {
            // Store points
            await this.database.insertMany('telemetry_points', points);
            // Update statistics
            const stats = this.calculateStats(points);
            await this.updateStats(stats);
            // Check alerts
            if (this.options.alertEnabled) {
                await this.checkAlertsForPoints(points);
            }
        }
        catch (error) {
            this.logger.error('Batch processing error:', error);
            throw error;
        }
    }
    /**
     * Calculate batch statistics
     */
    calculateStats(points) {
        const stats = new Map();
        for (const point of points) {
            const key = `${point.type}:${point.source || 'unknown'}`;
            const existing = stats.get(key);
            if (existing) {
                existing.points++;
                existing.size += JSON.stringify(point).length;
            }
            else {
                stats.set(key, {
                    type: point.type,
                    source: point.source || 'unknown',
                    points: 1,
                    size: JSON.stringify(point).length
                });
            }
        }
        return Array.from(stats.values());
    }
    /**
     * Update telemetry statistics
     */
    async updateStats(stats) {
        const timestamp = Math.floor(Date.now() / 60000) * 60000;
        for (const stat of stats) {
            await this.database.update('telemetry_stats', {
                timestamp,
                type: stat.type,
                source: stat.source
            }, {
                $inc: {
                    points: stat.points,
                    size: stat.size
                }
            }, { upsert: true });
        }
    }
    /**
     * Check alerts for telemetry points
     */
    async checkAlertsForPoints(points) {
        for (const point of points) {
            const series = this.series.get(point.type);
            if (!series?.alerts)
                continue;
            for (const alert of series.alerts) {
                try {
                    const triggered = this.evaluateAlert(point, alert);
                    if (triggered) {
                        await this.handleAlert(point, alert);
                    }
                }
                catch (error) {
                    this.logger.error(`Alert evaluation error for ${series.id}:`, error);
                }
            }
        }
    }
    /**
     * Evaluate alert condition
     */
    evaluateAlert(point, alert) {
        try {
            return new Function('point', 'threshold', `return ${alert.condition}`)(point, alert.threshold);
        }
        catch (error) {
            throw new Error(`Invalid alert condition: ${alert.condition}`);
        }
    }
    /**
     * Handle triggered alert
     */
    async handleAlert(point, alert) {
        const alertData = {
            timestamp: Date.now(),
            type: point.type,
            source: point.source,
            pointId: point.id,
            severity: alert.severity,
            message: alert.message,
            context: point.context
        };
        // Store alert
        await this.database.insert('telemetry_alerts', alertData);
        // Emit alert event
        this.emit('alert', alertData);
    }
    /**
     * Check alerts periodically
     */
    async checkAlerts() {
        const now = Date.now();
        const alertChecks = [];
        for (const series of this.series.values()) {
            if (!series.alerts)
                continue;
            for (const alert of series.alerts) {
                alertChecks.push(this.checkSeriesAlert(series, alert, now));
            }
        }
        await Promise.all(alertChecks);
    }
    /**
     * Check alert for series
     */
    async checkSeriesAlert(series, alert, timestamp) {
        try {
            // Get recent points
            const points = await this.query({
                types: [series.type],
                start: timestamp - this.options.alertInterval,
                end: timestamp,
                aggregation: series.aggregation
            });
            // Check each point
            for (const point of points) {
                const triggered = this.evaluateAlert(point, alert);
                if (triggered) {
                    await this.handleAlert(point, alert);
                }
            }
        }
        catch (error) {
            this.logger.error(`Alert check error for ${series.id}:`, error);
        }
    }
    /**
     * Collect system metrics
     */
    async collectMetrics() {
        try {
            const metrics = await this.metrics.collect();
            for (const [type, values] of Object.entries(metrics)) {
                await this.track({
                    type: type,
                    source: 'system',
                    timestamp: Date.now(),
                    values
                });
            }
        }
        catch (error) {
            this.logger.error('Metrics collection error:', error);
        }
    }
    /**
     * Manage data retention
     */
    async manageRetention() {
        const cutoff = Date.now() - (this.options.retentionDays * 86400000);
        try {
            // Delete old points
            await this.database.delete('telemetry_points', {
                timestamp: { $lt: cutoff }
            });
            // Delete old stats
            await this.database.delete('telemetry_stats', {
                timestamp: { $lt: cutoff }
            });
            // Delete old alerts
            await this.database.delete('telemetry_alerts', {
                timestamp: { $lt: cutoff }
            });
        }
        catch (error) {
            this.logger.error('Retention management error:', error);
        }
    }
    /**
     * Build database query
     */
    buildQuery(options) {
        const query = {};
        // Time range
        if (options.start || options.end) {
            query.timestamp = {};
            if (options.start) {
                query.timestamp.$gte = options.start;
            }
            if (options.end) {
                query.timestamp.$lte = options.end;
            }
        }
        else if (options.duration) {
            query.timestamp = {
                $gte: Date.now() - options.duration
            };
        }
        // Series selection
        if (options.series?.length) {
            query.series = { $in: options.series };
        }
        if (options.types?.length) {
            query.type = { $in: options.types };
        }
        if (options.sources?.length) {
            query.source = { $in: options.sources };
        }
        if (options.tags?.length) {
            query.tags = { $all: options.tags };
        }
        // Custom filter
        if (options.filter) {
            try {
                const filter = new Function('point', `return ${options.filter}`);
                query.$where = filter;
            }
            catch (error) {
                throw new Error(`Invalid filter expression: ${options.filter}`);
            }
        }
        return {
            collection: 'telemetry_points',
            filter: query,
            sort: { timestamp: 1 },
            limit: options.limit
        };
    }
    /**
     * Transform query results
     */
    transformResults(results, options) {
        if (!options.aggregation || !options.interval) {
            return results;
        }
        // Group points by interval
        const groups = new Map();
        const interval = options.interval;
        for (const point of results) {
            const timestamp = Math.floor(point.timestamp / interval) * interval;
            const group = groups.get(timestamp) || [];
            group.push(point);
            groups.set(timestamp, group);
        }
        // Aggregate groups
        return Array.from(groups.entries()).map(([timestamp, points]) => ({
            timestamp,
            type: points[0].type,
            source: points[0].source,
            values: this.aggregateValues(points, options.aggregation),
            context: points[0].context
        }));
    }
    /**
     * Aggregate point values
     */
    aggregateValues(points, aggregation) {
        const values = {};
        // Collect values
        for (const point of points) {
            for (const [key, value] of Object.entries(point.values)) {
                if (typeof value === 'number') {
                    values[key] = values[key] || [];
                    values[key].push(value);
                }
            }
        }
        // Aggregate values
        const result = {};
        for (const [key, nums] of Object.entries(values)) {
            switch (aggregation) {
                case 'avg':
                    result[key] = nums.reduce((a, b) => a + b, 0) / nums.length;
                    break;
                case 'sum':
                    result[key] = nums.reduce((a, b) => a + b, 0);
                    break;
                case 'min':
                    result[key] = Math.min(...nums);
                    break;
                case 'max':
                    result[key] = Math.max(...nums);
                    break;
                case 'count':
                    result[key] = nums.length;
                    break;
            }
        }
        return result;
    }
    /**
     * Generate point ID
     */
    generatePointId() {
        return `pt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    /**
     * Cleanup resources
     */
    destroy() {
        if (this.processTimer) {
            clearInterval(this.processTimer);
        }
        if (this.collectTimer) {
            clearInterval(this.collectTimer);
        }
        if (this.alertTimer) {
            clearInterval(this.alertTimer);
        }
    }
}
exports.TelemetrySystem = TelemetrySystem;
//# sourceMappingURL=TelemetrySystem.js.map