import { EventEmitter } from 'events';
import { DeviceConfig } from './config/DeviceConfig';
import { DeviceMode } from './types/DeviceMode';
import { DeviceFeature } from './types/DeviceFeature';
import { DevicePricing } from './types/DevicePricing';
import { DeviceState } from './types/DeviceState';
import { DeviceError, ErrorType } from './errors/DeviceError';
import { PersistenceManager } from './persistence/PersistenceManager';
import { AuditLogger } from './logging/AuditLogger';

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

export class DeviceManager extends EventEmitter {
  private devices: Map<string, Device>;
  private defaultDevice: string | null;
  private persistence: PersistenceManager;
  private logger: AuditLogger;
  private currentMode: DeviceMode;
  
  constructor(mode: DeviceMode = DeviceMode.DEVELOPMENT) {
    super();
    this.devices = new Map();
    this.defaultDevice = null;
    this.currentMode = mode;
    this.persistence = new PersistenceManager();
    this.logger = new AuditLogger();
    
    // Load persisted state
    this.loadState();
  }

  /**
   * Add a new device to the system
   */
  async addDevice(device: Omit<Device, 'state' | 'features' | 'pricing'>) {
    this.validateDeviceOperation('add');

    if (this.devices.has(device.id)) {
      throw new DeviceError(
        ErrorType.DUPLICATE_DEVICE,
        `Device with ID ${device.id} already exists`
      );
    }

    // Get device configuration
    const config = await DeviceConfig.getDeviceConfig(device.type);
    
    // Initialize device state
    const newDevice: Device = {
      ...device,
      features: this.resolveFeatures(config.features, this.currentMode),
      pricing: this.calculatePricing(config.pricing, this.currentMode),
      state: DeviceState.INITIALIZED,
      mode: this.currentMode
    };

    // Persist and emit events atomically
    await this.persistence.transaction(async () => {
      this.devices.set(device.id, newDevice);
      
      // Make first device default
      if (this.devices.size === 1) {
        this.defaultDevice = device.id;
        newDevice.isDefault = true;
      }

      await this.persistence.saveDevices(this.devices);
      await this.logger.logDeviceOperation('add', device.id);
      
      this.emit('deviceAdded', newDevice);
    });

    return newDevice;
  }

  /**
   * List all devices with optional filtering
   */
  listDevices(filter?: {
    type?: string;
    mode?: DeviceMode;
    features?: DeviceFeature[];
  }) {
    this.validateDeviceOperation('list');
    
    let devices = Array.from(this.devices.values());

    if (filter) {
      devices = devices.filter(device => {
        if (filter.type && device.type !== filter.type) return false;
        if (filter.mode && device.mode !== filter.mode) return false;
        if (filter.features) {
          return filter.features.every(feature => 
            device.features.includes(feature)
          );
        }
        return true;
      });
    }

    return devices;
  }

  /**
   * Delete a device from the system
   */
  async deleteDevice(deviceId: string) {
    this.validateDeviceOperation('delete');

    const device = this.devices.get(deviceId);
    if (!device) {
      throw new DeviceError(
        ErrorType.DEVICE_NOT_FOUND,
        `Device ${deviceId} not found`
      );
    }

    // Persist and emit events atomically
    await this.persistence.transaction(async () => {
      this.devices.delete(deviceId);
      
      // Update default device if needed
      if (this.defaultDevice === deviceId) {
        const nextDevice = this.devices.values().next().value;
        this.defaultDevice = nextDevice ? nextDevice.id : null;
        
        if (nextDevice) {
          nextDevice.isDefault = true;
          this.emit('devicePromoted', nextDevice);
        }
      }

      await this.persistence.saveDevices(this.devices);
      await this.logger.logDeviceOperation('delete', deviceId);
      
      this.emit('deviceDeleted', device);
    });
  }

