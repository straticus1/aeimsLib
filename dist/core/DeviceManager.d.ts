import { EventEmitter } from 'events';
import { DeviceMode } from './types/DeviceMode';
import { DeviceFeature } from './types/DeviceFeature';
import { DevicePricing } from './types/DevicePricing';
import { DeviceState } from './types/DeviceState';
export interface Device {
    id: string;
    name: string;
    type: string;
    features: DeviceFeature[];
    pricing: DevicePricing;
    state: DeviceState;
    isDefault?: boolean;
    mode: DeviceMode;
}
export declare class DeviceManager extends EventEmitter {
    private devices;
    private defaultDevice;
    private persistence;
    private logger;
    private currentMode;
    constructor(mode?: DeviceMode);
    /**
     * Add a new device to the system
     */
    addDevice(device: Omit<Device, 'state' | 'features' | 'pricing'>): Promise<Device>;
    /**
     * List all devices with optional filtering
     */
    listDevices(filter?: {
        type?: string;
        mode?: DeviceMode;
        features?: DeviceFeature[];
    }): Device[];
    /**
     * Delete a device from the system
     */
    deleteDevice(deviceId: string): Promise<void>;
    /**
     * Promote a device to be the default
     */
    promoteDevice(deviceId: string): Promise<Device>;
    /**
     * Get the current default device
     */
    getDefaultDevice(): Device | null;
    /**
     * Switch between development and production modes
     */
    setMode(mode: DeviceMode): Promise<void>;
    /**
     * Get available features for a device type
     */
    getAvailableFeatures(deviceType: string): Promise<DeviceFeature[]>;
    /**
     * Calculate pricing for a device type
     */
    getPricing(deviceType: string): Promise<DevicePricing>;
    private validateDeviceOperation;
    private resolveFeatures;
    private calculatePricing;
    private loadState;
}
