import { EventEmitter } from 'events';
import { DiscoveryProvider } from '../DeviceDiscovery';
interface BluetoothDiscoveryOptions {
    allowedDevices?: string[];
    ignoredDevices?: string[];
    serviceUUIDs?: string[];
    rssiThreshold?: number;
    enableClassic?: boolean;
    enableBLE?: boolean;
    scanDuration?: number;
    scanInterval?: number;
    connectTimeout?: number;
    deviceMatchers?: Array<{
        pattern: RegExp;
        protocol: string;
    }>;
}
/**
 * Bluetooth Discovery Provider
 * Discovers both classic Bluetooth and BLE devices
 */
export declare class BluetoothDiscoveryProvider extends EventEmitter implements DiscoveryProvider {
    readonly id: string;
    readonly name: string;
    private options;
    private scanning;
    private scanTimer?;
    private discoveredDevices;
    private bleManager?;
    private classicManager?;
    constructor(options?: BluetoothDiscoveryOptions);
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
     * Initialize BLE discovery
     */
    private initializeBLE;
    /**
     * Initialize Classic Bluetooth discovery
     */
    private initializeClassic;
    /**
     * Start scanning for devices
     */
    private startScanning;
    /**
     * Handle BLE device discovery
     */
    private handleBLEDiscovery;
    /**
     * Handle Classic Bluetooth discovery
     */
    private handleClassicDiscovery;
    /**
     * Resolve BLE device services
     */
    private resolveBLEServices;
    /**
     * Resolve Classic Bluetooth services
     */
    private resolveClassicServices;
    /**
     * Check if device should be processed
     */
    private shouldProcessDevice;
    /**
     * Create device info from discovered device
     */
    private createDeviceInfo;
    /**
     * Find matching protocol for device
     */
    private findMatchingProtocol;
}
export {};
