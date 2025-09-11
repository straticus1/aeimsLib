import { Server as HttpServer } from 'http';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { DeviceManager } from '../device/DeviceManager';
import { SecurityService } from '../interfaces/security';
export interface WebSocketServerConfig {
    port: number;
    host: string;
    path: string;
    pingInterval: number;
    pingTimeout: number;
    authSecret: string;
    maxConnections?: number;
}
export interface RateLimitConfig {
    windowMs: number;
    max: number;
    message: string;
}
export interface WebSocketMessage {
    id: string;
    type: string;
    payload?: any;
    timestamp: number;
}
export interface AuthenticatedWebSocket extends WebSocket {
    userId?: string;
    deviceId?: string;
    sessionId?: string;
    lastActivity?: Date;
    rateLimitCount?: number;
    rateLimitWindow?: number;
    deviceEventHandlers?: Map<string, (event: any) => void>;
}
export declare class WebSocketServer extends EventEmitter {
    private wss;
    private server;
    private config;
    private deviceManager;
    private securityService;
    private rateLimitConfig;
    private logger;
    private clients;
    private pingIntervals;
    constructor(server: HttpServer, config: WebSocketServerConfig, deviceManager: DeviceManager, securityService: SecurityService, rateLimitConfig: RateLimitConfig);
    private initializeWebSocketServer;
    private verifyClient;
    private handleConnection;
    private handleMessage;
    private checkRateLimit;
    private handlePing;
    private handleDeviceCommand;
    private handleDeviceStatusRequest;
    private handleDeviceSubscription;
    private handleDeviceUnsubscription;
    private handleListDevices;
    private handleDisconnection;
    private handleClientError;
    private handleServerError;
    private handlePong;
    private startPingInterval;
    private sendMessage;
    private sendError;
    private generateMessageId;
    broadcast(message: WebSocketMessage, filter?: (ws: AuthenticatedWebSocket) => boolean): void;
    broadcastToDevice(deviceId: string, message: WebSocketMessage): void;
    broadcastToUser(userId: string, message: WebSocketMessage): void;
    getConnectedClients(): AuthenticatedWebSocket[];
    getClientCount(): number;
    disconnectClient(userId: string, sessionId: string): void;
    close(): Promise<void>;
}
