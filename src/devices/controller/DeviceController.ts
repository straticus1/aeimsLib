import { EventEmitter } from 'events';
import { DeviceRegistry, DeviceInfo } from '../registry/DeviceRegistry';
import { DeviceConfiguration } from '../config/DeviceConfigManager';
import { Logger } from '../../core/logging/Logger';
import { MetricsCollector } from '../../core/metrics/MetricsCollector';
import { ErrorHandler } from '../../core/errors/ErrorHandler';
import { RetryStrategy } from '../../core/errors/RetryStrategy';
import { DeviceDataFormatter } from '../protocol/DeviceDataFormatter';

interface CommandOptions {
  // Command metadata
  id?: string;
  type?: string;
  priority?: number;
  timeout?: number;

  // Error handling
  retryStrategy?: RetryStrategy;
  errorHandler?: ErrorHandler;

  // Data formatting
  inputFormat?: string;
  outputFormat?: string;
  validateResponse?: boolean;

  // Command queuing
  queueIfOffline?: boolean;
  maxQueueSize?: number;

  // Performance
  batch?: boolean;
  batchSize?: number;
  batchTimeout?: number;
}

interface CommandResult {
  id: string;
  command: any;
  response?: any;
  error?: Error;
  duration: number;
  attempts: number;
  timestamp: number;
}

interface CommandContext {
  id: string;
  device: DeviceInfo;
  command: any;
  options: Required<CommandOptions>;
  retries: number;
  startTime: number;
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
}

interface DeviceControllerOptions {
  // Command handling
  defaultTimeout?: number;
  maxConcurrentCommands?: number;
  commandQueueSize?: number;
  
  // Error handling
  defaultRetryStrategy?: RetryStrategy;
  defaultErrorHandler?: ErrorHandler;
  
  // Data formatting
  dataFormatter?: DeviceDataFormatter;
  validateResponses?: boolean;

  // Performance
  enableBatching?: boolean;
  batchSize?: number;
  batchTimeout?: number;
}

/**
 * Device Controller
 * Provides high-level device interaction with error handling,
 * command queuing, and data formatting
 */
export class DeviceController extends EventEmitter {
  private options: Required<DeviceControllerOptions>;
  private commandQueue = new Map<string, CommandContext[]>();
  private activeCommands = new Map<string, Set<CommandContext>>();
  private dataFormatter: DeviceDataFormatter;

  constructor(
    private registry: DeviceRegistry,
    private metrics: MetricsCollector,
    private logger: Logger,
    options: DeviceControllerOptions = {}
  ) {
    super();
    this.options = this.initializeOptions(options);
    this.dataFormatter = options.dataFormatter || new DeviceDataFormatter();
    this.setupEventHandlers();
  }

