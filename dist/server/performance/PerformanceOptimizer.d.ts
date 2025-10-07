import { EventEmitter } from 'events';
import { AuthenticatedWebSocket } from '../EnhancedWebSocketServer';
export interface PerformanceConfig {
    messageProcessing: {
        batchSize: number;
        batchTimeout: number;
        priorityQueues: boolean;
        parallelProcessing: boolean;
    };
    connectionManagement: {
        poolSize: number;
        keepAlive: boolean;
        autoReconnect: boolean;
        connectionTimeout: number;
    };
    resourceOptimization: {
        memoryThreshold: number;
        cpuThreshold: number;
        autoScaling: boolean;
        garbageCollection: boolean;
    };
    caching: {
        enabled: boolean;
        ttl: number;
        maxSize: number;
        strategy: 'lru' | 'lfu' | 'fifo';
    };
}
export interface MessageBatch {
    messages: any[];
    priority: 'low' | 'normal' | 'high' | 'critical';
    createdAt: number;
    connectionId: string;
}
export interface PerformanceMetrics {
    throughput: {
        messagesPerSecond: number;
        connectionsPerSecond: number;
        bytesPerSecond: number;
    };
    latency: {
        average: number;
        p95: number;
        p99: number;
        max: number;
    };
    resources: {
        memoryUsage: number;
        cpuUsage: number;
        gcFrequency: number;
        connectionPoolUtilization: number;
    };
    optimization: {
        batchingEfficiency: number;
        cacheHitRate: number;
        compressionRatio: number;
        parallelismUtilization: number;
    };
}
export declare class PerformanceOptimizer extends EventEmitter {
    private static instance;
    private config;
    private logger;
    private metrics;
    private messageBatches;
    private batchProcessingTimer?;
    private parallelProcessors;
    private connectionPool;
    private connectionStats;
    private performanceMetrics;
    private resourceMonitorTimer?;
    private lastGCStats;
    private messageCache;
    private cacheStats;
    private constructor();
    static getInstance(config: PerformanceConfig): PerformanceOptimizer;
    private initialize;
    private initializeMetrics;
    optimizeMessageProcessing(connectionId: string, messages: any[]): void;
    private startBatchProcessing;
    private processBatch;
    private processMessages;
    private processMessagesSequential;
    private processMessagesParallel;
    private processMessage;
    private executeMessageProcessing;
    optimizeConnectionPool(connections: Map<string, AuthenticatedWebSocket>): void;
    private updateConnectionStats;
    private cleanupIdleConnections;
    private balanceConnectionLoad;
    private reduceConnectionLoad;
    private startResourceMonitoring;
    private updateResourceMetrics;
    private checkResourceThresholds;
    private optimizeResources;
    private optimizeCache;
    private triggerMemoryOptimization;
    private triggerCpuOptimization;
    private cacheMessage;
    private generateCacheKey;
    private clearExpiredCache;
    private evictLRU;
    private evictLFU;
    private evictFIFO;
    private calculateBatchPriority;
    private comparePriority;
    private updateLatencyMetrics;
    private updateBatchingMetrics;
    private initializeParallelProcessors;
    private processMessageChunk;
    private initializeGCMonitoring;
    private suggestGarbageCollection;
    getPerformanceMetrics(): PerformanceMetrics;
    resetMetrics(): void;
    shutdown(): Promise<void>;
}
