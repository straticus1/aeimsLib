import { BaseProtocolAdapter } from './BaseProtocolAdapter';
import { DeviceCommand, CommandResult } from '../interfaces/device';
interface WebSocketProtocolConfig {
    url: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
    pingInterval: number;
    pingTimeout: number;
}
export declare class WebSocketProtocol extends BaseProtocolAdapter {
    private ws;
    private config;
    private reconnectAttempts;
    private pingTimer?;
    private pingTimeout?;
    constructor(config: WebSocketProtocolConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: DeviceCommand): Promise<CommandResult>;
    private startPingTimer;
    private stopPingTimer;
    private handleDisconnect;
    private handleMessage;
}
export {};
