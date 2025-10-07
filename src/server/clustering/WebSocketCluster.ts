import cluster from 'cluster';
import { cpus } from 'os';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../../utils/Logger';
import { MetricsCollector } from '../../monitoring/MetricsCollector';

export interface ClusterConfig {
  workers: number;
  redisUrl: string;
  masterPort: number;
  healthCheckInterval: number;
  loadBalancing: {
    strategy: 'round-robin' | 'least-connections' | 'ip-hash';
    stickySession: boolean;
  };
}

export interface WorkerInfo {
  id: number;
  pid: number;
  connections: number;
  cpu: number;
  memory: number;
  lastHeartbeat: Date;
  status: 'online' | 'offline' | 'starting' | 'stopping';
}

export class WebSocketCluster extends EventEmitter {
  private static instance: WebSocketCluster;
  private config: ClusterConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private redis: Redis;
  private workers: Map<number, WorkerInfo>;
  private roundRobinIndex: number = 0;

  private constructor(config: ClusterConfig) {
    super();
    this.config = config;
    this.logger = Logger.getInstance();
    this.metrics = MetricsCollector.getInstance();
    this.workers = new Map();
    this.redis = new Redis(config.redisUrl);
  }

  static getInstance(config: ClusterConfig): WebSocketCluster {
    if (!WebSocketCluster.instance) {
      WebSocketCluster.instance = new WebSocketCluster(config);
    }
    return WebSocketCluster.instance;
  }

  async initialize(): Promise<void> {
    if (cluster.isMaster) {
      await this.setupMaster();
    } else {
      await this.setupWorker();
    }
  }

  private async setupMaster(): Promise<void> {
    this.logger.info('Setting up WebSocket cluster master', {
      workers: this.config.workers,
      cpus: cpus().length
    });

    // Fork workers
    for (let i = 0; i < this.config.workers; i++) {
      this.forkWorker();
    }

    // Handle worker events
    cluster.on('online', (worker) => {
      this.logger.info('Worker came online', { workerId: worker.id, pid: worker.process.pid });
      this.workers.set(worker.id, {
        id: worker.id,
        pid: worker.process.pid!,
        connections: 0,
        cpu: 0,
        memory: 0,
        lastHeartbeat: new Date(),
        status: 'online'
      });
    });

    cluster.on('exit', (worker, code, signal) => {
      this.logger.warn('Worker died', {
        workerId: worker.id,
        pid: worker.process.pid,
        code,
        signal
      });

      this.workers.delete(worker.id);

      // Restart worker if it wasn't intentionally killed
      if (!worker.exitedAfterDisconnect) {
        this.logger.info('Restarting worker');
        this.forkWorker();
      }
    });

    // Start health monitoring
    this.startHealthMonitoring();

    // Setup Redis cluster coordination
    await this.setupClusterCoordination();
  }

  private async setupWorker(): Promise<void> {
    this.logger.info('Setting up WebSocket cluster worker', {
      workerId: cluster.worker?.id,
      pid: process.pid
    });

    // Send heartbeat to master
    setInterval(() => {
      this.sendHeartbeat();
    }, 5000);

    // Handle master messages
    process.on('message', (message: any) => {
      this.handleMasterMessage(message);
    });
  }

  private forkWorker(): cluster.Worker {
    const worker = cluster.fork();

    worker.on('message', (message: any) => {
      this.handleWorkerMessage(worker, message);
    });

    return worker;
  }

  private startHealthMonitoring(): void {
    setInterval(() => {
      this.checkWorkerHealth();
      this.rebalanceLoad();
      this.publishClusterMetrics();
    }, this.config.healthCheckInterval);
  }

