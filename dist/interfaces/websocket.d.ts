import { Device, DeviceCommand, DeviceStatus } from './device';
/**
 * WebSocket message types
 */
export declare enum MessageType {
    JOIN_SESSION = "join_session",
    LEAVE_SESSION = "leave_session",
    DEVICE_COMMAND = "device_command",
    DEVICE_STATUS = "device_status",
    SESSION_STATUS = "session_status",
    COMMAND_RESULT = "command_result",
    ERROR = "error",
    PING = "ping",
    PONG = "pong"
}
/**
 * Base WebSocket message interface
 */
export interface WebSocketMessage {
    type: MessageType;
    timestamp: number;
    sessionId?: string;
}
/**
 * Session join message
 */
export interface JoinSessionMessage extends WebSocketMessage {
    type: MessageType.JOIN_SESSION;
    sessionId: string;
    token: string;
}
/**
 * Device command message
 */
export interface DeviceCommandMessage extends WebSocketMessage {
    type: MessageType.DEVICE_COMMAND;
    command: DeviceCommand;
}
/**
 * Device status message
 */
export interface DeviceStatusMessage extends WebSocketMessage {
    type: MessageType.DEVICE_STATUS;
    deviceId: string;
    status: DeviceStatus;
}
/**
 * Session status message
 */
export interface SessionStatusMessage extends WebSocketMessage {
    type: MessageType.SESSION_STATUS;
    deviceStatus: DeviceStatus;
    paymentStatus: {
        total: number;
        rate: number;
        currency: string;
    };
}
/**
 * Command result message
 */
export interface CommandResultMessage extends WebSocketMessage {
    type: MessageType.COMMAND_RESULT;
    result: {
        success: boolean;
        error?: string;
    };
}
/**
 * Error message
 */
export interface ErrorMessage extends WebSocketMessage {
    type: MessageType.ERROR;
    error: {
        code: string;
        message: string;
    };
}
/**
 * WebSocket session interface
 */
export interface WebSocketSession {
    id: string;
    deviceId: string;
    userId: string;
    startTime: Date;
    lastActive: Date;
    device: Device;
    currentPattern?: string;
    currentIntensity?: number;
    totalCost: number;
}
/**
 * WebSocket authentication payload
 */
export interface WebSocketAuthPayload {
    userId: string;
    deviceId: string;
    sessionId: string;
    permissions: string[];
    exp: number;
}
/**
 * WebSocket server configuration
 */
export interface WebSocketServerConfig {
    port: number;
    host: string;
    path: string;
    ssl?: {
        cert: string;
        key: string;
    };
    pingInterval: number;
    pingTimeout: number;
    authSecret: string;
}
/**
 * WebSocket client configuration
 */
export interface WebSocketClientConfig {
    url: string;
    token: string;
    autoReconnect: boolean;
    reconnectInterval: number;
    maxReconnectAttempts: number;
}
/**
 * WebSocket connection statistics
 */
export interface WebSocketStats {
    totalConnections: number;
    activeConnections: number;
    messagesReceived: number;
    messagesSent: number;
    errors: number;
    lastError?: {
        timestamp: Date;
        message: string;
    };
}
/**
 * WebSocket rate limiting configuration
 */
export interface RateLimitConfig {
    windowMs: number;
    max: number;
    message: string;
}
/**
 * WebSocket event handler type
 */
export type WebSocketEventHandler = (message: WebSocketMessage, session: WebSocketSession) => Promise<void>;
