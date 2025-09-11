import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
import { SecurityService } from '../../security/SecurityService';
import { DeviceManager } from '../../core/DeviceManager';
interface RemoteOptions {
    websocketUrl: string;
    heartbeatInterval: number;
    reconnectDelay: number;
    commandTimeout: number;
    maxRetries: number;
    batchSize: number;
    requireAuth: boolean;
    encryptCommands: boolean;
    verifySignatures: boolean;
}
interface RemoteCommand {
    id: string;
    type: 'connect' | 'disconnect' | 'pattern' | 'control' | 'query';
    target: {
        deviceId: string;
        sessionId?: string;
        userId?: string;
    };
    params: {
        [key: string]: any;
    };
    timestamp: number;
    signature?: string;
}
/**
 * Remote Control Interface
 * Provides remote device control and management capabilities
 */
export declare class RemoteControlInterface extends EventEmitter {
    private deviceManager;
    private security;
    private telemetry;
    private options;
    private ws;
    private connected;
    private pendingCommands;
    constructor(deviceManager: DeviceManager, security: SecurityService, telemetry: TelemetryManager, options?: Partial<RemoteOptions>);
    /**
     * Connect to remote control server
     */
    connect(): Promise<void>;
    /**
     * Disconnect from remote control server
     */
    disconnect(): Promise<void>;
    /**
     * Execute remote command
     */
    executeCommand(command: Omit<RemoteCommand, 'id' | 'timestamp'>): Promise<any>;
    /**
     * Query device status
     */
    queryDevice(deviceId: string): Promise<any>;
    /**
     * Start pattern playback
     */
    startPattern(deviceId: string, patternName: string, options?: any): Promise<void>;
    /**
     * Stop pattern playback
     */
    stopPattern(deviceId: string): Promise<void>;
    private initializeOptions;
    private setupEventHandlers;
    private startHeartbeat;
    private handleMessage;
    private handleCommandResponse;
    private handleRemoteEvent;
    private handleDisconnect;
    private broadcastDeviceEvent;
    private sendMessage;
    private encryptMessage;
    private signCommand;
    private generateCommandId;
    private cleanupPendingCommands;
    private isSignificantEvent;
}
export {};
