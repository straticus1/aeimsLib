import { EventEmitter } from 'events';
import { DiscoveredDevice } from '../discovery/DeviceDiscovery';
import { DeviceConfiguration } from '../config/DeviceConfigManager';
import { Database } from '../../core/database/Database';
import { Logger } from '../../core/logging/Logger';
/**
 * Device Status
 */
export declare enum DeviceStatus {
    UNKNOWN = "unknown",
    OFFLINE = "offline",
    ONLINE = "online",
    ERROR = "error",
    DISABLED = "disabled",
    MAINTENANCE = "maintenance"
}
/**
 * Device Information
 */
export interface DeviceInfo {
    id: string;
    name: string;
    type: string;
    protocol: string;
    address: string;
    status: DeviceStatus;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    firmware?: string;
    capabilities: string[];
    features: Set<string>;
    metadata: Record<string, any>;
    lastSeen?: number;
    lastConnected?: number;
    lastError?: Error;
    errorCount: number;
    config?: DeviceConfiguration;
    enabled: boolean;
}
/**
 * Device Registry Options
 */
interface DeviceRegistryOptions {
    autoConnect?: boolean;
    connectRetries?: number;
    connectTimeout?: number;
    reconnectDelay?: number;
    staleTimeout?: number;
    cleanupInterval?: number;
    maxErrorCount?: number;
    persistentStorage?: boolean;
    storagePrefix?: string;
}
/**
 * Device Registry
 * Manages device lifecycle, state and connectivity
 */
export declare class DeviceRegistry extends EventEmitter {
    private database;
    private logger;
    private static instance;
    private options;
    private devices;
    private protocolHandlers;
    private cleanupTimer?;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(database: Database, logger: Logger, options?: DeviceRegistryOptions): DeviceRegistry;
    /**
     * Initialize registry
     */
    initialize(): Promise<void>;
    /**
     * Add or update device
     */
    addDevice(device: DiscoveredDevice, config?: DeviceConfiguration): Promise<DeviceInfo>;
    /**
     * Remove device
     */
    removeDevice(deviceId: string): Promise<void>;
    /**
     * Get device by ID
     */
    getDevice(deviceId: string): DeviceInfo | undefined;
    /**
     * List all devices
     */
    listDevices(filter?: {
        type?: string;
        protocol?: string;
        status?: DeviceStatus;
        capability?: string;
    }): DeviceInfo[];
    /**
     * Update device configuration
     */
    updateDeviceConfig(deviceId: string, config: DeviceConfiguration): Promise<void>;
    /**
     * Enable/disable device
     */
    setDeviceEnabled(deviceId: string, enabled: boolean): Promise<void>;
    /**
     * Connect to device
     */
    connectDevice(deviceId: string): Promise<void>;
    /**
     * Disconnect from device
     */
    disconnectDevice(deviceId: string): Promise<void>;
    /**
     * Send command to device
     */
    sendCommand(deviceId: string, command: any): Promise<any>;
    /**
     * Initialize options
     */
    private initializeOptions;
    /**
     * Setup cleanup timer
     */
    private setupCleanupTimer;
    /**
     * Cleanup stale devices
     */
    private cleanup;
    /**
     * Create protocol handler
     */
    private createProtocolHandler;
    /**
     * Handle device error
     */
    private handleDeviceError;
    /**
     * Load devices from storage
     */
    private loadDevices;
    /**
     * Persist device to storage
     */
    private persistDevice;
    /**
     * Cleanup resources
     */
    destroy(): Promise<void>;
}
export {};
