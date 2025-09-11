import { EventEmitter } from 'events';
import { SecurityService } from '../interfaces/security';
export interface WebSocketConfig {
    url: string;
    protocols?: string | string[];
    headers?: {
        [key: string]: string;
    };
    reconnect: {
        enabled: boolean;
        initialDelay: number;
        maxDelay: number;
        maxAttempts: number;
    };
    heartbeat: {
        enabled: boolean;
        interval: number;
        timeout: number;
    };
    security?: {
        service: SecurityService;
        tokenProvider: () => Promise<string>;
    };
}
export interface ConnectionState {
    connected: boolean;
    connecting: boolean;
    reconnecting: boolean;
    lastConnected: Date | null;
    lastError: Error | null;
    reconnectAttempts: number;
    heartbeatMissed: number;
}
export declare enum WebSocketEvent {
    CONNECTING = "connecting",
    CONNECTED = "connected",
    DISCONNECTED = "disconnected",
    RECONNECTING = "reconnecting",
    MESSAGE = "message",
    ERROR = "error",
    HEARTBEAT = "heartbeat",
    STATE_CHANGE = "stateChange"
}
export declare class RobustWebSocketClient extends EventEmitter {
    private ws;
    private config;
    private state;
    private reconnectTimeout;
    private heartbeatInterval;
    private heartbeatTimeout;
    private logger;
    constructor(config: WebSocketConfig);
    connect(): Promise<void>;
    private setupEventHandlers;
    private handleConnect;
    private handleDisconnect;
    private handleMessage;
    private handleError;
    private handleHeartbeat;
    private handleHeartbeatTimeout;
    private startHeartbeat;
    private stopHeartbeat;
    private scheduleReconnect;
    private reconnect;
    send(data: any): void;
    close(): void;
    isConnected(): boolean;
    getState(): ConnectionState;
    private updateState;
    private parseMessage;
}
