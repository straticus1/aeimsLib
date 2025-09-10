import { EventEmitter } from 'events';
import { Device, DeviceCommand, DeviceStatus } from '../interfaces/device';
import { Logger } from '../utils/Logger';
import { DeviceManager } from '../core/DeviceManager';
import { CommandProcessor } from './CommandProcessor';

export interface DeviceState {
  status: DeviceStatus;
  lastCommand?: DeviceCommand;
  lastCommandTime?: number;
  recoveryAttempts: number;
  lastRecoveryTime?: number;
  customState?: Record<string, any>;
}

export interface StateRecoveryConfig {
  maxAttempts: number;
  retryDelay: number;
  maxRetryDelay: number;
  recoveryTimeout: number;
  validateState: boolean;
}

export enum DeviceStateEvent {
  STATE_CHANGED = 'stateChanged',
  RECOVERY_STARTED = 'recoveryStarted',
  RECOVERY_COMPLETED = 'recoveryCompleted',
  RECOVERY_FAILED = 'recoveryFailed'
}

export class DeviceStateManager extends EventEmitter {
  private static instance: DeviceStateManager;
  private readonly deviceStates: Map<string, DeviceState>;
  private readonly recoveryTimeouts: Map<string, NodeJS.Timeout>;
  private readonly commandProcessor: CommandProcessor;
  private readonly logger: Logger;
  private readonly config: StateRecoveryConfig;

  private constructor(config: Partial<StateRecoveryConfig> = {}) {
    super();
    this.deviceStates = new Map();
    this.recoveryTimeouts = new Map();
    this.commandProcessor = CommandProcessor.getInstance();
    this.logger = Logger.getInstance();

    this.config = {
      maxAttempts: 3,
      retryDelay: 1000,
      maxRetryDelay: 10000,
      recoveryTimeout: 30000,
      validateState: true,
      ...config
    };
  }

  static getInstance(config?: Partial<StateRecoveryConfig>): DeviceStateManager {
    if (!DeviceStateManager.instance) {
      DeviceStateManager.instance = new DeviceStateManager(config);
    }
    return DeviceStateManager.instance;
  }

  registerDevice(device: Device): void {
    const state: DeviceState = {
      status: {
        connected: false,
        lastSeen: new Date()
      },
      recoveryAttempts: 0,
      customState: {}
    };

    this.deviceStates.set(device.info.id, state);
    this.commandProcessor.registerDevice(device);

    // Set up state monitoring
    this.monitorDeviceState(device);
  }

  unregisterDevice(deviceId: string): void {
    this.deviceStates.delete(deviceId);
    this.commandProcessor.unregisterDevice(deviceId);

    const timeout = this.recoveryTimeouts.get(deviceId);
    if (timeout) {
      clearTimeout(timeout);
      this.recoveryTimeouts.delete(deviceId);
    }
  }

  async updateDeviceState(
    deviceId: string,
    status: Partial<DeviceStatus>,
    customState?: Record<string, any>
  ): Promise<void> {
    const state = this.getDeviceState(deviceId);
    if (!state) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const previousState = { ...state };
    state.status = { ...state.status, ...status };

    if (customState) {
      state.customState = {
        ...state.customState,
        ...customState
      };
    }

    state.status.lastSeen = new Date();
    this.deviceStates.set(deviceId, state);

    // Check if recovery is needed
    if (this.shouldAttemptRecovery(previousState, state)) {
      await this.initiateStateRecovery(deviceId);
    }

    this.emit(DeviceStateEvent.STATE_CHANGED, { deviceId, state });
  }

  getDeviceState(deviceId: string): DeviceState | undefined {
    return this.deviceStates.get(deviceId);
  }

  async saveCommand(deviceId: string, command: DeviceCommand): Promise<void> {
    const state = this.getDeviceState(deviceId);
    if (!state) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    state.lastCommand = command;
    state.lastCommandTime = Date.now();
    this.deviceStates.set(deviceId, state);
  }

  private monitorDeviceState(device: Device): void {
    // Set up periodic state checks
    const checkInterval = setInterval(() => {
      const state = this.getDeviceState(device.info.id);
      if (!state) {
        clearInterval(checkInterval);
        return;
      }

      const now = Date.now();
      const lastSeen = state.status.lastSeen?.getTime() || 0;

      // Check for stale state
      if (now - lastSeen > 5000) { // 5 seconds threshold
        this.updateDeviceState(device.info.id, {
          connected: false,
          error: 'Device communication timeout'
        });
      }
    }, 1000);

    // Clean up interval when device is unregistered
    this.once(`unregister:${device.info.id}`, () => {
      clearInterval(checkInterval);
    });
  }

