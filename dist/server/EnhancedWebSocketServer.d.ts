import { Server as HttpServer } from 'http';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { DeviceManager } from '../device/DeviceManager';
import { SecurityService } from '../interfaces/security';
export interface EnhancedWebSocketServerConfig {
    port: number;
    host: string;
    path: string;
    pingInterval: number;
    pingTimeout: number;
    authSecret: string;
    maxConnections?: number;
    clustering?: {
        enabled: boolean;
        workers?: number;
        redisUrl?: string;
    };
    performance?: {
        messageQueueSize: number;
        batchProcessing: boolean;
        compressionEnabled: boolean;
        heartbeatOptimized: boolean;
    };
    security?: {
        rateLimiting: {
            windowMs: number;
            maxRequests: number;
            skipSuccessfulRequests: boolean;
        };
        ddosProtection: {
            enabled: boolean;
            maxConnections: number;
            connectionWindow: number;
        };
        encryption: {
            enabled: boolean;
            algorithm: string;
        };
    };
    monitoring?: {
        metricsEnabled: boolean;
        healthCheckEndpoint: string;
        alerting: {
            enabled: boolean;
            thresholds: {
                connectionCount: number;
                errorRate: number;
                latency: number;
            };
        };
    };
}
export interface EnhancedRateLimitConfig {
    windowMs: number;
    max: number;
    message: string;
    skipSuccessfulRequests?: boolean;
    keyGenerator?: (ws: AuthenticatedWebSocket) => string;
    onLimitReached?: (ws: AuthenticatedWebSocket) => void;
}
export interface WebSocketMessage {
    id: string;
    type: string;
    payload?: any;
    timestamp: number;
    priority?: 'low' | 'normal' | 'high' | 'critical';
    compression?: boolean;
}
export interface AuthenticatedWebSocket extends WebSocket {
    userId?: string;
    deviceId?: string;
    sessionId?: string;
    lastActivity?: Date;
    rateLimitCount?: number;
    rateLimitWindow?: number;
    deviceEventHandlers?: Map<string, (event: any) => void>;
    connectionId?: string;
    region?: string;
    subscriptions?: Set<string>;
    messageQueue?: WebSocketMessage[];
    performance?: {
        messagesReceived: number;
        messagesSent: number;
        averageLatency: number;
        lastLatency: number;
    };
}
export interface MessageQueue {
    messages: WebSocketMessage[];
    processing: boolean;
    lastProcessed: number;
}
export interface ConnectionPool {
    connections: Map<string, AuthenticatedWebSocket>;
    byRegion: Map<string, Set<string>>;
    byDevice: Map<string, Set<string>>;
    byUser: Map<string, Set<string>>;
}
export declare class EnhancedWebSocketServer extends EventEmitter {
    private wss;
    private server;
    private config;
    private deviceManager;
    private securityService;
    private rateLimitConfig;
    private logger;
    private metrics;
    private monitoring;
    private redis?;
    private connectionPool;
    private messageQueues;
    private pingIntervals;
    private batchProcessor?;
    private compressionCache;
    private routingTable;
    private connectionCounts;
    private blacklistedIPs;
    private performanceMetrics;
    constructor(server: HttpServer, config: EnhancedWebSocketServerConfig, deviceManager: DeviceManager, securityService: SecurityService, rateLimitConfig: EnhancedRateLimitConfig);
    private enhanceConfig;
    private initializeEnhancedServer;
    private registerEnhancedMetrics;
    private enhancedVerifyClient;
    private checkDDoSProtection;
    private handleEnhancedConnection;
    private addToConnectionPool;
    private handleEnhancedMessage;
    private checkEnhancedRateLimit;
    private queueMessage;
    private processMessage;
    private startBatchProcessor;
    private startPerformanceMonitoring;
    private checkAlertingThresholds;
    private sendEnhancedMessage;
    private compressMessage;
    private generateConnectionId;
    private getClientIP;
    private startOptimizedPingInterval;
    private handleEnhancedDisconnection;
    private removeFromConnectionPool;
    getPerformanceMetrics(): any;
    enhancedBroadcast(message: WebSocketMessage, filter?: (ws: AuthenticatedWebSocket) => boolean, options?: {
        region?: string;
        priority?: 'low' | 'normal' | 'high' | 'critical';
    }): void;
    close(): Promise<void>;
    private handlePing;
    private handleEnhancedDeviceCommand;
    private handleDeviceStatusRequest;
    private handleEnhancedDeviceSubscription;
    private handleDeviceUnsubscription;
    private handleListDevices;
    private handleGetPerformanceMetrics;
    private handleJoinRoom;
    private handleLeaveRoom;
    private handleEnhancedPong;
    private handleClientError;
    private handleServerError;
    private startPingInterval;
    private sendError;
    private generateMessageId;
    private setupRedisSubscriptions;
    private handleClusterBroadcast;
    private handleClusterMetrics;
    private handleClusterAlert;
    broadcastToRegion(region: string, message: WebSocketMessage): void;
    broadcastToDevice(deviceId: string, message: WebSocketMessage): void;
    broadcastToUser(userId: string, message: WebSocketMessage): void;
    broadcastToRoom(room: string, message: WebSocketMessage): void;
    getConnectedClients(): AuthenticatedWebSocket[];
    getClientCount(): number;
    getClientsByRegion(region: string): AuthenticatedWebSocket[];
    disconnectClient(userId: string, sessionId: string): void;
    getHealthStatus(): any;
}
