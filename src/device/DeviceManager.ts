import { EventEmitter } from 'events';
import {
  Device,
  DeviceInfo,
  DeviceStatus,
  DeviceCommand,
  DeviceEvent,
  DeviceEventType,
  DeviceProtocol
} from '../interfaces/device';
import { ControlPattern } from '../interfaces/patterns';
import { DefaultPatternFactory } from '../patterns/PatternFactory';
import { MonitoringService } from '../interfaces/monitoring';
import { Logger } from '../utils/Logger';

export class DeviceManager extends EventEmitter {
  private static instance: DeviceManager;
  private devices: Map<string, Device>;
  private protocols: Map<string, DeviceProtocol>;
  private patterns: Map<string, ControlPattern>;
  private monitoring?: MonitoringService;
  private logger: Logger;

  private constructor() {
    super();
    this.devices = new Map();
    this.protocols = new Map();
    this.patterns = new Map();
    this.logger = Logger.getInstance();
  }

  static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  setMonitoringService(service: MonitoringService): void {
    this.monitoring = service;
  }

  registerProtocol(protocol: string, handler: DeviceProtocol): void {
    this.protocols.set(protocol.toLowerCase(), handler);
    this.logger.info(`Protocol registered: ${protocol}`);
  }

  async addDevice(deviceInfo: DeviceInfo): Promise<Device> {
    if (this.devices.has(deviceInfo.id)) {
      throw new Error(`Device ${deviceInfo.id} already exists`);
    }

    const protocol = this.protocols.get(deviceInfo.protocol.toLowerCase());
    if (!protocol) {
      throw new Error(`Unsupported protocol: ${deviceInfo.protocol}`);
    }

    const device: Device = {
      info: deviceInfo,
      status: {
        connected: false,
        lastSeen: new Date(),
      },
      settings: {
        rate_per_minute: 0,
        maxDuration: 3600,
        intensityLimit: 100,
        allowIntensityOverride: false,
        allowedPatterns: ['constant', 'wave', 'pulse', 'escalation']
      }
    };

    this.devices.set(deviceInfo.id, device);
    this.logger.info(`Device added: ${deviceInfo.id}`);

    // Subscribe to device events
    protocol.subscribe((event: DeviceEvent) => this.handleDeviceEvent(event));

    // Initial connection attempt
    try {
      await protocol.connect();
      this.updateDeviceStatus(deviceInfo.id, { connected: true, lastSeen: new Date() });
    } catch (error) {
      this.logger.error(`Failed to connect to device ${deviceInfo.id}: ${error}`);
      this.updateDeviceStatus(deviceInfo.id, { connected: false, lastSeen: new Date(), error: String(error) });
    }

    return device;
  }

  async removeDevice(deviceId: string): Promise<void> {
    const device = this.getDevice(deviceId);
    const protocol = this.protocols.get(device.info.protocol.toLowerCase());

    if (protocol) {
      await protocol.disconnect();
    }

    this.devices.delete(deviceId);
    this.patterns.delete(deviceId);
    this.logger.info(`Device removed: ${deviceId}`);
  }

  getDevice(deviceId: string): Device {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    return device;
  }

  getAllDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  async sendCommand(deviceId: string, command: DeviceCommand): Promise<void> {
    const device = this.getDevice(deviceId);
    
    if (!device.status.connected) {
      throw new Error('Device is not connected');
    }

    const protocol = this.protocols.get(device.info.protocol.toLowerCase());
    if (!protocol) {
      throw new Error(`Protocol not found: ${device.info.protocol}`);
    }

    try {
      // Validate command against device settings
      this.validateCommand(device, command);

      // Send command through protocol
      const result = await protocol.sendCommand(command);

      // Update device state
      if (result.success) {
        device.currentPattern = command.pattern || 'constant';
        device.currentIntensity = command.intensity;
        this.devices.set(deviceId, device);

        // Record metrics
        if (this.monitoring) {
          this.monitoring.recordMetric('device_command_success', 1, {
            deviceId,
            pattern: command.pattern || 'constant'
          });
        }
      } else {
        throw new Error(result.error || 'Command failed');
      }
    } catch (error) {
      this.logger.error(`Command failed for device ${deviceId}: ${error}`);
      
      if (this.monitoring) {
        this.monitoring.recordMetric('device_command_error', 1, {
          deviceId,
          error: String(error)
        });
      }
      
      throw error;
    }
  }

