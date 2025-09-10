import { Device } from '../../interfaces/device';
import { DeviceMonitoring } from '../../monitoring';
import { Logger } from '../../utils/Logger';

/**
 * Custom error types for experimental devices
 */
export class DeviceConnectionError extends Error {
  constructor(
    message: string,
    public deviceId: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'DeviceConnectionError';
  }
}

export class DeviceCommandError extends Error {
  constructor(
    message: string,
    public deviceId: string,
    public commandType: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'DeviceCommandError';
  }
}

export class DeviceTimeoutError extends Error {
  constructor(
    message: string,
    public deviceId: string,
    public operation: string,
    public timeoutMs: number
  ) {
    super(message);
    this.name = 'DeviceTimeoutError';
  }
}

export class DeviceProtocolError extends Error {
  constructor(
    message: string,
    public deviceId: string,
    public protocolError: any
  ) {
    super(message);
    this.name = 'DeviceProtocolError';
  }
}

export class DeviceSafetyError extends Error {
  constructor(
    message: string,
    public deviceId: string,
    public safetyCheck: string
  ) {
    super(message);
    this.name = 'DeviceSafetyError';
  }
}

/**
 * Error recovery strategies
 */
export interface RecoveryStrategy {
  maxAttempts: number;
  backoffMs: number;
  timeout: number;
  onAttempt?: (attempt: number, error: Error) => void;
}

const DEFAULT_RECOVERY: RecoveryStrategy = {
  maxAttempts: 3,
  backoffMs: 1000,
  timeout: 5000
};

/**
 * Enhanced error handling and recovery for experimental devices
 */
export class DeviceErrorHandler {
  private logger: Logger;
  private monitor: DeviceMonitoring;
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private activeRecoveries: Map<string, Promise<void>> = new Map();

  constructor(
    private device: Device,
    private options: {
      autoReconnect?: boolean;
      maxReconnectAttempts?: number;
      safetyChecks?: boolean;
    } = {}
  ) {
    this.logger = Logger.getInstance();
    this.monitor = new DeviceMonitoring(device.info.id);

    // Set up default recovery strategies
    this.recoveryStrategies.set('connection', {
      maxAttempts: options.maxReconnectAttempts || 3,
      backoffMs: 2000,
      timeout: 10000,
      onAttempt: (attempt, error) => {
        this.logger.warn('Attempting device reconnection', {
          deviceId: device.info.id,
          attempt,
          error
        });
      }
    });

    this.recoveryStrategies.set('command', {
      maxAttempts: 2,
      backoffMs: 500,
      timeout: 3000
    });
  }

