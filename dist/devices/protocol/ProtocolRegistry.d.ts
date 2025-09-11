import { EventEmitter } from 'events';
/**
 * Protocol Capabilities
 * Defines what features a protocol supports
 */
export interface ProtocolCapabilities {
    bidirectional: boolean;
    binary: boolean;
    encryption: boolean;
    compression: boolean;
    batching: boolean;
    maxPacketSize?: number;
    maxBatchSize?: number;
    features: Set<string>;
}
/**
 * Protocol Handler Interface
 */
export interface ProtocolHandler {
    capabilities: ProtocolCapabilities;
    connect(options: any): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    sendCommand(command: any): Promise<any>;
    sendBatch?(commands: any[]): Promise<any[]>;
    encode(data: any): Promise<Buffer>;
    decode(data: Buffer): Promise<any>;
}
/**
 * Protocol Registration
 */
export interface ProtocolRegistration {
    id: string;
    name: string;
    version: string;
    description: string;
    capabilities: ProtocolCapabilities;
    handler: new () => ProtocolHandler;
    matchDevice?(info: any): boolean;
}
/**
 * Protocol Registry
 * Central registry for device communication protocols
 */
export declare class ProtocolRegistry extends EventEmitter {
    private static instance;
    private protocols;
    private defaultProtocol?;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): ProtocolRegistry;
    /**
     * Register a new protocol
     */
    registerProtocol(protocol: ProtocolRegistration): void;
    /**
     * Unregister a protocol
     */
    unregisterProtocol(protocolId: string): void;
    /**
     * Get protocol by ID
     */
    getProtocol(protocolId: string): ProtocolRegistration;
    /**
     * Get all registered protocols
     */
    getProtocols(): ProtocolRegistration[];
    /**
     * Set default protocol
     */
    setDefaultProtocol(protocolId: string): void;
    /**
     * Get default protocol
     */
    getDefaultProtocol(): ProtocolRegistration | undefined;
    /**
     * Find suitable protocol for device
     */
    findProtocolForDevice(deviceInfo: any): ProtocolRegistration | undefined;
    /**
     * Create protocol handler instance
     */
    createHandler(protocolId: string): ProtocolHandler;
    private validateProtocol;
}
