import { EventEmitter } from 'events';
import { DiscoveryProvider } from '../DeviceDiscovery';
/**
 * USB Discovery Provider Options
 */
interface USBDiscoveryOptions {
    allowedPorts?: string[];
    ignorePorts?: string[];
    matchPatterns?: string[];
    pollInterval?: number;
    autoConnect?: boolean;
    connectionTimeout?: number;
    probeCommands?: Array<{
        data: Buffer | string;
        responsePattern?: RegExp;
        timeout?: number;
    }>;
    supportedDrivers?: string[];
    driverMatchers?: Array<{
        pattern: RegExp;
        driver: string;
    }>;
}
/**
 * USB Discovery Provider Implementation
 */
export declare class USBDiscoveryProvider extends EventEmitter implements DiscoveryProvider {
    readonly id: string;
    readonly name: string;
    private options;
    private scanning;
    private pollTimer?;
    private discoveredPorts;
    private activeConnections;
    private probeResults;
    constructor(options?: USBDiscoveryOptions);
    /**
     * Check if provider is active
     */
    isActive(): boolean;
    /**
     * Start device discovery
     */
    start(): Promise<void>;
    /**
     * Stop device discovery
     */
    stop(): Promise<void>;
    /**
     * Scan for devices
     */
    scan(duration?: number): Promise<void>;
    private initializeOptions;
    /**
     * Scan available USB ports
     */
    private scanPorts;
    /**
     * Process discovered port
     */
    private processPort;
    /**
     * Handle removed port
     */
    private handleRemovedPort;
    /**
     * Check if port should be ignored
     */
    private shouldIgnorePort;
    /**
     * Check if port info has changed
     */
    private hasPortChanged;
    /**
     * Probe port for device info
     */
    private probePort;
    /**
     * Open serial connection
     */
    private openConnection;
    /**
     * Close serial connection
     */
    private closeConnection;
    /**
     * Send probe command
     */
    private sendProbe;
    /**
     * Parse probe response
     */
    private parseProbeResponse;
    /**
     * Create device info from port
     */
    private createDeviceInfo;
    /**
     * Find matching driver for device
     */
    private findMatchingDriver;
    /**
     * Generate unique device ID
     */
    private generateDeviceId;
}
export {};
