import { EventEmitter } from 'events';
import { DiscoveredDevice } from '../discovery/DeviceDiscovery';
import { DeviceConfiguration } from '../config/DeviceConfigManager';
import { ProtocolRegistry } from '../protocol/ProtocolRegistry';
import { ProtocolHandler } from '../protocol/ProtocolRegistry';
import { Database } from '../../core/database/Database';
import { Logger } from '../../core/logging/Logger';

/**
 * Device Status
 */
export enum DeviceStatus {
  UNKNOWN = 'unknown',
  OFFLINE = 'offline',
  ONLINE = 'online',
  ERROR = 'error',
  DISABLED = 'disabled',
  MAINTENANCE = 'maintenance'
}

/**
 * Device Information
 */
export interface DeviceInfo {
  // Identity
  id: string;
  name: string;
  type: string;
  protocol: string;
  address: string;
  status: DeviceStatus;

  // Hardware info
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmware?: string;

  // Capabilities
  capabilities: string[];
  features: Set<string>;
  metadata: Record<string, any>;

  // State
  lastSeen?: number;
  lastConnected?: number;
  lastError?: Error;
  errorCount: number;
  
  // Configuration
  config?: DeviceConfiguration;
  enabled: boolean;
}

/**
 * Device Registry Options
 */
interface DeviceRegistryOptions {
  autoConnect?: boolean;
  connectRetries?: number;
  connectTimeout?: number;
  reconnectDelay?: number;
  staleTimeout?: number;
  cleanupInterval?: number;
  maxErrorCount?: number;
  persistentStorage?: boolean;
  storagePrefix?: string;
}

/**
 * Device Registry Events
 */
interface DeviceRegistryEvents {
  'deviceAdded': (device: DeviceInfo) => void;
  'deviceRemoved': (deviceId: string) => void;
  'deviceUpdated': (device: DeviceInfo) => void;
  'deviceConnected': (deviceId: string) => void;
  'deviceDisconnected': (deviceId: string) => void;
  'deviceError': (deviceId: string, error: Error) => void;
  'error': (error: Error) => void;
}

/**
 * Device Registry
 * Manages device lifecycle, state and connectivity
 */
export class DeviceRegistry extends EventEmitter {
  private static instance: DeviceRegistry;
  private options: Required<DeviceRegistryOptions>;
  private devices = new Map<string, DeviceInfo>();
  private protocolHandlers = new Map<string, ProtocolHandler>();
  private cleanupTimer?: NodeJS.Timeout;

  private constructor(
    private database: Database,
    private logger: Logger,
    options: DeviceRegistryOptions = {}
  ) {
    super();
    this.options = this.initializeOptions(options);
    this.setupCleanupTimer();
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    database: Database,
    logger: Logger,
    options?: DeviceRegistryOptions
  ): DeviceRegistry {
    if (!DeviceRegistry.instance) {
      DeviceRegistry.instance = new DeviceRegistry(database, logger, options);
    }
    return DeviceRegistry.instance;
  }

  /**
   * Initialize registry
   */
  async initialize(): Promise<void> {
    try {
      if (this.options.persistentStorage) {
        await this.loadDevices();
      }
    } catch (error) {
      this.logger.error('Failed to initialize device registry:', error);
      throw error;
    }
  }

