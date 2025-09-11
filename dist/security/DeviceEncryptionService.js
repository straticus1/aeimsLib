"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceEncryptionService = void 0;
const crypto_1 = require("crypto");
class DeviceEncryptionService {
    constructor() {
        this.encryptionKeys = new Map();
        this.config = {
            enabled: true,
            algorithm: 'aes-256-gcm',
            keySize: 32, // 256 bits
            authTagLength: 16
        };
    }
    static getInstance() {
        if (!DeviceEncryptionService.instance) {
            DeviceEncryptionService.instance = new DeviceEncryptionService();
        }
        return DeviceEncryptionService.instance;
    }
    /**
     * Initialize device-specific encryption
     */
    async initializeDeviceEncryption(deviceId) {
        if (!this.encryptionKeys.has(deviceId)) {
            const key = await this.generateDeviceKey(deviceId);
            this.encryptionKeys.set(deviceId, key);
        }
    }
    /**
     * Encrypt a device command
     */
    async encryptCommand(command, deviceId) {
        if (!this.encryptionKeys.has(deviceId)) {
            await this.initializeDeviceEncryption(deviceId);
        }
        const key = this.encryptionKeys.get(deviceId);
        const iv = (0, crypto_1.randomBytes)(12); // 96 bits for GCM mode
        const cipher = (0, crypto_1.createCipheriv)(this.config.algorithm, key, iv, {
            authTagLength: this.config.authTagLength
        });
        const data = Buffer.concat([
            cipher.update(JSON.stringify(command), 'utf8'),
            cipher.final()
        ]);
        const authTag = cipher.getAuthTag();
        return {
            iv,
            data,
            authTag,
            algorithm: this.config.algorithm,
            keyId: this.generateKeyId(deviceId)
        };
    }
    /**
     * Decrypt a device response
     */
    async decryptResponse(encrypted, deviceId) {
        const key = this.encryptionKeys.get(deviceId);
        if (!key) {
            throw new Error('No encryption key found for device');
        }
        const decipher = (0, crypto_1.createDecipheriv)(encrypted.algorithm, key, encrypted.iv, { authTagLength: this.config.authTagLength });
        decipher.setAuthTag(encrypted.authTag);
        const decrypted = Buffer.concat([
            decipher.update(encrypted.data),
            decipher.final()
        ]);
        return JSON.parse(decrypted.toString('utf8'));
    }
    /**
     * Rotate device encryption key
     */
    async rotateDeviceKey(deviceId) {
        const newKey = await this.generateDeviceKey(deviceId);
        this.encryptionKeys.set(deviceId, newKey);
    }
    /**
     * Remove device encryption key
     */
    removeDeviceKey(deviceId) {
        this.encryptionKeys.delete(deviceId);
    }
    /**
     * Validate device encryption setup
     */
    async validateDeviceEncryption(deviceId) {
        try {
            const testData = { test: 'encryption_validation' };
            const encrypted = await this.encryptCommand(testData, deviceId);
            const decrypted = await this.decryptResponse(encrypted, deviceId);
            return decrypted.test === testData.test;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Generate a device-specific encryption key
     */
    async generateDeviceKey(deviceId) {
        // Use device ID and random data to generate a unique key
        const salt = (0, crypto_1.randomBytes)(16);
        const keyMaterial = Buffer.concat([
            Buffer.from(deviceId),
            salt,
            (0, crypto_1.randomBytes)(32)
        ]);
        return new Promise((resolve, reject) => {
            // Use PBKDF2 to derive a strong key
            crypto.pbkdf2(keyMaterial, salt, 100000, // High iteration count for security
            this.config.keySize, 'sha512', (err, derivedKey) => {
                if (err)
                    reject(err);
                else
                    resolve(derivedKey);
            });
        });
    }
    /**
     * Generate a unique ID for the current key
     */
    generateKeyId(deviceId) {
        const key = this.encryptionKeys.get(deviceId);
        if (!key) {
            throw new Error('No encryption key found for device');
        }
        // Generate a fingerprint of the key
        return (0, crypto_1.createHash)('sha256')
            .update(key)
            .digest('hex')
            .substring(0, 16); // Use first 16 chars as key ID
    }
    /**
     * Get the current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update the encryption configuration
     */
    updateConfig(config) {
        this.config = {
            ...this.config,
            ...config
        };
    }
}
exports.DeviceEncryptionService = DeviceEncryptionService;
//# sourceMappingURL=DeviceEncryptionService.js.map