  private shouldAttemptRecovery(previous: DeviceState, current: DeviceState): boolean {
    // Recovery conditions:
    // 1. Device was connected and is now disconnected
    // 2. Device has encountered an error
    // 3. Device state validation fails (if enabled)
    
    if (previous.status.connected && !current.status.connected) {
      return true;
    }

    if (current.status.error && !previous.status.error) {
      return true;
    }

    if (this.config.validateState && current.customState) {
      try {
        this.validateDeviceState(current);
      } catch {
        return true;
      }
    }

    return false;
  }

  private async initiateStateRecovery(deviceId: string): Promise<void> {
    const state = this.getDeviceState(deviceId);
    if (!state) return;

    // Clear any existing recovery timeout
    const existingTimeout = this.recoveryTimeouts.get(deviceId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Check recovery attempts
    if (state.recoveryAttempts >= this.config.maxAttempts) {
      this.emit(DeviceStateEvent.RECOVERY_FAILED, {
        deviceId,
        reason: 'Maximum recovery attempts exceeded'
      });
      return;
    }

    state.recoveryAttempts++;
    state.lastRecoveryTime = Date.now();
    this.deviceStates.set(deviceId, state);

    this.emit(DeviceStateEvent.RECOVERY_STARTED, { deviceId, attempt: state.recoveryAttempts });

    try {
      // Attempt recovery
      await this.performStateRecovery(deviceId);

      // Reset recovery attempts on success
      state.recoveryAttempts = 0;
      this.deviceStates.set(deviceId, state);

      this.emit(DeviceStateEvent.RECOVERY_COMPLETED, { deviceId });

    } catch (error) {
      this.logger.error('State recovery failed', { deviceId, error });

      // Schedule next recovery attempt
      const delay = Math.min(
        this.config.retryDelay * Math.pow(2, state.recoveryAttempts),
        this.config.maxRetryDelay
      );

      const timeout = setTimeout(() => {
        this.initiateStateRecovery(deviceId);
      }, delay);

      this.recoveryTimeouts.set(deviceId, timeout);
    }
  }

  private async performStateRecovery(deviceId: string): Promise<void> {
    const state = this.getDeviceState(deviceId);
    if (!state) return;

    // Set recovery timeout
    const recoveryTimeout = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Recovery timeout'));
      }, this.config.recoveryTimeout);
    });

    try {
      // Perform recovery steps
      await Promise.race([
        this.executeRecoverySteps(deviceId, state),
        recoveryTimeout
      ]);

    } catch (error) {
      this.logger.error('Recovery steps failed', { deviceId, error });
      throw error;
    }
  }

  private async executeRecoverySteps(deviceId: string, state: DeviceState): Promise<void> {
    // 1. Clear command queue
    this.commandProcessor.clearQueue(deviceId);

    // 2. Reset device connection
    const device = await this.getDevice(deviceId);
    await device.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await device.connect();

    // 3. Validate device state
    if (this.config.validateState) {
      this.validateDeviceState(state);
    }

    // 4. Restore last known state if available
    if (state.lastCommand) {
      await this.commandProcessor.sendCommand(deviceId, state.lastCommand);
    }

    // 5. Update device state
    await this.updateDeviceState(deviceId, {
      connected: true,
      error: undefined
    });
  }

  private validateDeviceState(state: DeviceState): void {
    // Implement state validation logic based on device type/protocol
    // This is a basic example - extend based on your needs
    if (!state.status) {
      throw new Error('Invalid state: missing status');
    }

    if (state.status.connected && !state.status.lastSeen) {
      throw new Error('Invalid state: connected device without lastSeen timestamp');
    }

    if (state.customState) {
      // Validate custom state properties
      this.validateCustomState(state.customState);
    }
  }

  private validateCustomState(customState: Record<string, any>): void {
    // Implement custom state validation
    // This should be extended based on your specific requirements
    for (const [key, value] of Object.entries(customState)) {
      if (value === undefined || value === null) {
        throw new Error(`Invalid custom state: ${key} is undefined or null`);
      }
    }
  }

  private async getDevice(deviceId: string): Promise<Device> {
    try {
      // Get device from device manager
      const deviceManager = DeviceManager.getInstance();
      return deviceManager.getDevice(deviceId);
    } catch (error) {
      throw new Error(`Failed to get device ${deviceId}: ${error.message}`);
    }
  }

  getConfig(): StateRecoveryConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<StateRecoveryConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
}
