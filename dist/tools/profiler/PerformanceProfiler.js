"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceProfiler = void 0;
const events_1 = require("events");
/**
 * Performance Profiler
 * Analyzes device and pattern performance with detailed metrics and recommendations
 */
class PerformanceProfiler extends events_1.EventEmitter {
    constructor(telemetry, options = {}) {
        super();
        this.telemetry = telemetry;
        this.samples = [];
        this.options = this.initializeOptions(options);
        this.startTime = Date.now();
        this.startSampling();
    }
    /**
     * Start profiling session
     */
    start() {
        this.startTime = Date.now();
        this.samples = [];
        this.startSampling();
        this.startReporting();
        // Track session start
        this.telemetry.track({
            type: 'profiler_session_start',
            timestamp: this.startTime,
            data: {
                options: this.options
            }
        });
    }
    /**
     * Stop profiling session
     */
    stop() {
        if (this.sampleTimer) {
            clearInterval(this.sampleTimer);
        }
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
        }
        // Track session end
        this.telemetry.track({
            type: 'profiler_session_end',
            timestamp: Date.now(),
            data: {
                duration: Date.now() - this.startTime,
                sampleCount: this.samples.length
            }
        });
    }
    /**
     * Add a performance event
     */
    addEvent(type, data) {
        const now = Date.now();
        const currentSample = this.getCurrentSample();
        if (currentSample) {
            currentSample.events.push({
                type,
                data
            });
        }
        // Track significant events
        if (this.isSignificantEvent(type, data)) {
            this.telemetry.track({
                type: 'profiler_significant_event',
                timestamp: now,
                data: {
                    eventType: type,
                    eventData: data
                }
            });
        }
    }
    /**
     * Get current performance report
     */
    async getReport() {
        const now = Date.now();
        const metrics = this.calculateMetrics();
        const anomalies = this.detectAnomalies(metrics);
        const recommendations = this.generateRecommendations(metrics, anomalies);
        const report = {
            timeRange: {
                start: this.startTime,
                end: now
            },
            summary: metrics,
            anomalies,
            recommendations
        };
        // Track report generation
        await this.telemetry.track({
            type: 'profiler_report_generated',
            timestamp: now,
            data: {
                reportTimeRange: report.timeRange,
                anomalyCount: anomalies.length,
                recommendationCount: recommendations.length
            }
        });
        return report;
    }
    /**
     * Get raw performance data
     */
    getRawData() {
        return this.samples;
    }
    initializeOptions(options) {
        return {
            sampleInterval: options.sampleInterval || 1000,
            bufferSize: options.bufferSize || 1000,
            historyLength: options.historyLength || 3600,
            latencyThreshold: options.latencyThreshold || 100,
            stallThreshold: options.stallThreshold || 1000,
            resourceThreshold: options.resourceThreshold || 0.8,
            reportInterval: options.reportInterval || 60000,
            metrics: options.metrics || [
                'latency',
                'commandRate',
                'memoryUsage',
                'patternAccuracy'
            ]
        };
    }
    startSampling() {
        this.sampleTimer = setInterval(() => {
            this.collectSample();
        }, this.options.sampleInterval);
    }
    startReporting() {
        this.reportTimer = setInterval(async () => {
            const report = await this.getReport();
            this.emit('report', report);
        }, this.options.reportInterval);
    }
    collectSample() {
        const metrics = this.collectMetrics();
        const sample = {
            timestamp: Date.now(),
            metrics,
            events: []
        };
        this.samples.push(sample);
        // Trim old samples
        while (this.samples.length > this.options.bufferSize) {
            this.samples.shift();
        }
        // Clean up old samples
        const cutoff = Date.now() - (this.options.historyLength * 1000);
        this.samples = this.samples.filter(s => s.timestamp >= cutoff);
        this.emit('sample', sample);
    }
    collectMetrics() {
        // Collect current metrics
        // This is a placeholder - real implementation would:
        // 1. Get process metrics (memory, CPU)
        // 2. Get network metrics
        // 3. Get command queue metrics
        // 4. Get pattern execution metrics
        return {
            avgLatency: 0,
            maxLatency: 0,
            p95Latency: 0,
            p99Latency: 0,
            jitter: 0,
            commandRate: 0,
            commandSuccess: 0,
            commandErrors: 0,
            queueLength: 0,
            memoryUsage: 0,
            cpuUsage: 0,
            networkBps: 0,
            bufferUsage: 0,
            patternAccuracy: 0,
            syncDeviation: 0,
            batteryImpact: 0
        };
    }
    calculateMetrics() {
        if (this.samples.length === 0) {
            return this.collectMetrics();
        }
        // Calculate aggregate metrics
        const metrics = this.samples.map(s => s.metrics);
        return {
            avgLatency: this.calculateAverage(metrics.map(m => m.avgLatency)),
            maxLatency: Math.max(...metrics.map(m => m.maxLatency)),
            p95Latency: this.calculatePercentile(metrics.map(m => m.avgLatency), 95),
            p99Latency: this.calculatePercentile(metrics.map(m => m.avgLatency), 99),
            jitter: this.calculateStdDev(metrics.map(m => m.avgLatency)),
            commandRate: this.calculateAverage(metrics.map(m => m.commandRate)),
            commandSuccess: this.calculateSum(metrics.map(m => m.commandSuccess)),
            commandErrors: this.calculateSum(metrics.map(m => m.commandErrors)),
            queueLength: this.calculateAverage(metrics.map(m => m.queueLength)),
            memoryUsage: this.calculateAverage(metrics.map(m => m.memoryUsage)),
            cpuUsage: this.calculateAverage(metrics.map(m => m.cpuUsage)),
            networkBps: this.calculateAverage(metrics.map(m => m.networkBps)),
            bufferUsage: this.calculateAverage(metrics.map(m => m.bufferUsage)),
            patternAccuracy: this.calculateAverage(metrics.map(m => m.patternAccuracy)),
            syncDeviation: this.calculateAverage(metrics.map(m => m.syncDeviation)),
            batteryImpact: this.calculateAverage(metrics.map(m => m.batteryImpact))
        };
    }
    detectAnomalies(metrics) {
        const anomalies = [];
        const now = Date.now();
        // Check latency anomalies
        if (metrics.avgLatency > this.options.latencyThreshold) {
            anomalies.push({
                type: 'high_latency',
                severity: 'warning',
                metric: 'avgLatency',
                value: metrics.avgLatency,
                threshold: this.options.latencyThreshold,
                timestamp: now
            });
        }
        // Check stall conditions
        if (metrics.maxLatency > this.options.stallThreshold) {
            anomalies.push({
                type: 'command_stall',
                severity: 'error',
                metric: 'maxLatency',
                value: metrics.maxLatency,
                threshold: this.options.stallThreshold,
                timestamp: now
            });
        }
        // Check resource usage
        if (metrics.memoryUsage > this.options.resourceThreshold) {
            anomalies.push({
                type: 'high_memory',
                severity: 'warning',
                metric: 'memoryUsage',
                value: metrics.memoryUsage,
                threshold: this.options.resourceThreshold,
                timestamp: now
            });
        }
        if (metrics.cpuUsage > this.options.resourceThreshold) {
            anomalies.push({
                type: 'high_cpu',
                severity: 'warning',
                metric: 'cpuUsage',
                value: metrics.cpuUsage,
                threshold: this.options.resourceThreshold,
                timestamp: now
            });
        }
        return anomalies;
    }
    generateRecommendations(metrics, anomalies) {
        const recommendations = [];
        // Latency recommendations
        if (metrics.avgLatency > this.options.latencyThreshold) {
            recommendations.push({
                type: 'reduce_latency',
                description: 'Consider reducing pattern complexity or increasing update interval',
                impact: 'high',
                metrics: ['avgLatency', 'jitter']
            });
        }
        // Resource recommendations
        if (metrics.memoryUsage > this.options.resourceThreshold) {
            recommendations.push({
                type: 'optimize_memory',
                description: 'Reduce pattern buffer size or clean up unused resources',
                impact: 'medium',
                metrics: ['memoryUsage', 'bufferUsage']
            });
        }
        // Pattern recommendations
        if (metrics.patternAccuracy < 0.9) {
            recommendations.push({
                type: 'improve_accuracy',
                description: 'Adjust pattern timing or reduce complexity',
                impact: 'medium',
                metrics: ['patternAccuracy', 'syncDeviation']
            });
        }
        // Battery recommendations
        if (metrics.batteryImpact > 0.7) {
            recommendations.push({
                type: 'reduce_battery_impact',
                description: 'Optimize update frequency or pattern intensity',
                impact: 'medium',
                metrics: ['batteryImpact', 'commandRate']
            });
        }
        return recommendations;
    }
    getCurrentSample() {
        return this.samples[this.samples.length - 1];
    }
    isSignificantEvent(type, data) {
        return (type === 'error' ||
            type === 'stall' ||
            type === 'recovery' ||
            (type === 'metric' && data.value > data.threshold));
    }
    calculateAverage(values) {
        if (values.length === 0)
            return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    calculateSum(values) {
        return values.reduce((sum, val) => sum + val, 0);
    }
    calculateStdDev(values) {
        const avg = this.calculateAverage(values);
        const squareDiffs = values.map(value => {
            const diff = value - avg;
            return diff * diff;
        });
        const avgSquareDiff = this.calculateAverage(squareDiffs);
        return Math.sqrt(avgSquareDiff);
    }
    calculatePercentile(values, percentile) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }
}
exports.PerformanceProfiler = PerformanceProfiler;
//# sourceMappingURL=PerformanceProfiler.js.map