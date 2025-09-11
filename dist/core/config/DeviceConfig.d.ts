import { DeviceFeature, DevicePricing } from '../types/DeviceTypes';
/**
 * Device configuration interface
 */
export interface DeviceTypeConfig {
    type: string;
    name: string;
    description: string;
    version: string;
    features: DeviceFeature[];
    pricing: DevicePricing;
    requirements?: {
        minFirmware?: string;
        maxFirmware?: string;
        dependencies?: string[];
    };
}
/**
 * Device configuration manager
 */
export declare class DeviceConfig {
    private static configCache;
    private static configPath;
    /**
     * Load and validate device configuration
     */
    static getDeviceConfig(type: string): Promise<DeviceTypeConfig>;
    /**
     * Get all available device types
     */
    static getAvailableDeviceTypes(): Promise<string[]>;
    /**
     * Set custom configuration path
     */
    static setConfigPath(path: string): void;
    /**
     * Clear configuration cache
     */
    static clearCache(): void;
}
