import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
interface BLEOptions {
    scanDuration: number;
    scanInterval: number;
    scanWindow: number;
    allowDuplicates: boolean;
    connectionTimeout: number;
    mtuSize: number;
    priority: 'balanced' | 'high' | 'low';
    powerLevel: 'high' | 'medium' | 'low';
    backgroundMode: boolean;
    showPowerAlert: boolean;
    restoreIdentifier: string;
    maxPriority: boolean;
    forceBondDialog: boolean;
}
/**
 * Native BLE Module
 * Provides optimized BLE functionality for React Native apps
 */
export declare class NativeBLEModule extends EventEmitter {
    private telemetry;
    private options;
    private devices;
    private scanning;
    private scanTimer?;
    private restoreState;
    constructor(telemetry: TelemetryManager, options?: Partial<BLEOptions>);
    /**
     * Initialize BLE module
     */
    initialize(): Promise<void>;
    /**
     * Start scanning for devices
     */
    startScan(options?: {
        services?: string[];
        namePrefix?: string;
        allowDuplicates?: boolean;
    }): Promise<void>;
    /**
     * Stop scanning for devices
     */
    stopScan(): Promise<void>;
    /**
     * Connect to device
     */
    connect(deviceId: string, options?: {
        timeout?: number;
        autoConnect?: boolean;
        requireBond?: boolean;
    }): Promise<void>;
    /**
     * Disconnect from device
     */
    disconnect(deviceId: string): Promise<void>;
    /**
     * Read characteristic value
     */
    readCharacteristic(deviceId: string, serviceId: string, characteristicId: string): Promise<Buffer>;
    /**
     * Write characteristic value
     */
    writeCharacteristic(deviceId: string, serviceId: string, characteristicId: string, value: Buffer, withResponse?: boolean): Promise<void>;
    /**
     * Enable notifications for characteristic
     */
    enableNotifications(deviceId: string, serviceId: string, characteristicId: string): Promise<void>;
    /**
     * Disable notifications for characteristic
     */
    disableNotifications(deviceId: string, serviceId: string, characteristicId: string): Promise<void>;
    private initializeOptions;
    private isPlatformSupported;
    private getPlatform;
    private setupBackgroundMode;
    private restoreConnectionState;
    private createBond;
    private discoverServices;
    private discoverCharacteristics;
}
export {};
