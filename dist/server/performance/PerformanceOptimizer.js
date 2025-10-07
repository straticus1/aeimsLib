"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceOptimizer = void 0;
const events_1 = require("events");
const Logger_1 = require("../../utils/Logger");
const MetricsCollector_1 = require("../../monitoring/MetricsCollector");
class PerformanceOptimizer extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.logger = Logger_1.Logger.getInstance();
        this.metrics = MetricsCollector_1.MetricsCollector.getInstance();
        this.messageBatches = new Map();
        this.connectionPool = new Map();
        this.connectionStats = new Map();
        this.messageCache = new Map();
        this.parallelProcessors = [];
        this.cacheStats = { hits: 0, misses: 0, evictions: 0 };
        this.performanceMetrics = this.initializeMetrics();
        this.initialize();
    }
    static getInstance(config) {
        if (!PerformanceOptimizer.instance) {
            PerformanceOptimizer.instance = new PerformanceOptimizer(config);
        }
        return PerformanceOptimizer.instance;
    }
    async initialize() {
        // Initialize message batching
        if (this.config.messageProcessing.batchSize > 1) {
            this.startBatchProcessing();
        }
        // Initialize parallel processing
        if (this.config.messageProcessing.parallelProcessing) {
            await this.initializeParallelProcessors();
        }
        // Start resource monitoring
        this.startResourceMonitoring();
        // Initialize garbage collection monitoring
        if (this.config.resourceOptimization.garbageCollection) {
            this.initializeGCMonitoring();
        }
        this.logger.info('Performance optimizer initialized', {
            batchSize: this.config.messageProcessing.batchSize,
            parallelProcessing: this.config.messageProcessing.parallelProcessing,
            caching: this.config.caching.enabled
        });
    }
    initializeMetrics() {
        return {
            throughput: {
                messagesPerSecond: 0,
                connectionsPerSecond: 0,
                bytesPerSecond: 0
            },
            latency: {
                average: 0,
                p95: 0,
                p99: 0,
                max: 0
            },
            resources: {
                memoryUsage: 0,
                cpuUsage: 0,
                gcFrequency: 0,
                connectionPoolUtilization: 0
            },
            optimization: {
                batchingEfficiency: 0,
                cacheHitRate: 0,
                compressionRatio: 0,
                parallelismUtilization: 0
            }
        };
    }
    // Message Processing Optimization
    optimizeMessageProcessing(connectionId, messages) {
        if (this.config.messageProcessing.batchSize <= 1) {
            // Process immediately
            this.processMessages(connectionId, messages);
            return;
        }
        // Add to batch
        const batch = this.messageBatches.get(connectionId) || {
            messages: [],
            priority: this.calculateBatchPriority(messages),
            createdAt: Date.now(),
            connectionId
        };
        batch.messages.push(...messages);
        this.messageBatches.set(connectionId, batch);
        // Process if batch is full
        if (batch.messages.length >= this.config.messageProcessing.batchSize) {
            this.processBatch(connectionId);
        }
    }
    startBatchProcessing() {
        this.batchProcessingTimer = setInterval(() => {
            const now = Date.now();
            for (const [connectionId, batch] of this.messageBatches) {
                const age = now - batch.createdAt;
                // Process if batch timeout reached
                if (age >= this.config.messageProcessing.batchTimeout) {
                    this.processBatch(connectionId);
                }
            }
            this.updateBatchingMetrics();
        }, 50); // Check every 50ms
    }
    processBatch(connectionId) {
        const batch = this.messageBatches.get(connectionId);
        if (!batch || batch.messages.length === 0)
            return;
        const startTime = Date.now();
        try {
            // Sort by priority if enabled
            if (this.config.messageProcessing.priorityQueues) {
                batch.messages.sort((a, b) => this.comparePriority(a.priority, b.priority));
            }
            this.processMessages(connectionId, batch.messages);
            const processingTime = Date.now() - startTime;
            this.updateLatencyMetrics(processingTime);
            this.metrics.recordMetric('performance.batch_processed', batch.messages.length);
            this.metrics.recordMetric('performance.batch_latency', processingTime);
        }
        catch (error) {
            this.logger.error('Batch processing error', { connectionId, error: error.message });
            this.metrics.recordMetric('performance.batch_errors', 1);
        }
        finally {
            this.messageBatches.delete(connectionId);
        }
    }
    async processMessages(connectionId, messages) {
        if (this.config.messageProcessing.parallelProcessing && messages.length > 10) {
            await this.processMessagesParallel(connectionId, messages);
        }
        else {
            await this.processMessagesSequential(connectionId, messages);
        }
    }
    async processMessagesSequential(connectionId, messages) {
        for (const message of messages) {
            await this.processMessage(connectionId, message);
        }
    }
    async processMessagesParallel(connectionId, messages) {
        const chunkSize = Math.ceil(messages.length / this.parallelProcessors.length);
        const chunks = [];
        for (let i = 0; i < messages.length; i += chunkSize) {
            chunks.push(messages.slice(i, i + chunkSize));
        }
        const promises = chunks.map((chunk, index) => {
            return this.processMessageChunk(connectionId, chunk, index);
        });
        await Promise.all(promises);
    }
    async processMessage(connectionId, message) {
        // Check cache first
        if (this.config.caching.enabled) {
            const cacheKey = this.generateCacheKey(message);
            const cached = this.messageCache.get(cacheKey);
            if (cached) {
                this.cacheStats.hits++;
                return cached;
            }
            else {
                this.cacheStats.misses++;
            }
        }
        // Process message
        const result = await this.executeMessageProcessing(connectionId, message);
        // Cache result
        if (this.config.caching.enabled && result) {
            this.cacheMessage(message, result);
        }
        return result;
    }
    async executeMessageProcessing(connectionId, message) {
        // Placeholder for actual message processing logic
        // This would be implemented based on specific message types
        return { processed: true, timestamp: Date.now() };
    }
    // Connection Pool Optimization
    optimizeConnectionPool(connections) {
        this.connectionPool = connections;
        // Update connection statistics
        for (const [connectionId, ws] of connections) {
            this.updateConnectionStats(connectionId, ws);
        }
        // Optimize connection pool
        this.cleanupIdleConnections();
        this.balanceConnectionLoad();
        // Update metrics
        this.performanceMetrics.resources.connectionPoolUtilization =
            connections.size / this.config.connectionManagement.poolSize;
    }
    updateConnectionStats(connectionId, ws) {
        const stats = this.connectionStats.get(connectionId) || {
            messagesReceived: 0,
            messagesSent: 0,
            bytesReceived: 0,
            bytesSent: 0,
            lastActivity: Date.now(),
            averageLatency: 0
        };
        if (ws.performance) {
            stats.messagesReceived = ws.performance.messagesReceived;
            stats.messagesSent = ws.performance.messagesSent;
            stats.averageLatency = ws.performance.averageLatency;
        }
        stats.lastActivity = ws.lastActivity?.getTime() || Date.now();
        this.connectionStats.set(connectionId, stats);
    }
    cleanupIdleConnections() {
        const now = Date.now();
        const timeout = this.config.connectionManagement.connectionTimeout;
        for (const [connectionId, stats] of this.connectionStats) {
            if (now - stats.lastActivity > timeout) {
                const ws = this.connectionPool.get(connectionId);
                if (ws && ws.readyState === 1) { // OPEN
                    this.logger.info('Closing idle connection', { connectionId, idleTime: now - stats.lastActivity });
                    ws.close(1000, 'Idle timeout');
                }
                this.connectionStats.delete(connectionId);
                this.connectionPool.delete(connectionId);
            }
        }
    }
    balanceConnectionLoad() {
        // Implement connection load balancing logic
        const connections = Array.from(this.connectionPool.values());
        const averageLoad = connections.reduce((sum, ws) => sum + (ws.performance?.messagesReceived || 0), 0) / connections.length;
        for (const ws of connections) {
            const load = ws.performance?.messagesReceived || 0;
            if (load > averageLoad * 1.5) {
                // Connection is overloaded, implement load reduction
                this.reduceConnectionLoad(ws);
            }
        }
    }
    reduceConnectionLoad(ws) {
        // Implement load reduction strategies
        // This could include:
        // - Throttling message processing
        // - Moving connection to different worker
        // - Implementing backpressure
        this.logger.info('Reducing connection load', {
            connectionId: ws.connectionId,
            messagesReceived: ws.performance?.messagesReceived
        });
    }
    // Resource Optimization
    startResourceMonitoring() {
        this.resourceMonitorTimer = setInterval(() => {
            this.updateResourceMetrics();
            this.checkResourceThresholds();
            this.optimizeResources();
        }, 5000); // Every 5 seconds
    }
    updateResourceMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        this.performanceMetrics.resources.memoryUsage = memUsage.rss / 1024 / 1024; // MB
        this.performanceMetrics.resources.cpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // seconds
        // Update cache hit rate
        const totalCacheRequests = this.cacheStats.hits + this.cacheStats.misses;
        this.performanceMetrics.optimization.cacheHitRate =
            totalCacheRequests > 0 ? this.cacheStats.hits / totalCacheRequests : 0;
        // Record metrics
        this.metrics.recordMetric('performance.memory_usage', this.performanceMetrics.resources.memoryUsage);
        this.metrics.recordMetric('performance.cpu_usage', this.performanceMetrics.resources.cpuUsage);
        this.metrics.recordMetric('performance.cache_hit_rate', this.performanceMetrics.optimization.cacheHitRate);
    }
    checkResourceThresholds() {
        const { memoryThreshold, cpuThreshold } = this.config.resourceOptimization;
        if (this.performanceMetrics.resources.memoryUsage > memoryThreshold) {
            this.emit('memoryThresholdExceeded', {
                current: this.performanceMetrics.resources.memoryUsage,
                threshold: memoryThreshold
            });
            this.triggerMemoryOptimization();
        }
        if (this.performanceMetrics.resources.cpuUsage > cpuThreshold) {
            this.emit('cpuThresholdExceeded', {
                current: this.performanceMetrics.resources.cpuUsage,
                threshold: cpuThreshold
            });
            this.triggerCpuOptimization();
        }
    }
    optimizeResources() {
        // Cache optimization
        if (this.config.caching.enabled) {
            this.optimizeCache();
        }
        // Connection pool optimization
        this.optimizeConnectionPool(this.connectionPool);
        // Garbage collection suggestion
        if (this.config.resourceOptimization.garbageCollection) {
            this.suggestGarbageCollection();
        }
    }
    optimizeCache() {
        const cacheSize = this.messageCache.size;
        if (cacheSize > this.config.caching.maxSize) {
            const entriesToRemove = cacheSize - this.config.caching.maxSize;
            switch (this.config.caching.strategy) {
                case 'lru':
                    this.evictLRU(entriesToRemove);
                    break;
                case 'lfu':
                    this.evictLFU(entriesToRemove);
                    break;
                case 'fifo':
                    this.evictFIFO(entriesToRemove);
                    break;
            }
        }
    }
    triggerMemoryOptimization() {
        this.logger.warn('Memory threshold exceeded, triggering optimization');
        // Clear old cache entries
        this.clearExpiredCache();
        // Clean up idle connections more aggressively
        this.cleanupIdleConnections();
        // Suggest garbage collection
        if (global.gc) {
            global.gc();
        }
        this.metrics.recordMetric('performance.memory_optimizations', 1);
    }
    triggerCpuOptimization() {
        this.logger.warn('CPU threshold exceeded, triggering optimization');
        // Reduce batch processing frequency temporarily
        if (this.batchProcessingTimer) {
            clearInterval(this.batchProcessingTimer);
            setTimeout(() => this.startBatchProcessing(), 1000);
        }
        this.metrics.recordMetric('performance.cpu_optimizations', 1);
    }
    // Caching Implementation
    cacheMessage(message, result) {
        if (this.messageCache.size >= this.config.caching.maxSize) {
            this.evictLRU(1);
        }
        const cacheKey = this.generateCacheKey(message);
        this.messageCache.set(cacheKey, {
            result,
            timestamp: Date.now(),
            accessCount: 1
        });
    }
    generateCacheKey(message) {
        return `${message.type}_${JSON.stringify(message.payload)}_${message.userId}`;
    }
    clearExpiredCache() {
        const now = Date.now();
        const ttl = this.config.caching.ttl;
        for (const [key, entry] of this.messageCache) {
            if (now - entry.timestamp > ttl) {
                this.messageCache.delete(key);
                this.cacheStats.evictions++;
            }
        }
    }
    evictLRU(count) {
        const entries = Array.from(this.messageCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        for (let i = 0; i < count && i < entries.length; i++) {
            this.messageCache.delete(entries[i][0]);
            this.cacheStats.evictions++;
        }
    }
    evictLFU(count) {
        const entries = Array.from(this.messageCache.entries())
            .sort((a, b) => a[1].accessCount - b[1].accessCount);
        for (let i = 0; i < count && i < entries.length; i++) {
            this.messageCache.delete(entries[i][0]);
            this.cacheStats.evictions++;
        }
    }
    evictFIFO(count) {
        const keys = Array.from(this.messageCache.keys());
        for (let i = 0; i < count && i < keys.length; i++) {
            this.messageCache.delete(keys[i]);
            this.cacheStats.evictions++;
        }
    }
    // Helper methods
    calculateBatchPriority(messages) {
        const priorities = messages.map(m => m.priority || 'normal');
        if (priorities.includes('critical'))
            return 'critical';
        if (priorities.includes('high'))
            return 'high';
        if (priorities.includes('normal'))
            return 'normal';
        return 'low';
    }
    comparePriority(a = 'normal', b = 'normal') {
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        return priorityOrder[a] - priorityOrder[b];
    }
    updateLatencyMetrics(latency) {
        // Update latency statistics
        // Implementation would include percentile calculations
        this.performanceMetrics.latency.average =
            (this.performanceMetrics.latency.average + latency) / 2;
        if (latency > this.performanceMetrics.latency.max) {
            this.performanceMetrics.latency.max = latency;
        }
    }
    updateBatchingMetrics() {
        const totalBatches = this.messageBatches.size;
        const totalMessages = Array.from(this.messageBatches.values())
            .reduce((sum, batch) => sum + batch.messages.length, 0);
        this.performanceMetrics.optimization.batchingEfficiency =
            totalMessages > 0 ? totalMessages / Math.max(totalBatches, 1) : 0;
    }
    async initializeParallelProcessors() {
        // Initialize worker threads for parallel processing
        // Implementation would create worker pool
        this.logger.info('Parallel processing initialized');
    }
    async processMessageChunk(connectionId, chunk, processorIndex) {
        // Process message chunk in parallel
        for (const message of chunk) {
            await this.processMessage(connectionId, message);
        }
    }
    initializeGCMonitoring() {
        // Monitor garbage collection events
        if (process.env.NODE_ENV === 'production') {
            // Implement GC monitoring
            this.logger.info('GC monitoring initialized');
        }
    }
    suggestGarbageCollection() {
        const memoryPressure = this.performanceMetrics.resources.memoryUsage >
            this.config.resourceOptimization.memoryThreshold * 0.8;
        if (memoryPressure && global.gc) {
            global.gc();
            this.metrics.recordMetric('performance.gc_suggestions', 1);
        }
    }
    // Public API
    getPerformanceMetrics() {
        return { ...this.performanceMetrics };
    }
    resetMetrics() {
        this.performanceMetrics = this.initializeMetrics();
        this.cacheStats = { hits: 0, misses: 0, evictions: 0 };
    }
    async shutdown() {
        if (this.batchProcessingTimer) {
            clearInterval(this.batchProcessingTimer);
        }
        if (this.resourceMonitorTimer) {
            clearInterval(this.resourceMonitorTimer);
        }
        // Process remaining batches
        for (const connectionId of this.messageBatches.keys()) {
            this.processBatch(connectionId);
        }
        this.logger.info('Performance optimizer shutdown complete');
    }
}
exports.PerformanceOptimizer = PerformanceOptimizer;
//# sourceMappingURL=PerformanceOptimizer.js.map