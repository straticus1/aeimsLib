import { 
  DeviceProtocol,
  DeviceCommand,
  CommandResult,
  DeviceStatus,
  DeviceEvent,
  DeviceEventType
} from '../src/interfaces/device';
import { DeviceEncryption } from '../src/interfaces/security';
import { BaseProtocolAdapter } from '../src/device/BaseProtocolAdapter';

/**
 * Example custom protocol implementation
 * This is a mock implementation that simulates a device using a custom protocol
 */
export class CustomProtocol extends BaseProtocolAdapter implements DeviceProtocol {
  private deviceId: string;
  private simulatedLatency: number;
  private simulatedErrorRate: number;
  private updateInterval?: NodeJS.Timeout;

  constructor(deviceId: string, config: { latency: number, errorRate: number }) {
    super();
    this.deviceId = deviceId;
    this.simulatedLatency = config.latency;
    this.simulatedErrorRate = config.errorRate;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    // Simulate connection process
    await new Promise(resolve => setTimeout(resolve, this.simulatedLatency));

    // Simulate random connection failure
    if (Math.random() < this.simulatedErrorRate) {
      throw new Error('Connection failed');
    }

    this.connected = true;
    this.lastStatus = {
      connected: true,
      lastSeen: new Date(),
      batteryLevel: 100
    };

    // Emit connection event
    await this.emitEvent({
      type: DeviceEventType.CONNECTED,
      deviceId: this.deviceId,
      timestamp: new Date()
    });

    // Start status updates
    this.updateInterval = setInterval(async () => {
      await this.updateDeviceStatus();
    }, 5000);
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    // Simulate disconnection
    await new Promise(resolve => setTimeout(resolve, this.simulatedLatency));

    this.connected = false;
    this.lastStatus = {
      connected: false,
      lastSeen: new Date(),
      batteryLevel: this.lastStatus.batteryLevel
    };

    // Emit disconnection event
    await this.emitEvent({
      type: DeviceEventType.DISCONNECTED,
      deviceId: this.deviceId,
      timestamp: new Date()
    });
  }

  async sendCommand(command: DeviceCommand): Promise<CommandResult> {
    if (!this.connected) {
      return this.createCommandResult(false, command, 'Device not connected');
    }

    // Simulate command processing
    await new Promise(resolve => setTimeout(resolve, this.simulatedLatency));

    // Simulate random command failure
    if (Math.random() < this.simulatedErrorRate) {
      const error = 'Command failed';
      await this.emitEvent({
        type: DeviceEventType.ERROR,
        deviceId: this.deviceId,
        timestamp: new Date(),
        data: error
      });
      return this.createCommandResult(false, command, error);
    }

    // Update status based on command
    this.lastStatus = {
      ...this.lastStatus,
      lastSeen: new Date()
    };

    // Emit status update
    await this.emitEvent({
      type: DeviceEventType.STATUS_CHANGED,
      deviceId: this.deviceId,
      timestamp: new Date(),
      data: this.lastStatus
    });

    return this.createCommandResult(true, command);
  }

  private async updateDeviceStatus(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // Simulate battery drain
    const currentBattery = this.lastStatus.batteryLevel || 100;
    const newBattery = Math.max(0, currentBattery - 1);

    this.lastStatus = {
      ...this.lastStatus,
      lastSeen: new Date(),
      batteryLevel: newBattery
    };

    // Emit status update
    await this.emitEvent({
      type: DeviceEventType.STATUS_CHANGED,
      deviceId: this.deviceId,
      timestamp: new Date(),
      data: this.lastStatus
    });

    // Simulate disconnect on low battery
    if (newBattery < 10 && Math.random() < 0.2) {
      await this.disconnect();
    }
  }
}