  /**
   * Send command to device
   */
  async sendCommand(
    deviceId: string,
    command: any,
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const device = this.registry.getDevice(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // Apply options with defaults
    const commandOptions = this.applyCommandOptions(options);
    
    // Create command context
    const context: CommandContext = {
      id: commandOptions.id || this.generateCommandId(),
      device,
      command,
      options: commandOptions,
      retries: 0,
      startTime: Date.now(),
      resolve: () => {},
      reject: () => {}
    };

    // Create command promise
    const promise = new Promise<CommandResult>((resolve, reject) => {
      context.resolve = resolve;
      context.reject = reject;
    });

    // Handle offline device
    if (device.status !== 'online') {
      if (commandOptions.queueIfOffline) {
        this.queueCommand(context);
      } else {
        throw new Error(`Device ${deviceId} is offline`);
      }
    } else {
      // Execute or queue command
      if (this.canExecuteCommand(device)) {
        await this.executeCommand(context);
      } else {
        this.queueCommand(context);
      }
    }

    return promise;
  }

  /**
   * Send batch of commands to device
   */
  async sendBatch(
    deviceId: string,
    commands: any[],
    options: CommandOptions = {}
  ): Promise<CommandResult[]> {
    if (!this.options.enableBatching) {
      throw new Error('Batching is disabled');
    }

    const device = this.registry.getDevice(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // Split into batches
    const batchSize = options.batchSize || this.options.batchSize;
    const batches: any[][] = [];
    
    for (let i = 0; i < commands.length; i += batchSize) {
      batches.push(commands.slice(i, i + batchSize));
    }

    // Process batches
    const results: CommandResult[] = [];
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(cmd => this.sendCommand(deviceId, cmd, options))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Cancel pending commands
   */
  cancelCommands(deviceId: string): void {
    const error = new Error('Command cancelled');

    // Cancel queued commands
    const queue = this.commandQueue.get(deviceId);
    if (queue) {
      queue.forEach(cmd => cmd.reject(error));
      this.commandQueue.delete(deviceId);
    }

    // Cancel active commands
    const active = this.activeCommands.get(deviceId);
    if (active) {
      active.forEach(cmd => cmd.reject(error));
      this.activeCommands.delete(deviceId);
    }
  }

  /**
   * Initialize options
   */
  private initializeOptions(options: DeviceControllerOptions): Required<DeviceControllerOptions> {
    return {
      defaultTimeout: options.defaultTimeout || 5000,
      maxConcurrentCommands: options.maxConcurrentCommands || 10,
      commandQueueSize: options.commandQueueSize || 100,
      defaultRetryStrategy: options.defaultRetryStrategy || {
        maxAttempts: 3,
        backoff: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000
      },
      defaultErrorHandler: options.defaultErrorHandler || {
        handleError: (error: Error) => { throw error; }
      },
      dataFormatter: options.dataFormatter,
      validateResponses: options.validateResponses !== false,
      enableBatching: options.enableBatching !== false,
      batchSize: options.batchSize || 10,
      batchTimeout: options.batchTimeout || 100
    };
  }

  /**
   * Apply command options with defaults
   */
  private applyCommandOptions(options: CommandOptions): Required<CommandOptions> {
    return {
      id: options.id,
      type: options.type || 'command',
      priority: options.priority || 0,
      timeout: options.timeout || this.options.defaultTimeout,
      retryStrategy: options.retryStrategy || this.options.defaultRetryStrategy,
      errorHandler: options.errorHandler || this.options.defaultErrorHandler,
      inputFormat: options.inputFormat,
      outputFormat: options.outputFormat,
      validateResponse: options.validateResponse ?? this.options.validateResponses,
      queueIfOffline: options.queueIfOffline !== false,
      maxQueueSize: options.maxQueueSize || this.options.commandQueueSize,
      batch: options.batch !== false && this.options.enableBatching,
      batchSize: options.batchSize || this.options.batchSize,
      batchTimeout: options.batchTimeout || this.options.batchTimeout
    };
  }

  /**
   * Check if command can be executed
   */
  private canExecuteCommand(device: DeviceInfo): boolean {
    const active = this.activeCommands.get(device.id);
    return !active || active.size < this.options.maxConcurrentCommands;
  }

  /**
   * Queue command for later execution
   */
  private queueCommand(context: CommandContext): void {
    const { device, options } = context;

    // Get or create queue
    let queue = this.commandQueue.get(device.id);
    if (!queue) {
      queue = [];
      this.commandQueue.set(device.id, queue);
    }

    // Check queue size
    if (queue.length >= options.maxQueueSize) {
      throw new Error(
        `Command queue full for device ${device.id}`
      );
    }

    // Add to queue
    queue.push(context);
    this.sortQueue(queue);

    // Emit event
    this.emit('commandQueued', {
      deviceId: device.id,
      commandId: context.id
    });
  }

  /**
   * Sort command queue by priority
   */
  private sortQueue(queue: CommandContext[]): void {
    queue.sort((a, b) => {
      // Sort by priority (higher first)
      const priority = b.options.priority - a.options.priority;
      if (priority !== 0) return priority;

      // Then by age (older first)
      return a.startTime - b.startTime;
    });
  }

  /**
   * Execute command
   */
  private async executeCommand(context: CommandContext): Promise<void> {
    const { device, command, options } = context;
    let result: CommandResult;

    try {
      // Track active command
      this.trackActiveCommand(context);

      // Format command input
      const formattedCommand = options.inputFormat ?
        await this.dataFormatter.format(command, options.inputFormat) :
        command;

      // Execute with retry
      const startTime = Date.now();
      const response = await this.executeWithRetry(
        device.id,
        formattedCommand,
        context
      );

      // Format response
      const formattedResponse = options.outputFormat ?
        await this.dataFormatter.format(response, options.outputFormat) :
        response;

      // Validate response if needed
      if (options.validateResponse) {
        await this.validateResponse(formattedResponse, context);
      }

      // Create result
      result = {
        id: context.id,
        command: formattedCommand,
        response: formattedResponse,
        duration: Date.now() - startTime,
        attempts: context.retries + 1,
        timestamp: Date.now()
      };

      // Track metrics
      await this.trackMetrics(result, context);

      // Complete command
      this.completeCommand(context, result);

    } catch (error) {
      // Handle error
      await this.handleCommandError(error, context);

      result = {
        id: context.id,
        command,
        error,
        duration: Date.now() - context.startTime,
        attempts: context.retries + 1,
        timestamp: Date.now()
      };
    }

    // Process next command in queue
    this.processQueue(device.id);
  }

  /**
   * Execute command with retry
   */
  private async executeWithRetry(
    deviceId: string,
    command: any,
    context: CommandContext
  ): Promise<any> {
    const { options } = context;

    while (true) {
      try {
        return await this.registry.sendCommand(deviceId, command);
      } catch (error) {
        context.retries++;

        const shouldRetry = await this.shouldRetry(error, context);
        if (!shouldRetry) {
          throw error;
        }

        const delay = this.calculateRetryDelay(context);
        await new Promise(resolve =>
          setTimeout(resolve, delay)
        );
      }
    }
  }

  /**
   * Check if command should be retried
   */
  private async shouldRetry(
    error: Error,
    context: CommandContext
  ): Promise<boolean> {
    const { retryStrategy } = context.options;
    
    if (context.retries >= retryStrategy.maxAttempts) {
      return false;
    }

    // Check if error is retryable
    if (typeof retryStrategy.isRetryable === 'function') {
      return retryStrategy.isRetryable(error);
    }

    return true;
  }

  /**
   * Calculate retry delay
   */
  private calculateRetryDelay(context: CommandContext): number {
    const { retryStrategy } = context.options;
    const { initialDelay, maxDelay, backoff } = retryStrategy;

    let delay: number;
    switch (backoff) {
      case 'exponential':
        delay = initialDelay * Math.pow(2, context.retries - 1);
        break;
      case 'linear':
        delay = initialDelay * context.retries;
        break;
      default:
        delay = initialDelay;
    }

    return Math.min(delay, maxDelay);
  }

  /**
   * Validate command response
   */
  private async validateResponse(
    response: any,
    context: CommandContext
  ): Promise<void> {
    // TODO: Implement response validation
  }

  /**
   * Track command metrics
   */
  private async trackMetrics(
    result: CommandResult,
    context: CommandContext
  ): Promise<void> {
    await this.metrics.track({
      type: 'device_command',
      timestamp: Date.now(),
      data: {
        deviceId: context.device.id,
        commandId: result.id,
        commandType: context.options.type,
        duration: result.duration,
        attempts: result.attempts,
        success: !result.error
      }
    });
  }

  /**
   * Track active command
   */
  private trackActiveCommand(context: CommandContext): void {
    const { device } = context;
    
    let active = this.activeCommands.get(device.id);
    if (!active) {
      active = new Set();
      this.activeCommands.set(device.id, active);
    }
    
    active.add(context);
  }

  /**
   * Complete command execution
   */
  private completeCommand(
    context: CommandContext,
    result: CommandResult
  ): void {
    // Remove from active commands
    const active = this.activeCommands.get(context.device.id);
    if (active) {
      active.delete(context);
      if (active.size === 0) {
        this.activeCommands.delete(context.device.id);
      }
    }

    // Resolve promise
    context.resolve(result);

    // Emit event
    this.emit('commandCompleted', result);
  }

  /**
   * Handle command error
   */
  private async handleCommandError(
    error: Error,
    context: CommandContext
  ): Promise<void> {
    const { device, options } = context;

    try {
      // Handle error with custom handler
      await options.errorHandler.handleError(error, {
        deviceId: device.id,
        commandId: context.id,
        attempts: context.retries
      });
    } catch (handlerError) {
      // Log error
      this.logger.error(
        `Command error for device ${device.id}:`,
        handlerError
      );

      // Remove from active commands
      const active = this.activeCommands.get(device.id);
      if (active) {
        active.delete(context);
        if (active.size === 0) {
          this.activeCommands.delete(device.id);
        }
      }

      // Reject promise
      context.reject(handlerError);

      // Emit event
      this.emit('commandError', {
        deviceId: device.id,
        commandId: context.id,
        error: handlerError
      });
    }
  }

  /**
   * Process command queue
   */
  private processQueue(deviceId: string): void {
    const queue = this.commandQueue.get(deviceId);
    if (!queue || queue.length === 0) {
      return;
    }

    const device = this.registry.getDevice(deviceId);
    if (!device || device.status !== 'online') {
      return;
    }

    // Execute commands if possible
    while (queue.length > 0 && this.canExecuteCommand(device)) {
      const context = queue.shift();
      if (context) {
        this.executeCommand(context).catch(() => {});
      }
    }

    // Remove empty queue
    if (queue.length === 0) {
      this.commandQueue.delete(deviceId);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle device state changes
    this.registry.on('deviceConnected', (deviceId: string) => {
      this.processQueue(deviceId);
    });

    this.registry.on('deviceDisconnected', (deviceId: string) => {
      this.handleDeviceDisconnect(deviceId);
    });

    this.registry.on('deviceRemoved', (deviceId: string) => {
      this.handleDeviceRemoved(deviceId);
    });
  }

  /**
   * Handle device disconnection
   */
  private handleDeviceDisconnect(deviceId: string): void {
    const error = new Error('Device disconnected');

    // Cancel active commands
    const active = this.activeCommands.get(deviceId);
    if (active) {
      active.forEach(cmd => cmd.reject(error));
      this.activeCommands.delete(deviceId);
    }

    // Keep queued commands if offline queuing enabled
    const queue = this.commandQueue.get(deviceId);
    if (queue) {
      // Remove commands that don't allow offline queuing
      const filtered = queue.filter(cmd => cmd.options.queueIfOffline);
      if (filtered.length === 0) {
        this.commandQueue.delete(deviceId);
      } else {
        this.commandQueue.set(deviceId, filtered);
      }
    }
  }

  /**
   * Handle device removal
   */
  private handleDeviceRemoved(deviceId: string): void {
    this.cancelCommands(deviceId);
  }

  /**
   * Generate command ID
   */
  private generateCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}
