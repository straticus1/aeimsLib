import { EventEmitter } from 'events';
import { ProtocolHandler, ProtocolCapabilities } from './ProtocolRegistry';
/**
 * Protocol Error Types
 */
export declare enum ProtocolErrorType {
    CONNECTION_FAILED = "CONNECTION_FAILED",
    DISCONNECTION_FAILED = "DISCONNECTION_FAILED",
    COMMAND_FAILED = "COMMAND_FAILED",
    ENCODING_FAILED = "ENCODING_FAILED",
    DECODING_FAILED = "DECODING_FAILED",
    VALIDATION_FAILED = "VALIDATION_FAILED",
    TIMEOUT = "TIMEOUT",
    INVALID_STATE = "INVALID_STATE"
}
/**
 * Protocol Error
 */
export declare class ProtocolError extends Error {
    type: ProtocolErrorType;
    details?: any | undefined;
    constructor(type: ProtocolErrorType, message: string, details?: any | undefined);
}
/**
 * Protocol Options
 */
export interface ProtocolOptions {
    reconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    connectionTimeout?: number;
    commandTimeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    batchSize?: number;
    batchTimeout?: number;
    maxPacketSize?: number;
    compressionThreshold?: number;
    encryptionEnabled?: boolean;
}
/**
 * Command Status
 */
export declare enum CommandStatus {
    PENDING = "PENDING",
    SENT = "SENT",
    SUCCEEDED = "SUCCEEDED",
    FAILED = "FAILED",
    RETRYING = "RETRYING",
    CANCELLED = "CANCELLED"
}
/**
 * Command Context
 */
export interface CommandContext {
    id: string;
    command: any;
    status: CommandStatus;
    attempts: number;
    startTime: number;
    endTime?: number;
    error?: Error;
    retryAt?: number;
}
/**
 * Base Protocol Implementation
 */
export declare abstract class BaseProtocol extends EventEmitter implements ProtocolHandler {
    protected options: ProtocolOptions;
    capabilities: ProtocolCapabilities;
    protected connected: boolean;
    protected connecting: boolean;
    protected connectionAttempts: number;
    protected reconnectTimer?: NodeJS.Timeout;
    protected commandQueue: CommandContext[];
    protected activeBatch: CommandContext[];
    protected batchTimer?: NodeJS.Timeout;
    constructor(options: ProtocolOptions | undefined, capabilities: ProtocolCapabilities);
    /**
     * Connect to device
     */
    connect(connectionOptions: any): Promise<void>;
    /**
     * Disconnect from device
     */
    disconnect(): Promise<void>;
    /**
     * Check connection status
     */
    isConnected(): boolean;
    /**
     * Send command to device
     */
    sendCommand(command: any): Promise<any>;
    /**
     * Send batch of commands
     */
    sendBatch(commands: any[]): Promise<any[]>;
    /**
     * Encode data for transmission
     */
    encode(data: any): Promise<Buffer>;
    /**
     * Decode received data
     */
    decode(data: Buffer): Promise<any>;
    protected abstract doConnect(options: any): Promise<void>;
    protected abstract doDisconnect(): Promise<void>;
    protected abstract doSendCommand(command: any): Promise<any>;
    protected abstract doSendBatch?(commands: any[]): Promise<any[]>;
    protected compress(data: Buffer): Promise<Buffer>;
    protected decompress(data: Buffer): Promise<Buffer>;
    protected encrypt(data: Buffer): Promise<Buffer>;
    protected decrypt(data: Buffer): Promise<Buffer>;
    private validateOptions;
    private initializeDefaults;
    private validateCommand;
    private generateCommandId;
    private shouldReconnect;
    private scheduleReconnect;
    private clearReconnectTimer;
    private shouldProcessBatch;
    private scheduleBatch;
    private clearBatchTimer;
    private processBatch;
    private cancelPendingCommands;
    private waitForCommand;
    private shouldCompress;
    private isCompressed;
    private isJson;
}
