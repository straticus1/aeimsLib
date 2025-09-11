import { EventEmitter } from 'events';
import { WSManager } from './WSManager';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
interface PoolOptions {
    minConnections: number;
    maxConnections: number;
    idleTimeout: number;
    healthCheckInterval: number;
    retryDelay: number;
}
interface ConnectionStats {
    activeConnections: number;
    idleConnections: number;
    pendingConnections: number;
    totalMessages: number;
    avgLatency: number;
    errorRate: number;
}
/**
 * WebSocket Connection Pool
 * Manages multiple WebSocket connections for improved performance and reliability
 */
export declare class ConnectionPool extends EventEmitter {
    private wsOptions;
    private telemetry;
    private connections;
    private pendingConnections;
    private options;
    private healthCheckTimer?;
    private cleanupTimer?;
    constructor(wsOptions: any, telemetry: TelemetryManager, poolOptions?: Partial<PoolOptions>);
    /**
     * Initialize the connection pool
     */
    initialize(): Promise<void>;
    /**
     * Get a connection from the pool
     */
    getConnection(): Promise<WSManager>;
    /**
     * Release a connection back to the pool
     */
    releaseConnection(manager: WSManager): void;
    /**
     * Get pool statistics
     */
    getStats(): ConnectionStats;
    /**
     * Shutdown the connection pool
     */
    shutdown(): Promise<void>;
    private initializeOptions;
    private startTimers;
    private stopTimers;
    private createConnection;
    private getIdleConnection;
    private canCreateConnection;
    private performHealthCheck;
    private replaceConnection;
    private cleanupIdleConnections;
}
export {};