  /**
   * Promote a device to be the default
   */
  async promoteDevice(deviceId: string) {
    this.validateDeviceOperation('promote');

    const device = this.devices.get(deviceId);
    if (!device) {
      throw new DeviceError(
        ErrorType.DEVICE_NOT_FOUND,
        `Device ${deviceId} not found`
      );
    }

    // Don't promote if already default
    if (this.defaultDevice === deviceId) {
      return device;
    }

    // Persist and emit events atomically
    await this.persistence.transaction(async () => {
      // Clear previous default
      if (this.defaultDevice) {
        const previousDefault = this.devices.get(this.defaultDevice);
        if (previousDefault) {
          previousDefault.isDefault = false;
        }
      }

      // Set new default
      this.defaultDevice = deviceId;
      device.isDefault = true;

      await this.persistence.saveDevices(this.devices);
      await this.logger.logDeviceOperation('promote', deviceId);
      
      this.emit('devicePromoted', device);
    });

    return device;
  }

  /**
   * Get the current default device
   */
  getDefaultDevice(): Device | null {
    return this.defaultDevice ? this.devices.get(this.defaultDevice) || null : null;
  }

  /**
   * Switch between development and production modes
   */
  async setMode(mode: DeviceMode) {
    if (mode === this.currentMode) return;

    await this.persistence.transaction(async () => {
      this.currentMode = mode;
      
      // Update all device features and pricing
      for (const device of this.devices.values()) {
        const config = await DeviceConfig.getDeviceConfig(device.type);
        device.features = this.resolveFeatures(config.features, mode);
        device.pricing = this.calculatePricing(config.pricing, mode);
        device.mode = mode;
      }

      await this.persistence.saveDevices(this.devices);
      await this.logger.logModeChange(mode);
      
      this.emit('modeChanged', mode);
    });
  }

  /**
   * Get available features for a device type
   */
  async getAvailableFeatures(deviceType: string): Promise<DeviceFeature[]> {
    const config = await DeviceConfig.getDeviceConfig(deviceType);
    return this.resolveFeatures(config.features, this.currentMode);
  }

  /**
   * Calculate pricing for a device type
   */
  async getPricing(deviceType: string): Promise<DevicePricing> {
    const config = await DeviceConfig.getDeviceConfig(deviceType);
    return this.calculatePricing(config.pricing, this.currentMode);
  }

  private validateDeviceOperation(operation: string) {
    // Basic validation
    if (!['add', 'list', 'delete', 'promote'].includes(operation)) {
      throw new DeviceError(
        ErrorType.INVALID_OPERATION,
        `Invalid operation: ${operation}`
      );
    }

    // Mode-specific validation
    if (this.currentMode === DeviceMode.PRODUCTION) {
      // Add additional production mode validation
      // For example, require auth tokens, validate against quotas, etc.
    }
  }

  private resolveFeatures(
    features: DeviceFeature[],
    mode: DeviceMode
  ): DeviceFeature[] {
    // In production, only expose stable features
    if (mode === DeviceMode.PRODUCTION) {
      return features.filter(feature => !feature.experimental);
    }
    return features;
  }

  private calculatePricing(
    pricing: DevicePricing,
    mode: DeviceMode
  ): DevicePricing {
    // Apply mode-specific pricing rules
    if (mode === DeviceMode.DEVELOPMENT) {
      return {
        ...pricing,
        baseRate: 0, // Free in dev mode
        featureRates: Object.fromEntries(
          Object.entries(pricing.featureRates).map(([k, v]) => [k, 0])
        )
      };
    }
    return pricing;
  }

  private async loadState() {
    try {
      const state = await this.persistence.loadDevices();
      this.devices = state.devices;
      this.defaultDevice = state.defaultDevice;
    } catch (error) {
      this.logger.logError('Failed to load device state', error);
      throw new DeviceError(
        ErrorType.STATE_LOAD_ERROR,
        'Failed to load device state'
      );
    }
  }
}
