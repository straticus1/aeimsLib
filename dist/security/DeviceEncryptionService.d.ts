import { EncryptionConfig, EncryptedData } from '../interfaces/security';
export declare class DeviceEncryptionService {
    private static instance;
    private encryptionKeys;
    private config;
    private constructor();
    static getInstance(): DeviceEncryptionService;
    /**
     * Initialize device-specific encryption
     */
    initializeDeviceEncryption(deviceId: string): Promise<void>;
    /**
     * Encrypt a device command
     */
    encryptCommand(command: any, deviceId: string): Promise<EncryptedData>;
    /**
     * Decrypt a device response
     */
    decryptResponse(encrypted: EncryptedData, deviceId: string): Promise<any>;
    /**
     * Rotate device encryption key
     */
    rotateDeviceKey(deviceId: string): Promise<void>;
    /**
     * Remove device encryption key
     */
    removeDeviceKey(deviceId: string): void;
    /**
     * Validate device encryption setup
     */
    validateDeviceEncryption(deviceId: string): Promise<boolean>;
    /**
     * Generate a device-specific encryption key
     */
    private generateDeviceKey;
    /**
     * Generate a unique ID for the current key
     */
    private generateKeyId;
    /**
     * Get the current configuration
     */
    getConfig(): EncryptionConfig;
    /**
     * Update the encryption configuration
     */
    updateConfig(config: Partial<EncryptionConfig>): void;
}
