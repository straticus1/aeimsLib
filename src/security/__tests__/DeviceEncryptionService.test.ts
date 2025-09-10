import { DeviceEncryptionService } from '../DeviceEncryptionService';
import { EncryptedData } from '../../interfaces/security';

describe('DeviceEncryptionService', () => {
  let encryptionService: DeviceEncryptionService;

  beforeEach(() => {
    encryptionService = DeviceEncryptionService.getInstance();
  });

  test('should be a singleton', () => {
    const instance1 = DeviceEncryptionService.getInstance();
    const instance2 = DeviceEncryptionService.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should initialize device encryption', async () => {
    const deviceId = 'test_device_1';
    await expect(encryptionService.initializeDeviceEncryption(deviceId))
      .resolves.not.toThrow();
  });

  test('should encrypt and decrypt commands', async () => {
    const deviceId = 'test_device_2';
    const command = {
      type: 'vibrate',
      intensity: 50,
      timestamp: Date.now()
    };

    // Initialize encryption for device
    await encryptionService.initializeDeviceEncryption(deviceId);

    // Encrypt command
    const encrypted = await encryptionService.encryptCommand(command, deviceId);
    expect(encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.data).toBeDefined();
    expect(encrypted.authTag).toBeDefined();

    // Decrypt command
    const decrypted = await encryptionService.decryptResponse(encrypted, deviceId);
    expect(decrypted).toEqual(command);
  });

  test('should handle key rotation', async () => {
    const deviceId = 'test_device_3';
    const command = { test: 'data' };

    // Initialize encryption
    await encryptionService.initializeDeviceEncryption(deviceId);

    // Encrypt with original key
    const encrypted1 = await encryptionService.encryptCommand(command, deviceId);

    // Rotate key
    await encryptionService.rotateDeviceKey(deviceId);

    // Encrypt with new key
    const encrypted2 = await encryptionService.encryptCommand(command, deviceId);

    // Keys should be different
    expect(encrypted1.keyId).not.toBe(encrypted2.keyId);

    // Should still decrypt correctly
    const decrypted = await encryptionService.decryptResponse(encrypted2, deviceId);
    expect(decrypted).toEqual(command);
  });

  test('should validate device encryption setup', async () => {
    const deviceId = 'test_device_4';
    
    await encryptionService.initializeDeviceEncryption(deviceId);
    const isValid = await encryptionService.validateDeviceEncryption(deviceId);
    
    expect(isValid).toBe(true);
  });

  test('should handle encryption errors', async () => {
    const deviceId = 'test_device_5';
    const command = { test: 'data' };

    // Try to encrypt without initialization
    await expect(encryptionService.encryptCommand(command, deviceId))
      .resolves.toBeDefined(); // Should auto-initialize

    // Try to decrypt with wrong device ID
    const encrypted = await encryptionService.encryptCommand(command, deviceId);
    await expect(encryptionService.decryptResponse(encrypted, 'wrong_device'))
      .rejects.toThrow('No encryption key found for device');
  });

  test('should handle configuration updates', () => {
    const originalConfig = encryptionService.getConfig();
    
    encryptionService.updateConfig({
      algorithm: 'aes-256-cbc',
      keySize: 16
    });

    const newConfig = encryptionService.getConfig();
    expect(newConfig).not.toEqual(originalConfig);
    expect(newConfig.algorithm).toBe('aes-256-cbc');
    expect(newConfig.keySize).toBe(16);

    // Reset config for other tests
    encryptionService.updateConfig(originalConfig);
  });

  test('should handle large data encryption', async () => {
    const deviceId = 'test_device_6';
    const largeCommand = {
      type: 'pattern',
      data: Array(1000).fill(0).map((_, i) => ({
        intensity: i % 100,
        duration: 100
      }))
    };

    await encryptionService.initializeDeviceEncryption(deviceId);
    const encrypted = await encryptionService.encryptCommand(largeCommand, deviceId);
    const decrypted = await encryptionService.decryptResponse(encrypted, deviceId);

    expect(decrypted).toEqual(largeCommand);
  });

  test('should generate unique keys for different devices', async () => {
    const deviceId1 = 'test_device_7';
    const deviceId2 = 'test_device_8';
    const command = { test: 'data' };

    await encryptionService.initializeDeviceEncryption(deviceId1);
    await encryptionService.initializeDeviceEncryption(deviceId2);

    const encrypted1 = await encryptionService.encryptCommand(command, deviceId1);
    const encrypted2 = await encryptionService.encryptCommand(command, deviceId2);

    expect(encrypted1.keyId).not.toBe(encrypted2.keyId);
  });
});
