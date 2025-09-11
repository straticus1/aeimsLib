import { Device } from '../DeviceManager';
interface DeviceState {
    devices: Map<string, Device>;
    defaultDevice: string | null;
    lastUpdated: number;
}
/**
 * Persistence Manager
 * Handles device state persistence with proper locking and transaction support
 */
export declare class PersistenceManager {
    private dataDir;
    private lockFile;
    private stateFile;
    private locked;
    constructor();
    /**
     * Initialize storage
     */
    private initialize;
    /**
     * Acquire lock for atomic operations
     */
    private acquireLock;
    /**
     * Release lock
     */
    private releaseLock;
    /**
     * Load device state
     */
    loadDevices(): Promise<DeviceState>;
    /**
     * Save device state
     */
    saveDevices(devices: Map<string, Device>): Promise<void>;
    /**
     * Execute operations in a transaction
     */
    transaction<T>(operations: () => Promise<T>): Promise<T>;
}
export {};
