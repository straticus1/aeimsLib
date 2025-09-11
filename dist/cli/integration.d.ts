import { DeviceMode } from '../core/types/DeviceTypes';
/**
 * Device Management Integration
 *
 * This module provides integration points for the SexaComms CLI to interact with
 * the device management system. It uses the existing CLI architecture while
 * exposing device management capabilities.
 */
export declare class DeviceManagementIntegration {
    private manager;
    constructor(mode?: DeviceMode);
    /**
     * Register device management commands with the CLI
     */
    static register(program: any): void;
    /**
     * Add a new device
     */
    addDevice(type: string, name: string, id?: string): Promise<import("../core/DeviceManager").Device>;
    /**
     * List devices with optional filtering
     */
    listDevices(filter?: any): import("../core/DeviceManager").Device[];
    /**
     * Delete a device
     */
    deleteDevice(id: string, force?: boolean): Promise<void>;
    /**
     * Promote a device to default
     */
    promoteDevice(id: string): Promise<import("../core/DeviceManager").Device>;
    /**
     * Get available features for a device type
     */
    getFeatures(type: string): Promise<DeviceFeature[]>;
    /**
     * Get pricing for a device type
     */
    getPricing(type: string): Promise<DevicePricing>;
}