  private checkWorkerHealth(): void {
    const now = new Date();

    for (const [workerId, info] of this.workers) {
      const timeSinceHeartbeat = now.getTime() - info.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > this.config.healthCheckInterval * 2) {
        this.logger.warn('Worker health check failed', { workerId, timeSinceHeartbeat });

        // Mark as offline and potentially restart
        info.status = 'offline';

        const worker = cluster.workers?.[workerId];
        if (worker) {
          worker.kill('SIGTERM');
        }
      }
    }
  }

  private rebalanceLoad(): void {
    if (this.config.loadBalancing.strategy === 'least-connections') {
      // Find worker with least connections
      let minConnections = Infinity;
      let targetWorker: number | null = null;

      for (const [workerId, info] of this.workers) {
        if (info.status === 'online' && info.connections < minConnections) {
          minConnections = info.connections;
          targetWorker = workerId;
        }
      }

      if (targetWorker) {
        this.broadcastToWorkers({
          type: 'load_balance',
          targetWorker,
          strategy: 'least-connections'
        });
      }
    }
  }

  private async publishClusterMetrics(): Promise<void> {
    const clusterMetrics = {
      timestamp: new Date(),
      totalWorkers: this.workers.size,
      onlineWorkers: Array.from(this.workers.values()).filter(w => w.status === 'online').length,
      totalConnections: Array.from(this.workers.values()).reduce((sum, w) => sum + w.connections, 0),
      averageCpu: Array.from(this.workers.values()).reduce((sum, w) => sum + w.cpu, 0) / this.workers.size,
      averageMemory: Array.from(this.workers.values()).reduce((sum, w) => sum + w.memory, 0) / this.workers.size,
      workers: Array.from(this.workers.values())
    };

    await this.redis.publish('cluster:metrics', JSON.stringify(clusterMetrics));

    this.metrics.recordMetric('cluster.total_workers', this.workers.size);
    this.metrics.recordMetric('cluster.online_workers', clusterMetrics.onlineWorkers);
    this.metrics.recordMetric('cluster.total_connections', clusterMetrics.totalConnections);
  }

  private async setupClusterCoordination(): Promise<void> {
    // Subscribe to cluster coordination channels
    await this.redis.subscribe(
      'cluster:broadcast',
      'cluster:worker_message',
      'cluster:load_balance'
    );

    this.redis.on('message', (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);

        switch (channel) {
          case 'cluster:broadcast':
            this.handleClusterBroadcast(data);
            break;
          case 'cluster:worker_message':
            this.handleClusterWorkerMessage(data);
            break;
          case 'cluster:load_balance':
            this.handleClusterLoadBalance(data);
            break;
        }
      } catch (error) {
        this.logger.error('Cluster coordination error', { channel, error: error.message });
      }
    });
  }

  private handleWorkerMessage(worker: cluster.Worker, message: any): void {
    switch (message.type) {
      case 'heartbeat':
        this.updateWorkerInfo(worker.id, message.data);
        break;
      case 'connection_count':
        this.updateWorkerConnections(worker.id, message.count);
        break;
      case 'broadcast_request':
        this.handleBroadcastRequest(message);
        break;
    }
  }

  private handleMasterMessage(message: any): void {
    switch (message.type) {
      case 'broadcast':
        this.emit('broadcast', message.data);
        break;
      case 'load_balance':
        this.emit('loadBalance', message);
        break;
    }
  }

  private updateWorkerInfo(workerId: number, data: any): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastHeartbeat = new Date();
      worker.cpu = data.cpu;
      worker.memory = data.memory;
      worker.connections = data.connections;
    }
  }

  private updateWorkerConnections(workerId: number, count: number): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.connections = count;
    }
  }

  private async handleBroadcastRequest(message: any): Promise<void> {
    // Broadcast message to all workers in cluster
    await this.redis.publish('cluster:broadcast', JSON.stringify(message.data));
  }

  private handleClusterBroadcast(data: any): void {
    this.broadcastToWorkers({
      type: 'broadcast',
      data
    });
  }

  private handleClusterWorkerMessage(data: any): void {
    const worker = cluster.workers?.[data.targetWorker];
    if (worker) {
      worker.send(data.message);
    }
  }

  private handleClusterLoadBalance(data: any): void {
    this.broadcastToWorkers({
      type: 'load_balance',
      ...data
    });
  }

  private broadcastToWorkers(message: any): void {
    for (const worker of Object.values(cluster.workers || {})) {
      if (worker) {
        worker.send(message);
      }
    }
  }

  private sendHeartbeat(): void {
    if (cluster.worker) {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      process.send?.({
        type: 'heartbeat',
        data: {
          connections: this.getConnectionCount(),
          memory: memUsage.rss / 1024 / 1024, // MB
          cpu: (cpuUsage.user + cpuUsage.system) / 1000 / 1000 // seconds
        }
      });
    }
  }

  private getConnectionCount(): number {
    // This would be provided by the WebSocket server instance
    return 0; // Placeholder
  }

  public getWorkerForConnection(connectionInfo: any): number {
    switch (this.config.loadBalancing.strategy) {
      case 'round-robin':
        return this.getRoundRobinWorker();
      case 'least-connections':
        return this.getLeastConnectionsWorker();
      case 'ip-hash':
        return this.getIPHashWorker(connectionInfo.ip);
      default:
        return this.getRoundRobinWorker();
    }
  }

  private getRoundRobinWorker(): number {
    const onlineWorkers = Array.from(this.workers.values())
      .filter(w => w.status === 'online')
      .map(w => w.id);

    if (onlineWorkers.length === 0) return 1;

    const workerId = onlineWorkers[this.roundRobinIndex % onlineWorkers.length];
    this.roundRobinIndex++;

    return workerId;
  }

  private getLeastConnectionsWorker(): number {
    let minConnections = Infinity;
    let targetWorker = 1;

    for (const worker of this.workers.values()) {
      if (worker.status === 'online' && worker.connections < minConnections) {
        minConnections = worker.connections;
        targetWorker = worker.id;
      }
    }

    return targetWorker;
  }

  private getIPHashWorker(ip: string): number {
    const hash = this.hashString(ip);
    const onlineWorkers = Array.from(this.workers.values())
      .filter(w => w.status === 'online');

    if (onlineWorkers.length === 0) return 1;

    return onlineWorkers[hash % onlineWorkers.length].id;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  public async gracefulShutdown(): Promise<void> {
    this.logger.info('Starting graceful cluster shutdown');

    if (cluster.isMaster) {
      // Disconnect all workers
      for (const worker of Object.values(cluster.workers || {})) {
        if (worker) {
          worker.disconnect();
        }
      }

      // Wait for workers to exit
      await new Promise<void>((resolve) => {
        let workersExited = 0;
        const totalWorkers = Object.keys(cluster.workers || {}).length;

        if (totalWorkers === 0) {
          resolve();
          return;
        }

        cluster.on('exit', () => {
          workersExited++;
          if (workersExited === totalWorkers) {
            resolve();
          }
        });

        // Force kill workers after timeout
        setTimeout(() => {
          for (const worker of Object.values(cluster.workers || {})) {
            if (worker) {
              worker.kill('SIGKILL');
            }
          }
          resolve();
        }, 10000);
      });
    }

    await this.redis.disconnect();
    this.logger.info('Cluster shutdown complete');
  }

  public getClusterStats(): any {
    return {
      totalWorkers: this.workers.size,
      onlineWorkers: Array.from(this.workers.values()).filter(w => w.status === 'online').length,
      totalConnections: Array.from(this.workers.values()).reduce((sum, w) => sum + w.connections, 0),
      loadBalancing: this.config.loadBalancing,
      workers: Array.from(this.workers.values())
    };
  }
}