  /**
   * Add or update device
   */
  async addDevice(
    device: DiscoveredDevice,
    config?: DeviceConfiguration
  ): Promise<DeviceInfo> {
    try {
      // Create or update device info
      const existing = this.devices.get(device.id);
      const info: DeviceInfo = {
        id: device.id,
        name: device.name,
        type: device.type,
        protocol: device.protocol,
        address: device.address,
        status: existing?.status || DeviceStatus.OFFLINE,
        manufacturer: device.manufacturer,
        model: device.model,
        serialNumber: device.serialNumber,
        firmware: device.firmware,
        capabilities: device.capabilities || [],
        features: new Set(device.capabilities || []),
        metadata: device.metadata || {},
        lastSeen: device.lastSeen,
        lastConnected: existing?.lastConnected,
        lastError: existing?.lastError,
        errorCount: existing?.errorCount || 0,
        config: config || existing?.config,
        enabled: existing?.enabled ?? true
      };

      if (existing) {
        // Update existing device
        Object.assign(existing, info);
        await this.persistDevice(existing);
        this.emit('deviceUpdated', existing);
        return existing;
      } else {
        // Add new device
        this.devices.set(info.id, info);
        await this.persistDevice(info);
        this.emit('deviceAdded', info);

        // Auto-connect if enabled
        if (this.options.autoConnect && info.enabled) {
          await this.connectDevice(info.id).catch(error => {
            this.logger.warn(
              `Failed to auto-connect device ${info.id}:`,
              error
            );
          });
        }

        return info;
      }

    } catch (error) {
      this.logger.error(
        `Failed to add/update device ${device.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Remove device
   */
  async removeDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) return;

    try {
      // Disconnect if connected
      await this.disconnectDevice(deviceId);

      // Remove from storage
      if (this.options.persistentStorage) {
        await this.database.delete(
          `${this.options.storagePrefix}:${deviceId}`
        );
      }

      // Remove from registry
      this.devices.delete(deviceId);
      this.emit('deviceRemoved', deviceId);

    } catch (error) {
      this.logger.error(
        `Failed to remove device ${deviceId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): DeviceInfo | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * List all devices
   */
  listDevices(filter?: {
    type?: string;
    protocol?: string;
    status?: DeviceStatus;
    capability?: string;
  }): DeviceInfo[] {
    let devices = Array.from(this.devices.values());

    if (filter) {
      devices = devices.filter(device => {
        if (filter.type && device.type !== filter.type) {
          return false;
        }
        if (filter.protocol && device.protocol !== filter.protocol) {
          return false;
        }
        if (filter.status && device.status !== filter.status) {
          return false;
        }
        if (filter.capability && !device.capabilities.includes(filter.capability)) {
          return false;
        }
        return true;
      });
    }

    return devices;
  }

  /**
   * Update device configuration
   */
  async updateDeviceConfig(
    deviceId: string,
    config: DeviceConfiguration
  ): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      device.config = config;
      await this.persistDevice(device);
      this.emit('deviceUpdated', device);

    } catch (error) {
      this.logger.error(
        `Failed to update device config ${deviceId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Enable/disable device
   */
  async setDeviceEnabled(
    deviceId: string,
    enabled: boolean
  ): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      if (device.enabled !== enabled) {
        device.enabled = enabled;
        
        if (!enabled && device.status === DeviceStatus.ONLINE) {
          await this.disconnectDevice(deviceId);
        }
        
        device.status = enabled ?
          DeviceStatus.OFFLINE :
          DeviceStatus.DISABLED;

        await this.persistDevice(device);
        this.emit('deviceUpdated', device);
      }

    } catch (error) {
      this.logger.error(
        `Failed to ${enabled ? 'enable' : 'disable'} device ${deviceId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Connect to device
   */
  async connectDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    if (!device.enabled) {
      throw new Error(`Device ${deviceId} is disabled`);
    }

    if (device.status === DeviceStatus.ONLINE) {
      return;
    }

    try {
      // Get or create protocol handler
      let handler = this.protocolHandlers.get(deviceId);
      if (!handler) {
        handler = await this.createProtocolHandler(device);
        this.protocolHandlers.set(deviceId, handler);
      }

      // Connect with retry
      let retries = 0;
      while (retries <= this.options.connectRetries) {
        try {
          await handler.connect(device.config);
          break;
        } catch (error) {
          retries++;
          if (retries > this.options.connectRetries) {
            throw error;
          }
          await new Promise(resolve =>
            setTimeout(resolve, this.options.reconnectDelay)
          );
        }
      }

      // Update device state
      device.status = DeviceStatus.ONLINE;
      device.lastConnected = Date.now();
      device.errorCount = 0;
      
      await this.persistDevice(device);
      this.emit('deviceConnected', deviceId);
      this.emit('deviceUpdated', device);

    } catch (error) {
      this.handleDeviceError(device, error);
      throw error;
    }
  }

  /**
   * Disconnect from device
   */
  async disconnectDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const handler = this.protocolHandlers.get(deviceId);
    if (!handler) {
      return;
    }

    try {
      await handler.disconnect();
      this.protocolHandlers.delete(deviceId);

      // Update device state
      device.status = DeviceStatus.OFFLINE;
      await this.persistDevice(device);
      
      this.emit('deviceDisconnected', deviceId);
      this.emit('deviceUpdated', device);

    } catch (error) {
      this.handleDeviceError(device, error);
      throw error;
    }
  }

  /**
   * Send command to device
   */
  async sendCommand(
    deviceId: string,
    command: any
  ): Promise<any> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    if (!device.enabled) {
      throw new Error(`Device ${deviceId} is disabled`);
    }

    const handler = this.protocolHandlers.get(deviceId);
    if (!handler) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    try {
      return await handler.sendCommand(command);
    } catch (error) {
      this.handleDeviceError(device, error);
      throw error;
    }
  }

  /**
   * Initialize options
   */
  private initializeOptions(options: DeviceRegistryOptions): Required<DeviceRegistryOptions> {
    return {
      autoConnect: options.autoConnect !== false,
      connectRetries: options.connectRetries || 3,
      connectTimeout: options.connectTimeout || 5000,
      reconnectDelay: options.reconnectDelay || 1000,
      staleTimeout: options.staleTimeout || 300000, // 5 minutes
      cleanupInterval: options.cleanupInterval || 60000, // 1 minute
      maxErrorCount: options.maxErrorCount || 10,
      persistentStorage: options.persistentStorage !== false,
      storagePrefix: options.storagePrefix || 'device'
    };
  }

  /**
   * Setup cleanup timer
   */
  private setupCleanupTimer(): void {
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.options.cleanupInterval
    );
  }

  /**
   * Cleanup stale devices
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();

    for (const [id, device] of this.devices) {
      // Check if device is stale
      if (device.lastSeen &&
          now - device.lastSeen > this.options.staleTimeout) {
        // Disconnect if connected
        if (device.status === DeviceStatus.ONLINE) {
          await this.disconnectDevice(id).catch(() => {});
        }
        
        // Update state
        device.status = DeviceStatus.OFFLINE;
        await this.persistDevice(device);
        this.emit('deviceUpdated', device);
      }

      // Check error threshold
      if (device.errorCount > this.options.maxErrorCount) {
        device.status = DeviceStatus.ERROR;
        await this.persistDevice(device);
        this.emit('deviceUpdated', device);
      }
    }
  }

  /**
   * Create protocol handler
   */
  private async createProtocolHandler(
    device: DeviceInfo
  ): Promise<ProtocolHandler> {
    const registry = ProtocolRegistry.getInstance();
    
    try {
      return registry.createProtocolHandler(
        device.protocol,
        device.config
      );
    } catch (error) {
      this.logger.error(
        `Failed to create protocol handler for ${device.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Handle device error
   */
  private handleDeviceError(device: DeviceInfo, error: Error): void {
    device.lastError = error;
    device.errorCount++;
    
    if (device.errorCount > this.options.maxErrorCount) {
      device.status = DeviceStatus.ERROR;
    }

    this.persistDevice(device).catch(error => {
      this.logger.error(
        `Failed to persist device state for ${device.id}:`,
        error
      );
    });

    this.emit('deviceError', device.id, error);
    this.emit('deviceUpdated', device);
  }

  /**
   * Load devices from storage
   */
  private async loadDevices(): Promise<void> {
    try {
      const prefix = `${this.options.storagePrefix}:`;
      const keys = await this.database.keys(prefix);

      for (const key of keys) {
        try {
          const data = await this.database.get(key);
          if (!data) continue;

          const device: DeviceInfo = JSON.parse(data);
          device.status = DeviceStatus.OFFLINE;
          this.devices.set(device.id, device);

        } catch (error) {
          this.logger.error(
            `Failed to load device ${key}:`,
            error
          );
        }
      }

    } catch (error) {
      this.logger.error(
        'Failed to load devices from storage:',
        error
      );
      throw error;
    }
  }

  /**
   * Persist device to storage
   */
  private async persistDevice(device: DeviceInfo): Promise<void> {
    if (!this.options.persistentStorage) return;

    try {
      const key = `${this.options.storagePrefix}:${device.id}`;
      await this.database.set(
        key,
        JSON.stringify(device)
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist device ${device.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Disconnect all devices
    const disconnects = Array.from(this.devices.keys()).map(id =>
      this.disconnectDevice(id).catch(() => {})
    );
    await Promise.all(disconnects);

    // Clear state
    this.devices.clear();
    this.protocolHandlers.clear();
    this.removeAllListeners();
  }
}
