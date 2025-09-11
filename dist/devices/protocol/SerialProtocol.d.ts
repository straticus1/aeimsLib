import { BaseProtocol } from './BaseProtocol';
interface SerialOptions {
    path: string;
    baudRate?: number;
    dataBits?: 5 | 6 | 7 | 8;
    stopBits?: 1 | 2;
    parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
    rtscts?: boolean;
    xon?: boolean;
    xoff?: boolean;
    delimiter?: string | Buffer;
    interByteTimeout?: number;
    commandTimeout?: number;
    responseTimeout?: number;
    flowControl?: {
        enabled: boolean;
        xon?: number;
        xoff?: number;
        throttleWatermark?: number;
    };
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
}
interface SerialStats {
    bytesRead: number;
    bytesWritten: number;
    writeSpeed: number;
    readSpeed: number;
    errors: number;
    lastError?: Error;
    uptime: number;
    reconnects: number;
}
/**
 * Serial Protocol Implementation
 */
export declare class SerialProtocol extends BaseProtocol {
    private options;
    private port?;
    private parser?;
    private writeQueue;
    private writing;
    private lastWrite;
    private reconnectAttempts;
    private reconnectTimer?;
    private responseTimer?;
    private stats;
    constructor(options: SerialOptions);
    /**
     * Connect to serial port
     */
    protected doConnect(): Promise<void>;
    /**
     * Disconnect from serial port
     */
    protected doDisconnect(): Promise<void>;
    /**
     * Send command via serial port
     */
    protected doSendCommand(command: any): Promise<any>;
    /**
     * Send batch of commands via serial port
     */
    protected doSendBatch(commands: any[]): Promise<any[]>;
    /**
     * Process write queue
     */
    private processWriteQueue;
    /**
     * Write data to port
     */
    private write;
    /**
     * Wait for port to open
     */
    private waitForOpen;
    /**
     * Setup port event handlers
     */
    private setupEventHandlers;
    /**
     * Configure flow control
     */
    private configureFlowControl;
    /**
     * Handle flow control delays
     */
    private handleFlowControl;
    /**
     * Clear timers
     */
    private clearTimers;
    /**
     * Handle disconnection
     */
    private handleDisconnect;
    /**
     * Handle errors
     */
    protected handleError(error: Error): void;
    /**
     * Get connection statistics
     */
    getStats(): SerialStats;
}
export {};