  private validateCommand(device: Device, command: DeviceCommand): void {
    // Check intensity limits
    if (command.intensity < 0 || command.intensity > device.settings.intensityLimit) {
      throw new Error(`Intensity ${command.intensity} exceeds device limits`);
    }

    // Check pattern support
    if (command.pattern && !device.settings.allowedPatterns.includes(command.pattern)) {
      throw new Error(`Pattern ${command.pattern} not supported by device`);
    }

    // Validate pattern-specific parameters
    if (command.pattern && command.pattern !== 'constant') {
      const patternFactory = DefaultPatternFactory.getInstance();
      if (!patternFactory.validatePattern(command.pattern, {
        name: command.pattern,
        minIntensity: 0,
        maxIntensity: device.settings.intensityLimit,
        defaultIntensity: command.intensity
      })) {
        throw new Error('Invalid pattern configuration');
      }
    }
  }

  private updateDeviceStatus(deviceId: string, status: Partial<DeviceStatus>): void {
    const device = this.getDevice(deviceId);
    device.status = { ...device.status, ...status };
    this.devices.set(deviceId, device);

    // Emit device status event
    const event: DeviceEvent = {
      type: DeviceEventType.STATUS_CHANGED,
      deviceId,
      timestamp: new Date(),
      data: device.status
    };
    this.emit('deviceEvent', event);

    // Update monitoring metrics
    if (this.monitoring) {
      this.monitoring.recordMetric('device_status', status.connected ? 1 : 0, { deviceId });
      if (status.batteryLevel !== undefined) {
        this.monitoring.recordMetric('device_battery', status.batteryLevel, { deviceId });
      }
    }
  }

  private handleDeviceEvent(event: DeviceEvent): void {
    switch (event.type) {
      case DeviceEventType.CONNECTED:
      case DeviceEventType.DISCONNECTED:
        this.updateDeviceStatus(event.deviceId, {
          connected: event.type === DeviceEventType.CONNECTED,
          lastSeen: event.timestamp
        });
        break;

      case DeviceEventType.STATUS_CHANGED:
        if (event.data) {
          this.updateDeviceStatus(event.deviceId, event.data);
        }
        break;

      case DeviceEventType.ERROR:
        this.updateDeviceStatus(event.deviceId, {
          error: String(event.data),
          lastSeen: event.timestamp
        });
        break;
    }

    // Forward event to listeners
    this.emit('deviceEvent', event);
  }

  getPattern(patternId: string): ControlPattern | undefined {
    return this.patterns.get(patternId);
  }

  async startPattern(deviceId: string, pattern: ControlPattern): Promise<void> {
    const device = this.getDevice(deviceId);
    const protocol = this.protocols.get(device.info.protocol);

    if (!protocol) {
      throw new Error(`No protocol handler for ${device.info.protocol}`);
    }

    // Store pattern
    this.patterns.set(pattern.name, pattern);

    // Send pattern command to device
    const command: DeviceCommand = {
      type: 'pattern',
      intensity: pattern.getIntensity(Date.now()),
      pattern: pattern.name
    };

    await protocol.sendCommand(command);

    // Update device state
    device.currentPattern = pattern.name;
    device.currentIntensity = command.intensity;
    this.devices.set(deviceId, device);

    this.logger.info(`Pattern ${pattern.name} started on device ${deviceId}`);
  }
}
