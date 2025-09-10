import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { SecurityService, EncryptionConfig, EncryptedData } from '../interfaces/security';

export class DeviceEncryptionService {
  private static instance: DeviceEncryptionService;
  private encryptionKeys: Map<string, Buffer>;
  private config: EncryptionConfig;

  private constructor() {
    this.encryptionKeys = new Map();
    this.config = {
      enabled: true,
      algorithm: 'aes-256-gcm',
      keySize: 32, // 256 bits
      authTagLength: 16
    };
  }

  static getInstance(): DeviceEncryptionService {
    if (!DeviceEncryptionService.instance) {
      DeviceEncryptionService.instance = new DeviceEncryptionService();
    }
    return DeviceEncryptionService.instance;
  }

  /**
   * Initialize device-specific encryption
   */
  async initializeDeviceEncryption(deviceId: string): Promise<void> {
    if (!this.encryptionKeys.has(deviceId)) {
      const key = await this.generateDeviceKey(deviceId);
      this.encryptionKeys.set(deviceId, key);
    }
  }

  /**
   * Encrypt a device command
   */
  async encryptCommand(command: any, deviceId: string): Promise<EncryptedData> {
    if (!this.encryptionKeys.has(deviceId)) {
      await this.initializeDeviceEncryption(deviceId);
    }

    const key = this.encryptionKeys.get(deviceId)!;
    const iv = randomBytes(12); // 96 bits for GCM mode
    const cipher = createCipheriv(this.config.algorithm, key, iv, {
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
  async decryptResponse(encrypted: EncryptedData, deviceId: string): Promise<any> {
    const key = this.encryptionKeys.get(deviceId);
    if (!key) {
      throw new Error('No encryption key found for device');
    }

    const decipher = createDecipheriv(
      encrypted.algorithm,
      key,
      encrypted.iv,
      { authTagLength: this.config.authTagLength }
    );

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
  async rotateDeviceKey(deviceId: string): Promise<void> {
    const newKey = await this.generateDeviceKey(deviceId);
    this.encryptionKeys.set(deviceId, newKey);
  }

  /**
   * Remove device encryption key
   */
  removeDeviceKey(deviceId: string): void {
    this.encryptionKeys.delete(deviceId);
  }

  /**
   * Validate device encryption setup
   */
  async validateDeviceEncryption(deviceId: string): Promise<boolean> {
    try {
      const testData = { test: 'encryption_validation' };
      const encrypted = await this.encryptCommand(testData, deviceId);
      const decrypted = await this.decryptResponse(encrypted, deviceId);
      return decrypted.test === testData.test;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a device-specific encryption key
   */
  private async generateDeviceKey(deviceId: string): Promise<Buffer> {
    // Use device ID and random data to generate a unique key
    const salt = randomBytes(16);
    const keyMaterial = Buffer.concat([
      Buffer.from(deviceId),
      salt,
      randomBytes(32)
    ]);

    return new Promise((resolve, reject) => {
      // Use PBKDF2 to derive a strong key
      crypto.pbkdf2(
        keyMaterial,
        salt,
        100000, // High iteration count for security
        this.config.keySize,
        'sha512',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  /**
   * Generate a unique ID for the current key
   */
  private generateKeyId(deviceId: string): string {
    const key = this.encryptionKeys.get(deviceId);
    if (!key) {
      throw new Error('No encryption key found for device');
    }

    // Generate a fingerprint of the key
    return createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 16); // Use first 16 chars as key ID
  }

  /**
   * Get the current configuration
   */
  getConfig(): EncryptionConfig {
    return { ...this.config };
  }

  /**
   * Update the encryption configuration
   */
  updateConfig(config: Partial<EncryptionConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
}
