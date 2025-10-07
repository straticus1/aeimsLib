"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketCluster = void 0;
const cluster_1 = __importDefault(require("cluster"));
const os_1 = require("os");
const events_1 = require("events");
const ioredis_1 = __importDefault(require("ioredis"));
const Logger_1 = require("../../utils/Logger");
const MetricsCollector_1 = require("../../monitoring/MetricsCollector");
class WebSocketCluster extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.roundRobinIndex = 0;
        this.config = config;
        this.logger = Logger_1.Logger.getInstance();
        this.metrics = MetricsCollector_1.MetricsCollector.getInstance();
        this.workers = new Map();
        this.redis = new ioredis_1.default(config.redisUrl);
    }
    static getInstance(config) {
        if (!WebSocketCluster.instance) {
            WebSocketCluster.instance = new WebSocketCluster(config);
        }
        return WebSocketCluster.instance;
    }
    async initialize() {
        if (cluster_1.default.isMaster) {
            await this.setupMaster();
        }
        else {
            await this.setupWorker();
        }
    }
    async setupMaster() {
        this.logger.info('Setting up WebSocket cluster master', {
            workers: this.config.workers,
            cpus: (0, os_1.cpus)().length
        });
        // Fork workers
        for (let i = 0; i < this.config.workers; i++) {
            this.forkWorker();
        }
        // Handle worker events
        cluster_1.default.on('online', (worker) => {
            this.logger.info('Worker came online', { workerId: worker.id, pid: worker.process.pid });
            this.workers.set(worker.id, {
                id: worker.id,
                pid: worker.process.pid,
                connections: 0,
                cpu: 0,
                memory: 0,
                lastHeartbeat: new Date(),
                status: 'online'
            });
        });
        cluster_1.default.on('exit', (worker, code, signal) => {
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
    async setupWorker() {
        this.logger.info('Setting up WebSocket cluster worker', {
            workerId: cluster_1.default.worker?.id,
            pid: process.pid
        });
        // Send heartbeat to master
        setInterval(() => {
            this.sendHeartbeat();
        }, 5000);
        // Handle master messages
        process.on('message', (message) => {
            this.handleMasterMessage(message);
        });
    }
    forkWorker() {
        const worker = cluster_1.default.fork();
        worker.on('message', (message) => {
            this.handleWorkerMessage(worker, message);
        });
        return worker;
    }
    startHealthMonitoring() {
        setInterval(() => {
            this.checkWorkerHealth();
            this.rebalanceLoad();
            this.publishClusterMetrics();
        }, this.config.healthCheckInterval);
    }
    checkWorkerHealth() {
        const now = new Date();
        for (const [workerId, info] of this.workers) {
            const timeSinceHeartbeat = now.getTime() - info.lastHeartbeat.getTime();
            if (timeSinceHeartbeat > this.config.healthCheckInterval * 2) {
                this.logger.warn('Worker health check failed', { workerId, timeSinceHeartbeat });
                // Mark as offline and potentially restart
                info.status = 'offline';
                const worker = cluster_1.default.workers?.[workerId];
                if (worker) {
                    worker.kill('SIGTERM');
                }
            }
        }
    }
    rebalanceLoad() {
        if (this.config.loadBalancing.strategy === 'least-connections') {
            // Find worker with least connections
            let minConnections = Infinity;
            let targetWorker = null;
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
    async publishClusterMetrics() {
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
    async setupClusterCoordination() {
        // Subscribe to cluster coordination channels
        await this.redis.subscribe('cluster:broadcast', 'cluster:worker_message', 'cluster:load_balance');
        this.redis.on('message', (channel, message) => {
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
            }
            catch (error) {
                this.logger.error('Cluster coordination error', { channel, error: error.message });
            }
        });
    }
    handleWorkerMessage(worker, message) {
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
    handleMasterMessage(message) {
        switch (message.type) {
            case 'broadcast':
                this.emit('broadcast', message.data);
                break;
            case 'load_balance':
                this.emit('loadBalance', message);
                break;
        }
    }
    updateWorkerInfo(workerId, data) {
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.lastHeartbeat = new Date();
            worker.cpu = data.cpu;
            worker.memory = data.memory;
            worker.connections = data.connections;
        }
    }
    updateWorkerConnections(workerId, count) {
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.connections = count;
        }
    }
    async handleBroadcastRequest(message) {
        // Broadcast message to all workers in cluster
        await this.redis.publish('cluster:broadcast', JSON.stringify(message.data));
    }
    handleClusterBroadcast(data) {
        this.broadcastToWorkers({
            type: 'broadcast',
            data
        });
    }
    handleClusterWorkerMessage(data) {
        const worker = cluster_1.default.workers?.[data.targetWorker];
        if (worker) {
            worker.send(data.message);
        }
    }
    handleClusterLoadBalance(data) {
        this.broadcastToWorkers({
            type: 'load_balance',
            ...data
        });
    }
    broadcastToWorkers(message) {
        for (const worker of Object.values(cluster_1.default.workers || {})) {
            if (worker) {
                worker.send(message);
            }
        }
    }
    sendHeartbeat() {
        if (cluster_1.default.worker) {
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
    getConnectionCount() {
        // This would be provided by the WebSocket server instance
        return 0; // Placeholder
    }
    getWorkerForConnection(connectionInfo) {
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
    getRoundRobinWorker() {
        const onlineWorkers = Array.from(this.workers.values())
            .filter(w => w.status === 'online')
            .map(w => w.id);
        if (onlineWorkers.length === 0)
            return 1;
        const workerId = onlineWorkers[this.roundRobinIndex % onlineWorkers.length];
        this.roundRobinIndex++;
        return workerId;
    }
    getLeastConnectionsWorker() {
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
    getIPHashWorker(ip) {
        const hash = this.hashString(ip);
        const onlineWorkers = Array.from(this.workers.values())
            .filter(w => w.status === 'online');
        if (onlineWorkers.length === 0)
            return 1;
        return onlineWorkers[hash % onlineWorkers.length].id;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    async gracefulShutdown() {
        this.logger.info('Starting graceful cluster shutdown');
        if (cluster_1.default.isMaster) {
            // Disconnect all workers
            for (const worker of Object.values(cluster_1.default.workers || {})) {
                if (worker) {
                    worker.disconnect();
                }
            }
            // Wait for workers to exit
            await new Promise((resolve) => {
                let workersExited = 0;
                const totalWorkers = Object.keys(cluster_1.default.workers || {}).length;
                if (totalWorkers === 0) {
                    resolve();
                    return;
                }
                cluster_1.default.on('exit', () => {
                    workersExited++;
                    if (workersExited === totalWorkers) {
                        resolve();
                    }
                });
                // Force kill workers after timeout
                setTimeout(() => {
                    for (const worker of Object.values(cluster_1.default.workers || {})) {
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
    getClusterStats() {
        return {
            totalWorkers: this.workers.size,
            onlineWorkers: Array.from(this.workers.values()).filter(w => w.status === 'online').length,
            totalConnections: Array.from(this.workers.values()).reduce((sum, w) => sum + w.connections, 0),
            loadBalancing: this.config.loadBalancing,
            workers: Array.from(this.workers.values())
        };
    }
}
exports.WebSocketCluster = WebSocketCluster;
//# sourceMappingURL=WebSocketCluster.js.map