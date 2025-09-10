import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { DeviceManager } from '../core/DeviceManager';
import { DeviceMode } from '../core/types/DeviceTypes';
import { DeviceError, ErrorType } from '../core/errors/DeviceError';
import { join } from 'path';

// Mock device config for testing
const mockDeviceConfig = {
  type: 'test_device',
  name: 'Test Device',
  description: 'Device for testing',
  version: '1.0.0',
  features: [
    {
      id: 'basic_control',
      name: 'Basic Control',
      description: 'Basic device control',
      parameters: [
        {
          id: 'intensity',
          name: 'Intensity',
          type: 'number',
          min: 0,
          max: 100
        }
      ]
    },
    {
      id: 'advanced_control',
      name: 'Advanced Control',
      description: 'Advanced device control',
      experimental: true,
      parameters: [
        {
          id: 'mode',
          name: 'Mode',
          type: 'string'
        }
      ]
    }
  ],
  pricing: {
    baseRate: 50,
    featureRates: {
      basic_control: 0,
      advanced_control: 100
    },
    currency: 'USD',
    billingPeriod: 'monthly'
  }
};

// Mock file system operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockImplementation(async (path: string) => {
    if (path.includes('test_device.json')) {
      return JSON.stringify(mockDeviceConfig);
    }
    if (path.includes('devices.json')) {
      return JSON.stringify({
        devices: [],
        defaultDevice: null,
        lastUpdated: Date.now()
      });
    }
    throw new Error('File not found');
  }),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn()
}));

describe('DeviceManager', () => {
  let manager: DeviceManager;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create new manager instance
    manager = new DeviceManager();
  });

  describe('Device Management', () => {
    test('should add a new device', async () => {
      const device = await manager.addDevice({
        id: 'test1',
        name: 'Test Device 1',
        type: 'test_device'
      });

      expect(device).toMatchObject({
        id: 'test1',
        name: 'Test Device 1',
        type: 'test_device',
        isDefault: true,
        mode: DeviceMode.DEVELOPMENT
      });

      // Should have features from config
      expect(device.features).toHaveLength(2);
      expect(device.features[0].id).toBe('basic_control');
      expect(device.features[1].id).toBe('advanced_control');

      // Should have pricing from config
      expect(device.pricing).toMatchObject({
        baseRate: 0, // Free in dev mode
        currency: 'USD',
        billingPeriod: 'monthly'
      });
    });

    test('should not add duplicate device', async () => {
      await manager.addDevice({
        id: 'test1',
        name: 'Test Device 1',
        type: 'test_device'
      });

      await expect(manager.addDevice({
        id: 'test1',
        name: 'Test Device 1 Duplicate',
        type: 'test_device'
      })).rejects.toThrow(DeviceError);
    });

    test('should list devices with filtering', async () => {
      await manager.addDevice({
        id: 'test1',
        name: 'Test Device 1',
        type: 'test_device'
      });

      await manager.addDevice({
        id: 'test2',
        name: 'Test Device 2',
        type: 'other_type'
      });

      const devices = manager.listDevices({
        type: 'test_device'
      });

      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('test1');
    });

    test('should delete device', async () => {
      await manager.addDevice({
        id: 'test1',
        name: 'Test Device 1',
        type: 'test_device'
      });

      await manager.deleteDevice('test1');
      
      const devices = manager.listDevices();
      expect(devices).toHaveLength(0);
    });

    test('should promote device to default', async () => {
      await manager.addDevice({
        id: 'test1',
        name: 'Test Device 1',
        type: 'test_device'
      });

      await manager.addDevice({
        id: 'test2',
        name: 'Test Device 2',
        type: 'test_device'
      });

      await manager.promoteDevice('test2');

      const defaultDevice = manager.getDefaultDevice();
      expect(defaultDevice?.id).toBe('test2');
    });
  });

  describe('Mode Switching', () => {
    test('should switch between dev and prod modes', async () => {
      await manager.addDevice({
        id: 'test1',
        name: 'Test Device 1',
        type: 'test_device'
      });

      // Switch to production mode
      await manager.setMode(DeviceMode.PRODUCTION);
      
      const device = manager.listDevices()[0];
      
      // Should only have stable features in prod
      expect(device.features).toHaveLength(1);
      expect(device.features[0].id).toBe('basic_control');

      // Should have real pricing in prod
      expect(device.pricing.baseRate).toBe(50);
      expect(device.pricing.featureRates.basic_control).toBe(0);

      // Switch back to dev mode
      await manager.setMode(DeviceMode.DEVELOPMENT);
      
      const devDevice = manager.listDevices()[0];
      
      // Should have all features in dev
      expect(devDevice.features).toHaveLength(2);
      
      // Should be free in dev
      expect(devDevice.pricing.baseRate).toBe(0);
      expect(devDevice.pricing.featureRates.basic_control).toBe(0);
      expect(devDevice.pricing.featureRates.advanced_control).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid device type', async () => {
      await expect(manager.addDevice({
        id: 'test1',
        name: 'Test Device 1',
        type: 'invalid_type'
      })).rejects.toThrow(DeviceError);
    });

    test('should handle missing device on delete', async () => {
      await expect(manager.deleteDevice('nonexistent'))
        .rejects.toThrow(DeviceError);
    });

    test('should handle missing device on promote', async () => {
      await expect(manager.promoteDevice('nonexistent'))
        .rejects.toThrow(DeviceError);
    });
  });

  describe('Feature Management', () => {
    test('should get available features', async () => {
      const features = await manager.getAvailableFeatures('test_device');
      
      expect(features).toHaveLength(2);
      expect(features[0].id).toBe('basic_control');
      expect(features[1].id).toBe('advanced_control');
    });

    test('should filter experimental features in production', async () => {
      await manager.setMode(DeviceMode.PRODUCTION);
      
      const features = await manager.getAvailableFeatures('test_device');
      
      expect(features).toHaveLength(1);
      expect(features[0].id).toBe('basic_control');
    });
  });

  describe('Pricing', () => {
    test('should calculate correct pricing in dev mode', async () => {
      const pricing = await manager.getPricing('test_device');
      
      expect(pricing.baseRate).toBe(0);
      expect(pricing.featureRates.basic_control).toBe(0);
      expect(pricing.featureRates.advanced_control).toBe(0);
    });

    test('should calculate correct pricing in prod mode', async () => {
      await manager.setMode(DeviceMode.PRODUCTION);
      
      const pricing = await manager.getPricing('test_device');
      
      expect(pricing.baseRate).toBe(50);
      expect(pricing.featureRates.basic_control).toBe(0);
      expect(pricing.featureRates.advanced_control).toBe(100);
    });
  });
});
