import { BLEProtocol } from './BLEProtocol';
import { DeviceInfo, DeviceStatus, DeviceCommand } from '../interfaces/device';

export interface XRControllerInfo extends DeviceInfo {
  // XR-specific device information
  controllerType: 'index' | 'oculus' | 'vive' | 'wmr';
  trackingType: 'inside-out' | 'outside-in';
  degreesOfFreedom: 3 | 6;
  hapticCapabilities: {
    frequency: {
      min: number;
      max: number;
    };
    amplitude: {
      min: number;
      max: number;
    };
    patterns: boolean;
    continuous: boolean;
  };
}

export interface XRControllerStatus extends DeviceStatus {
  hapticState: {
    active: boolean;
    frequency: number;
    amplitude: number;
    pattern?: string;
  };
  batteryLevel: number;
  trackingState: 'tracked' | 'limited' | 'not-tracked';
}

export interface XRControllerCommand extends DeviceCommand {
  type: 'vibrate' | 'pattern' | 'stop';
  frequency?: number;
  amplitude?: number;
  duration?: number;
  pattern?: {
    points: Array<{
      frequency: number;
      amplitude: number;
      duration: number;
    }>;
    repeat?: number;
  };
}

export class XRControllerProtocol extends BLEProtocol {
  // Service UUIDs for different XR controllers
  private static readonly SERVICE_UUIDS = {
    index: '28be4a4c-35c9-4687-9a83-2f7f1c1f1a7d',
    oculus: 'fb1b0000-4747-4836-9c4e-faf5be6e6c04',
    vive: '0000180a-0000-1000-8000-00805f9b34fb',
    wmr: '181c0000-0000-1000-8000-00805f9b34fb'
  };

  // Characteristic UUIDs
  private static readonly HAPTIC_UUID = '00001525-1212-efde-1523-785feabcd123';
  private static readonly BATTERY_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
  private static readonly TRACKING_UUID = '00001526-1212-efde-1523-785feabcd123';

  private info: XRControllerInfo;
  private status: XRControllerStatus;
  private activePattern?: NodeJS.Timeout;

  constructor(deviceId: string, controllerType: 'index' | 'oculus' | 'vive' | 'wmr') {
    super(deviceId);

    this.info = {
      id: deviceId,
      name: `${controllerType.toUpperCase()} Controller`,
      protocol: 'xr',
      manufacturer: this.getManufacturer(controllerType),
      model: controllerType,
      controllerType,
      trackingType: this.getTrackingType(controllerType),
      degreesOfFreedom: this.getDoF(controllerType),
      hapticCapabilities: this.getHapticCapabilities(controllerType),
      capabilities: [
        'vibrate',
        'pattern',
        'continuous',
        'frequency',
        'amplitude'
      ]
    };

    this.status = {
      connected: false,
      lastSeen: new Date(),
      hapticState: {
        active: false,
        frequency: 0,
        amplitude: 0
      },
      batteryLevel: 100,
      trackingState: 'not-tracked'
    };
  }

  async connect(): Promise<void> {
    await super.connect();

    // Subscribe to battery and tracking notifications
    await this.subscribe(XRControllerProtocol.BATTERY_UUID);
    await this.subscribe(XRControllerProtocol.TRACKING_UUID);

    // Get initial status
    await this.updateStatus();
  }

  async disconnect(): Promise<void> {
    this.stopActivePattern();
    await super.disconnect();
  }

  async sendCommand(command: XRControllerCommand): Promise<void> {
    if (!this.status.connected) {
      throw new Error('Device not connected');
    }

    switch (command.type) {
      case 'vibrate':
        await this.vibrate(
          command.frequency || 160,
          command.amplitude || 1.0,
          command.duration || 100
        );
        break;

      case 'pattern':
        if (!command.pattern) {
          throw new Error('Pattern not specified');
        }
        await this.playPattern(command.pattern);
        break;

      case 'stop':
        await this.stop();
        break;

      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }

    this.status.lastSeen = new Date();
  }

  private async vibrate(
    frequency: number,
    amplitude: number,
    duration: number
  ): Promise<void> {
    this.validateHapticParameters(frequency, amplitude);
    
    const buffer = this.encodeHapticCommand(frequency, amplitude);
    await this.writeCharacteristic(XRControllerProtocol.HAPTIC_UUID, buffer);

    this.status.hapticState = {
      active: true,
      frequency,
      amplitude
    };

    // Stop after duration
    setTimeout(() => this.stop(), duration);
  }

  private async playPattern(pattern: XRControllerCommand['pattern']): Promise<void> {
    if (!pattern || !pattern.points.length) {
      throw new Error('Invalid pattern');
    }

    this.stopActivePattern();

    const playPoint = async (index: number) => {
      const point = pattern.points[index];
      await this.vibrate(point.frequency, point.amplitude, point.duration);

      // Schedule next point
      const nextIndex = (index + 1) % pattern.points.length;
      if (nextIndex !== 0 || pattern.repeat !== undefined) {
        this.activePattern = setTimeout(
          () => playPoint(nextIndex),
          point.duration
        );
      }
    };

    await playPoint(0);
  }

