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

interface PooledConnection {
  id: string;
  manager: WSManager;
  lastUsed: number;
  messageCount: number;
  isHealthy: boolean;
}

/**
 * WebSocket Connection Pool
 * Manages multiple WebSocket connections for improved performance and reliability
 */
export class ConnectionPool extends EventEmitter {
  private connections: Map<string, PooledConnection> = new Map();
  private pendingConnections: Set<string> = new Set();
  private options: Required<PoolOptions>;
  private healthCheckTimer?: NodeJS.Timer;
  private cleanupTimer?: NodeJS.Timer;

  constructor(
    private wsOptions: any,
    private telemetry: TelemetryManager,
    poolOptions: Partial<PoolOptions> = {}
  ) {
    super();
    this.options = this.initializeOptions(poolOptions);
    this.startTimers();
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    // Create minimum connections
    const initializations = Array(this.options.minConnections)
      .fill(0)
      .map(() => this.createConnection());

    await Promise.all(initializations);
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<WSManager> {
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
  releaseConnection(manager: WSManager): void {
    const connection = Array.from(this.connections.values())
      .find(c => c.manager === manager);

    if (connection) {
      connection.lastUsed = Date.now();
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): ConnectionStats {
    const connections = Array.from(this.connections.values());
    const now = Date.now();

    const stats: ConnectionStats = {
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
  async shutdown(): Promise<void> {
    this.stopTimers();

    const shutdowns = Array.from(this.connections.values())
      .map(c => c.manager.disconnect());

    await Promise.all(shutdowns);
    
    this.connections.clear();
    this.pendingConnections.clear();
  }

  private initializeOptions(options: Partial<PoolOptions>): Required<PoolOptions> {
    return {
      minConnections: options.minConnections || 2,
      maxConnections: options.maxConnections || 10,
      idleTimeout: options.idleTimeout || 300000, // 5 minutes
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      retryDelay: options.retryDelay || 5000
    };
  }

  private startTimers(): void {
    // Health check timer
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);

    // Cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000); // Check every minute
  }

  private stopTimers(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  private async createConnection(): Promise<PooledConnection> {
    const id = `conn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.pendingConnections.add(id);

    try {
      const manager = new WSManager(this.wsOptions, this.telemetry);
      await manager.connect();

      const connection: PooledConnection = {
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

    } catch (error) {
      this.pendingConnections.delete(id);
      throw error;
    }
  }

  private getIdleConnection(): PooledConnection | undefined {
    const now = Date.now();
    return Array.from(this.connections.values())
      .find(c => c.isHealthy && now - c.lastUsed > 1000);
  }

  private canCreateConnection(): boolean {
    return (
      this.connections.size + this.pendingConnections.size <
      this.options.maxConnections
    );
  }

  private async performHealthCheck(): Promise<void> {
    const checks = Array.from(this.connections.values()).map(async connection => {
      try {
        const stats = connection.manager.getStats();
        connection.isHealthy = stats.errors / Math.max(stats.sent, 1) < 0.1;
        
        if (!connection.isHealthy) {
          // Replace unhealthy connection
          await this.replaceConnection(connection);
        }

      } catch (error) {
        connection.isHealthy = false;
        await this.replaceConnection(connection);
      }
    });

    await Promise.all(checks);
  }

  private async replaceConnection(connection: PooledConnection): Promise<void> {
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

    } catch (error) {
      // Log error but don't throw
      console.error('Failed to replace connection:', error);
    }
  }

  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const minConnections = this.options.minConnections;
    
    // Get idle connections
    const idle = Array.from(this.connections.values())
      .filter(c => now - c.lastUsed >= this.options.idleTimeout)
      .sort((a, b) => a.lastUsed - b.lastUsed);

    // Keep minimum connections
    const toRemove = idle.slice(0, Math.max(0, this.connections.size - minConnections));
    
    // Remove excess idle connections
    const removals = toRemove.map(async connection => {
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
