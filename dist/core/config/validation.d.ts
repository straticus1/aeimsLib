import { DeviceTypeConfig } from './DeviceConfig';
/**
 * Validation result interface
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate device configuration
 */
export declare function validateConfig(config: DeviceTypeConfig): ValidationResult;
/**
 * Validate device type string
 */
export declare function validateDeviceType(type: string): ValidationResult;
/**
 * Validate device ID
 */
export declare function validateDeviceId(id: string): ValidationResult;
/**
 * Validate device name
 */
export declare function validateDeviceName(name: string): ValidationResult;