  /**
   * Handle device connection with error recovery
   */
  async connect(): Promise<void> {
    const strategy = this.recoveryStrategies.get('connection') || DEFAULT_RECOVERY;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, strategy.backoffMs));
          strategy.onAttempt?.(attempt, lastError!);
        }

        const connectPromise = this.device.connect();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new DeviceTimeoutError(
              'Connection attempt timed out',
              this.device.info.id,
              'connect',
              strategy.timeout
            ));
          }, strategy.timeout);
        });

        await Promise.race([connectPromise, timeoutPromise]);
        return;
      } catch (error) {
        lastError = error as Error;
        this.monitor.onError(error as Error, { operation: 'connect', attempt });
      }
    }

    const finalError = new DeviceConnectionError(
      `Failed to connect after ${strategy.maxAttempts} attempts`,
      this.device.info.id,
      lastError
    );

    this.monitor.onError(finalError, {
      operation: 'connect',
      attempts: strategy.maxAttempts
    });
    throw finalError;
  }

  /**
   * Handle command execution with error recovery
   */
  async executeCommand(command: any): Promise<void> {
    const strategy = this.recoveryStrategies.get('command') || DEFAULT_RECOVERY;
    let lastError: Error | undefined;

    // Safety checks if enabled
    if (this.options.safetyChecks) {
      this.performSafetyChecks(command);
    }

    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, strategy.backoffMs));
        }

        const commandPromise = this.device.sendCommand(command);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new DeviceTimeoutError(
              'Command execution timed out',
              this.device.info.id,
              command.type,
              strategy.timeout
            ));
          }, strategy.timeout);
        });

        await Promise.race([commandPromise, timeoutPromise]);
        return;
      } catch (error) {
        lastError = error as Error;
        this.monitor.onError(error as Error, {
          operation: 'command',
          command: command.type,
          attempt
        });

        // Special handling for connection errors
        if (error instanceof DeviceConnectionError && this.options.autoReconnect) {
          await this.handleConnectionError();
        }
      }
    }

    const finalError = new DeviceCommandError(
      `Command failed after ${strategy.maxAttempts} attempts`,
      this.device.info.id,
      command.type,
      lastError
    );

    this.monitor.onError(finalError, {
      operation: 'command',
      command: command.type,
      attempts: strategy.maxAttempts
    });
    throw finalError;
  }

  /**
   * Handle unexpected disconnections with automatic recovery
   */
  async handleDisconnect(error?: Error): Promise<void> {
    if (!this.options.autoReconnect) {
      this.monitor.onDisconnect();
      return;
    }

    // Prevent multiple simultaneous recovery attempts
    let recovery = this.activeRecoveries.get('connection');
    if (recovery) {
      return recovery;
    }

    recovery = (async () => {
      this.monitor.onDisconnect();
      this.logger.warn('Device disconnected unexpectedly', {
        deviceId: this.device.info.id,
        error
      });

      try {
        await this.connect();
      } finally {
        this.activeRecoveries.delete('connection');
      }
    })();

    this.activeRecoveries.set('connection', recovery);
    return recovery;
  }

  /**
   * Handle connection errors during command execution
   */
  private async handleConnectionError(): Promise<void> {
    if (!this.device.isConnected() && this.options.autoReconnect) {
      await this.connect();
    }
  }

  /**
   * Perform safety checks before executing commands
   */
  private performSafetyChecks(command: any): void {
    // Check intensity limits
    if (
      command.params?.intensity !== undefined &&
      command.params.intensity > 0.8 // 80% maximum for safety
    ) {
      throw new DeviceSafetyError(
        'Command intensity exceeds safety limit',
        this.device.info.id,
        'intensity_limit'
      );
    }

    // Check rate limiting
    const now = Date.now();
    const recentCommands = this.monitor.getDeviceStats()?.totalCommandsSent || 0;
    if (recentCommands > 100) { // Max 100 commands per minute
      throw new DeviceSafetyError(
        'Command rate limit exceeded',
        this.device.info.id,
        'rate_limit'
      );
    }

    // Device-specific safety checks
    switch (command.type) {
      case 'shock':
        if (command.params?.duration > 2000) { // Max 2 seconds
          throw new DeviceSafetyError(
            'Shock duration exceeds safety limit',
            this.device.info.id,
            'shock_duration'
          );
        }
        break;

      case 'rotate':
        if (command.params?.speed > 0.9) { // Max 90% speed
          throw new DeviceSafetyError(
            'Rotation speed exceeds safety limit',
            this.device.info.id,
            'rotation_speed'
          );
        }
        break;
    }
  }

  /**
   * Update recovery strategy for specific operations
   */
  setRecoveryStrategy(
    operation: 'connection' | 'command',
    strategy: Partial<RecoveryStrategy>
  ): void {
    const current = this.recoveryStrategies.get(operation) || DEFAULT_RECOVERY;
    this.recoveryStrategies.set(operation, {
      ...current,
      ...strategy
    });
  }

  /**
   * Enable or disable auto-reconnect
   */
  setAutoReconnect(enabled: boolean): void {
    this.options.autoReconnect = enabled;
  }

  /**
   * Enable or disable safety checks
   */
  setSafetyChecks(enabled: boolean): void {
    this.options.safetyChecks = enabled;
  }
}

/**
 * Error handler factory for experimental devices
 */
export function createErrorHandler(
  device: Device,
  options?: {
    autoReconnect?: boolean;
    maxReconnectAttempts?: number;
    safetyChecks?: boolean;
  }
): DeviceErrorHandler {
  return new DeviceErrorHandler(device, options);
}
