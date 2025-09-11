"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionPool = void 0;
const events_1 = require("events");
const WSManager_1 = require("./WSManager");
/**
 * WebSocket Connection Pool
 * Manages multiple WebSocket connections for improved performance and reliability
 */
class ConnectionPool extends events_1.EventEmitter {
    constructor(wsOptions, telemetry, poolOptions = {}) {
        super();
        this.wsOptions = wsOptions;
        this.telemetry = telemetry;
        this.connections = new Map();
        this.pendingConnections = new Set();
        this.options = this.initializeOptions(poolOptions);
        this.startTimers();
    }
    /**
     * Initialize the connection pool
     */
    async initialize() {
        // Create minimum connections
        const initializations = Array(this.options.minConnections)
            .fill(0)
            .map(() => this.createConnection());
        await Promise.all(initializations);
    }
    /**
     * Get a connection from the pool
     */
    async getConnection() {
        // Try to get an idle connection
        const idle = this.getIdleConnection();
        if (idle) {
            idle.lastUsed = Date.now();
            return idle.manager;
        }
        // Create new connection if possible
        if (this.canCreateConnection()) {
            const connection = await this.createConnection();
            connection.lastUsed = Date.now();
            return connection.manager;
        }
        // Wait for an available connection
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 30000);
            const checkInterval = setInterval(() => {
                const connection = this.getIdleConnection();
                if (connection) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    connection.lastUsed = Date.now();
                    resolve(connection.manager);
                }
            }, 100);
        });
    }
    /**
     * Release a connection back to the pool
     */
    releaseConnection(manager) {
        const connection = Array.from(this.connections.values())
            .find(c => c.manager === manager);
        if (connection) {
            connection.lastUsed = Date.now();
        }
    }
    /**
     * Get pool statistics
     */
    getStats() {
        const connections = Array.from(this.connections.values());
        const now = Date.now();
        const stats = {
            activeConnections: connections.length,
            idleConnections: connections.filter(c => now - c.lastUsed > 1000).length,
            pendingConnections: this.pendingConnections.size,
            totalMessages: connections.reduce((sum, c) => sum + c.messageCount, 0),
            avgLatency: 0,
            errorRate: 0
        };
        // Calculate average latency
        const latencySum = connections.reduce((sum, c) => {
            return sum + c.manager.getStats().avgLatency;
        }, 0);
        stats.avgLatency = latencySum / connections.length || 0;
        // Calculate error rate
        const errorSum = connections.reduce((sum, c) => {
            return sum + c.manager.getStats().errors;
        }, 0);
        stats.errorRate = errorSum / Math.max(stats.totalMessages, 1);
        return stats;
    }
    /**
     * Shutdown the connection pool
     */
    async shutdown() {
        this.stopTimers();
        const shutdowns = Array.from(this.connections.values())
            .map(c => c.manager.disconnect());
        await Promise.all(shutdowns);
        this.connections.clear();
        this.pendingConnections.clear();
    }
    initializeOptions(options) {
        return {
            minConnections: options.minConnections || 2,
            maxConnections: options.maxConnections || 10,
            idleTimeout: options.idleTimeout || 300000, // 5 minutes
            healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
            retryDelay: options.retryDelay || 5000
        };
    }
    startTimers() {
        // Health check timer
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.options.healthCheckInterval);
        // Cleanup timer
        this.cleanupTimer = setInterval(() => {
            this.cleanupIdleConnections();
        }, 60000); // Check every minute
    }
    stopTimers() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
    }
    async createConnection() {
        const id = `conn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this.pendingConnections.add(id);
        try {
            const manager = new WSManager_1.WSManager(this.wsOptions, this.telemetry);
            await manager.connect();
            const connection = {
                id,
                manager,
                lastUsed: Date.now(),
                messageCount: 0,
                isHealthy: true
            };
            this.connections.set(id, connection);
            this.pendingConnections.delete(id);
            // Track metrics
            await this.telemetry.track({
                type: 'connection_pool_new_connection',
                timestamp: Date.now(),
                data: {
                    poolSize: this.connections.size,
                    connectionId: id
                }
            });
            return connection;
        }
        catch (error) {
            this.pendingConnections.delete(id);
            throw error;
        }
    }
    getIdleConnection() {
        const now = Date.now();
        return Array.from(this.connections.values())
            .find(c => c.isHealthy && now - c.lastUsed > 1000);
    }
    canCreateConnection() {
        return (this.connections.size + this.pendingConnections.size <
            this.options.maxConnections);
    }
    async performHealthCheck() {
        const checks = Array.from(this.connections.values()).map(async (connection) => {
            try {
                const stats = connection.manager.getStats();
                connection.isHealthy = stats.errors / Math.max(stats.sent, 1) < 0.1;
                if (!connection.isHealthy) {
                    // Replace unhealthy connection
                    await this.replaceConnection(connection);
                }
            }
            catch (error) {
                connection.isHealthy = false;
                await this.replaceConnection(connection);
            }
        });
        await Promise.all(checks);
    }
    async replaceConnection(connection) {
        try {
            // Create replacement first
            const replacement = await this.createConnection();
            // Remove old connection
            await connection.manager.disconnect();
            this.connections.delete(connection.id);
            // Track replacement
            await this.telemetry.track({
                type: 'connection_pool_replace_connection',
                timestamp: Date.now(),
                data: {
                    oldId: connection.id,
                    newId: replacement.id,
                    reason: 'health_check_failed'
                }
            });
        }
        catch (error) {
            // Log error but don't throw
            console.error('Failed to replace connection:', error);
        }
    }
    async cleanupIdleConnections() {
        const now = Date.now();
        const minConnections = this.options.minConnections;
        // Get idle connections
        const idle = Array.from(this.connections.values())
            .filter(c => now - c.lastUsed >= this.options.idleTimeout)
            .sort((a, b) => a.lastUsed - b.lastUsed);
        // Keep minimum connections
        const toRemove = idle.slice(0, Math.max(0, this.connections.size - minConnections));
        // Remove excess idle connections
        const removals = toRemove.map(async (connection) => {
            await connection.manager.disconnect();
            this.connections.delete(connection.id);
            // Track removal
            await this.telemetry.track({
                type: 'connection_pool_remove_idle',
                timestamp: now,
                data: {
                    connectionId: connection.id,
                    idleTime: now - connection.lastUsed
                }
            });
        });
        await Promise.all(removals);
    }
}
exports.ConnectionPool = ConnectionPool;
//# sourceMappingURL=ConnectionPool.js.map