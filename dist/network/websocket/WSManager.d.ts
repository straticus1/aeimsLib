import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
interface WSOptions {
    url: string;
    protocols?: string | string[];
    pingInterval?: number;
    pingTimeout?: number;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    maxConcurrentConnections?: number;
    bufferSize?: number;
    compressionThreshold?: number;
    keepAliveInterval?: number;
    batchSize?: number;
    batchTimeout?: number;
    enableRecovery?: boolean;
    recoveryWindow?: number;
    recoveryBatchSize?: number;
}
interface WSStats {
    sent: number;
    received: number;
    errors: number;
    reconnects: number;
    avgLatency: number;
    messageRate: number;
    byteRate: number;
    compressionRatio: number;
    connectionUptime: number;
}
/**
 * WebSocket Connection Manager
 * Optimized WebSocket handling with connection pooling, batching, and recovery
 */
export declare class WSManager extends EventEmitter {
    private wsOptions;
    private telemetry;
    private ws?;
    private options;
    private connected;
    private connecting;
    private reconnectAttempts;
    private reconnectTimer?;
    private pingTimer?;
    private pingTimeout?;
    private messageQueue;
    private activeBatch?;
    private batchTimer?;
    private recoveryQueue;
    private stats;
    private connectionStart?;
    private lastMessageTime?;
    constructor(wsOptions: WSOptions, telemetry: TelemetryManager);
    /**
     * Connect to WebSocket server
     */
    connect(): Promise<void>;
    /**
     * Disconnect from server
     */
    disconnect(): Promise<void>;
    /**
     * Send message to server
     */
    send(data: any): Promise<any>;
    /**
     * Get connection statistics
     */
    getStats(): WSStats;
    private initializeOptions;
    private setupWebSocket;
    private startPing;
    private handlePong;
    private handlePingTimeout;
    private handleMessage;
    private handleBatchResponse;
    private handleResponse;
    private handleMessageError;
    private handleError;
    private handleDisconnect;
    private clearTimers;
    private shouldReconnect;
    private scheduleReconnect;
    private rejectPendingMessages;
    private shouldProcessBatch;
    private scheduleBatch;
    private processBatch;
    private processPendingMessages;
    private sendData;
    private generateMessageId;
    private shouldCompress;
    private compress;
    private decompress;
    private isResponse;
    private isBatchResponse;
}
export {};
