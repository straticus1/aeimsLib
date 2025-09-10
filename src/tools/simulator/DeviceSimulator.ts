import { Device, DeviceInfo, DeviceCommand } from '../../interfaces/device';
import { EventEmitter } from 'events';
import { DeviceMonitoring } from '../../monitoring';

/**
 * Device Simulator Configuration
 */
export interface SimulatorConfig {
  // Connection behavior
  connectionDelay?: number;
  randomDisconnects?: boolean;
  disconnectProbability?: number;

  // Command handling
  commandDelay?: number;
  commandFailureRate?: number;
  errorTypes?: string[];

  // Device characteristics
  batteryLevel?: number;
  batteryDrainRate?: number;
  supportedCommands?: string[];
  featureFlags?: Record<string, boolean>;

  // Network simulation
  latencyRange?: [number, number];
  packetLossRate?: number;
  jitterRange?: [number, number];
}

/**
 * Device State
 */
export interface DeviceState {
  connected: boolean;
  batteryLevel: number;
  lastCommand?: DeviceCommand;
  commandHistory: DeviceCommand[];
  errors: Error[];
  metrics: {
    commandsReceived: number;
    commandsSucceeded: number;
    commandsFailed: number;
    totalLatency: number;
    disconnections: number;
  };
}

/**
 * Simulated Device Implementation
 */
export class DeviceSimulator extends EventEmitter implements Device {
  private state: DeviceState;
  private config: Required<SimulatorConfig>;
  private monitor: DeviceMonitoring;
  private updateInterval: NodeJS.Timer | null = null;
  private networkConditions: {
    currentLatency: number;
    currentJitter: number;
    packetLossCounter: number;
  };

  constructor(
    public readonly info: DeviceInfo,
    config: SimulatorConfig = {}
  ) {
    super();
    this.monitor = new DeviceMonitoring(info.id);

    // Set default config
    this.config = {
      connectionDelay: config.connectionDelay || 500,
      randomDisconnects: config.randomDisconnects || false,
      disconnectProbability: config.disconnectProbability || 0.01,
      commandDelay: config.commandDelay || 100,
      commandFailureRate: config.commandFailureRate || 0.05,
      errorTypes: config.errorTypes || ['timeout', 'invalid_command', 'device_busy'],
      batteryLevel: config.batteryLevel || 100,
      batteryDrainRate: config.batteryDrainRate || 0.001,
      supportedCommands: config.supportedCommands || ['vibrate', 'rotate', 'stop'],
      featureFlags: config.featureFlags || {},
      latencyRange: config.latencyRange || [20, 200],
      packetLossRate: config.packetLossRate || 0.01,
      jitterRange: config.jitterRange || [0, 50]
    };

    // Initialize state
    this.state = {
      connected: false,
      batteryLevel: this.config.batteryLevel,
      commandHistory: [],
      errors: [],
      metrics: {
        commandsReceived: 0,
        commandsSucceeded: 0,
        commandsFailed: 0,
        totalLatency: 0,
        disconnections: 0
      }
    };

    // Initialize network simulation
    this.networkConditions = {
      currentLatency: this.getRandomInRange(this.config.latencyRange),
      currentJitter: this.getRandomInRange(this.config.jitterRange),
      packetLossCounter: 0
    };
  }

  /**
   * Connect to the simulated device
   */
  async connect(): Promise<void> {
    if (this.state.connected) {
      return;
    }

    await this.simulateNetworkDelay();

    if (this.shouldSimulatePacketLoss()) {
      throw new Error('Connection failed due to packet loss');
    }

    this.state.connected = true;
    this.startStateUpdates();
    this.monitor.onConnect();
    this.emit('connected');
  }