  private async stop(): Promise<void> {
    this.stopActivePattern();
    
    const buffer = this.encodeHapticCommand(0, 0);
    await this.writeCharacteristic(XRControllerProtocol.HAPTIC_UUID, buffer);

    this.status.hapticState = {
      active: false,
      frequency: 0,
      amplitude: 0
    };
  }

  private stopActivePattern(): void {
    if (this.activePattern) {
      clearTimeout(this.activePattern);
      this.activePattern = undefined;
    }
  }

  private validateHapticParameters(frequency: number, amplitude: number): void {
    const { hapticCapabilities } = this.info;

    if (frequency < hapticCapabilities.frequency.min ||
        frequency > hapticCapabilities.frequency.max) {
      throw new Error(
        `Frequency must be between ${hapticCapabilities.frequency.min} and ` +
        `${hapticCapabilities.frequency.max}`
      );
    }

    if (amplitude < hapticCapabilities.amplitude.min ||
        amplitude > hapticCapabilities.amplitude.max) {
      throw new Error(
        `Amplitude must be between ${hapticCapabilities.amplitude.min} and ` +
        `${hapticCapabilities.amplitude.max}`
      );
    }
  }

  private encodeHapticCommand(frequency: number, amplitude: number): Buffer {
    // Command format varies by controller type
    const buffer = Buffer.alloc(8);
    
    switch (this.info.controllerType) {
      case 'index':
        // Valve Index format
        buffer.writeUInt16LE(Math.round(frequency), 0);
        buffer.writeFloatLE(amplitude, 2);
        break;

      case 'oculus':
        // Oculus format
        buffer.writeUInt8(Math.round(amplitude * 255), 0);
        buffer.writeUInt16LE(Math.round(frequency), 1);
        break;

      case 'vive':
      case 'wmr':
        // Simple format
        buffer.writeUInt8(Math.round(amplitude * 100), 0);
        break;
    }

    return buffer;
  }

  private async updateStatus(): Promise<void> {
    // Read battery level
    const batteryData = await this.readCharacteristic(XRControllerProtocol.BATTERY_UUID);
    this.status.batteryLevel = batteryData.readUInt8(0);

    // Read tracking state
    const trackingData = await this.readCharacteristic(XRControllerProtocol.TRACKING_UUID);
    this.status.trackingState = this.decodeTrackingState(trackingData);
  }

  private decodeTrackingState(data: Buffer): 'tracked' | 'limited' | 'not-tracked' {
    switch (data.readUInt8(0)) {
      case 0: return 'not-tracked';
      case 1: return 'limited';
      case 2: return 'tracked';
      default: return 'not-tracked';
    }
  }

  getInfo(): XRControllerInfo {
    return { ...this.info };
  }

  getStatus(): XRControllerStatus {
    return { ...this.status };
  }

  private getManufacturer(type: string): string {
    switch (type) {
      case 'index': return 'Valve Corporation';
      case 'oculus': return 'Meta';
      case 'vive': return 'HTC';
      case 'wmr': return 'Microsoft';
      default: return 'Unknown';
    }
  }

  private getTrackingType(type: string): 'inside-out' | 'outside-in' {
    switch (type) {
      case 'index':
      case 'vive':
        return 'outside-in';
      case 'oculus':
      case 'wmr':
        return 'inside-out';
      default:
        return 'inside-out';
    }
  }

  private getDoF(type: string): 3 | 6 {
    switch (type) {
      case 'index':
      case 'oculus':
      case 'vive':
        return 6;
      case 'wmr':
        return 6;
      default:
        return 3;
    }
  }

  private getHapticCapabilities(type: string): XRControllerInfo['hapticCapabilities'] {
    switch (type) {
      case 'index':
        return {
          frequency: { min: 0, max: 1000 },
          amplitude: { min: 0, max: 1.0 },
          patterns: true,
          continuous: true
        };
      case 'oculus':
        return {
          frequency: { min: 0, max: 320 },
          amplitude: { min: 0, max: 1.0 },
          patterns: true,
          continuous: false
        };
      case 'vive':
        return {
          frequency: { min: 0, max: 160 },
          amplitude: { min: 0, max: 1.0 },
          patterns: true,
          continuous: true
        };
      case 'wmr':
        return {
          frequency: { min: 0, max: 100 },
          amplitude: { min: 0, max: 1.0 },
          patterns: false,
          continuous: false
        };
      default:
        return {
          frequency: { min: 0, max: 100 },
          amplitude: { min: 0, max: 1.0 },
          patterns: false,
          continuous: false
        };
    }
  }

  protected handleNotification(uuid: string, data: Buffer): void {
    switch (uuid) {
      case XRControllerProtocol.BATTERY_UUID:
        this.status.batteryLevel = data.readUInt8(0);
        break;

      case XRControllerProtocol.TRACKING_UUID:
        this.status.trackingState = this.decodeTrackingState(data);
        break;
    }

    this.emit('statusChanged', this.status);
  }
}
