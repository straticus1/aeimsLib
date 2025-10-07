import { EventEmitter } from 'events';
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
export declare class WebSocketCluster extends EventEmitter {
    private static instance;
    private config;
    private logger;
    private metrics;
    private redis;
    private workers;
    private roundRobinIndex;
    private constructor();
    static getInstance(config: ClusterConfig): WebSocketCluster;
    initialize(): Promise<void>;
    private setupMaster;
    private setupWorker;
    private forkWorker;
    private startHealthMonitoring;
    private checkWorkerHealth;
    private rebalanceLoad;
    private publishClusterMetrics;
    private setupClusterCoordination;
    private handleWorkerMessage;
    private handleMasterMessage;
    private updateWorkerInfo;
    private updateWorkerConnections;
    private handleBroadcastRequest;
    private handleClusterBroadcast;
    private handleClusterWorkerMessage;
    private handleClusterLoadBalance;
    private broadcastToWorkers;
    private sendHeartbeat;
    private getConnectionCount;
    getWorkerForConnection(connectionInfo: any): number;
    private getRoundRobinWorker;
    private getLeastConnectionsWorker;
    private getIPHashWorker;
    private hashString;
    gracefulShutdown(): Promise<void>;
    getClusterStats(): any;
}