  /**
   * Disconnect from the simulated device
   */
  async disconnect(): Promise<void> {
    if (!this.state.connected) {
      return;
    }

    await this.simulateNetworkDelay();
    this.state.connected = false;
    this.stopStateUpdates();
    this.monitor.onDisconnect();
    this.emit('disconnected');
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Send command to the simulated device
   */
  async sendCommand(command: DeviceCommand): Promise<void> {
    if (!this.state.connected) {
      throw new Error('Device not connected');
    }

    this.state.metrics.commandsReceived++;
    this.state.commandHistory.push(command);
    this.state.lastCommand = command;

    // Validate command
    if (!this.config.supportedCommands.includes(command.type)) {
      this.handleCommandError(new Error(`Unsupported command: ${command.type}`));
      return;
    }

    try {
      const startTime = Date.now();
      this.monitor.onCommandStart(command.type);

      // Simulate command execution
      await this.simulateCommandExecution(command);

      const duration = Date.now() - startTime;
      this.state.metrics.commandsSucceeded++;
      this.state.metrics.totalLatency += duration;
      this.monitor.onCommandComplete(command.type, duration, true);

      // Emit state update
      this.emit('stateChanged', this.getDeviceState());

    } catch (error) {
      this.handleCommandError(error as Error);
    }
  }

  /**
   * Get current device state
   */
  getDeviceState(): DeviceState {
    return { ...this.state };
  }

  /**
   * Update simulator configuration
   */
  updateConfig(config: Partial<SimulatorConfig>): void {
    Object.assign(this.config, config);
    this.emit('configChanged', this.config);
  }

  /**
   * Reset simulator state
   */
  reset(): void {
    this.state = {
      connected: false,
      batteryLevel: this.config.batteryLevel,
      commandHistory: [],
      errors: [],
      metrics: {
        commandsReceived: 0,
        commandsSucceeded: 0,
        commandsFailed: 0,
        totalLatency: 0,
        disconnections: 0
      }
    };
    this.stopStateUpdates();
    this.emit('reset');
  }

  private startStateUpdates(): void {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(() => {
      // Update battery level
      this.state.batteryLevel = Math.max(
        0,
        this.state.batteryLevel - this.config.batteryDrainRate
      );

      // Simulate random disconnects
      if (this.config.randomDisconnects &&
          Math.random() < this.config.disconnectProbability) {
        this.disconnect();
        this.state.metrics.disconnections++;
      }

      // Update network conditions
      this.networkConditions.currentLatency = this.getRandomInRange(
        this.config.latencyRange
      );
      this.networkConditions.currentJitter = this.getRandomInRange(
        this.config.jitterRange
      );

      this.emit('stateChanged', this.getDeviceState());
    }, 1000);
  }

  private stopStateUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private async simulateCommandExecution(command: DeviceCommand): Promise<void> {
    await this.simulateNetworkDelay();

    if (this.shouldSimulatePacketLoss()) {
      throw new Error('Command failed due to packet loss');
    }

    // Simulate command failure
    if (Math.random() < this.config.commandFailureRate) {
      const errorType = this.getRandomError();
      throw new Error(errorType);
    }

    // Simulate command delay
    await new Promise(resolve => 
      setTimeout(resolve, this.config.commandDelay)
    );
  }

  private async simulateNetworkDelay(): Promise<void> {
    const delay = this.networkConditions.currentLatency +
      (Math.random() * this.networkConditions.currentJitter);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private shouldSimulatePacketLoss(): boolean {
    this.networkConditions.packetLossCounter++;
    if (this.networkConditions.packetLossCounter >= 100) {
      this.networkConditions.packetLossCounter = 0;
    }
    return Math.random() < this.config.packetLossRate;
  }

  private handleCommandError(error: Error): void {
    this.state.errors.push(error);
    this.state.metrics.commandsFailed++;
    this.monitor.onError(error, {
      command: this.state.lastCommand,
      batteryLevel: this.state.batteryLevel
    });
    throw error;
  }

  private getRandomError(): string {
    const index = Math.floor(Math.random() * this.config.errorTypes.length);
    return this.config.errorTypes[index];
  }

  private getRandomInRange([min, max]: [number, number]): number {
    return min + Math.random() * (max - min);
  }
}

/**
 * Create a simulated device
 */
export function createSimulatedDevice(
  info: DeviceInfo,
  config?: SimulatorConfig
): Device {
  return new DeviceSimulator(info, config);
}
