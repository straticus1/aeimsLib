import { EventEmitter } from 'events';
import { Device, DeviceCommand } from '../interfaces/device';
import { Logger } from '../utils/Logger';

export interface BatchConfig {
  maxBatchSize: number;
  maxDelay: number;
  minDelay: number;
}

export interface RateLimitConfig {
  tokensPerInterval: number;
  interval: number;
  burstSize: number;
}

export interface CommandProcessorConfig {
  batch: BatchConfig;
  rateLimit: RateLimitConfig;
}

export interface CommandEntry {
  deviceId: string;
  command: DeviceCommand;
  timestamp: number;
  resolve: (value: void | PromiseLike<void>) => void;
  reject: (reason?: any) => void;
}

export class CommandProcessor extends EventEmitter {
  private static instance: CommandProcessor;
  private readonly devices: Map<string, Device>;
  private readonly commandQueue: Map<string, CommandEntry[]>;
  private readonly rateLimitTokens: Map<string, number>;
  private readonly rateLimitLastRefill: Map<string, number>;
  private readonly batchTimeouts: Map<string, NodeJS.Timeout>;
  private readonly config: CommandProcessorConfig;
  private readonly logger: Logger;

  private constructor(config: Partial<CommandProcessorConfig> = {}) {
    super();
    this.devices = new Map();
    this.commandQueue = new Map();
    this.rateLimitTokens = new Map();
    this.rateLimitLastRefill = new Map();
    this.batchTimeouts = new Map();
    this.logger = Logger.getInstance();

    // Default configuration
    this.config = {
      batch: {
        maxBatchSize: 10,
        maxDelay: 50,
        minDelay: 5,
        ...config.batch
      },
      rateLimit: {
        tokensPerInterval: 20,
        interval: 1000, // 1 second
        burstSize: 30,
        ...config.rateLimit
      }
    };
  }

  static getInstance(config?: Partial<CommandProcessorConfig>): CommandProcessor {
    if (!CommandProcessor.instance) {
      CommandProcessor.instance = new CommandProcessor(config);
    }
    return CommandProcessor.instance;
  }

  registerDevice(device: Device): void {
    this.devices.set(device.info.id, device);
    this.commandQueue.set(device.info.id, []);
    this.rateLimitTokens.set(device.info.id, this.config.rateLimit.burstSize);
    this.rateLimitLastRefill.set(device.info.id, Date.now());
  }

  unregisterDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    this.commandQueue.delete(deviceId);
    this.rateLimitTokens.delete(deviceId);
    this.rateLimitLastRefill.delete(deviceId);
    
    const timeout = this.batchTimeouts.get(deviceId);
    if (timeout) {
      clearTimeout(timeout);
      this.batchTimeouts.delete(deviceId);
    }
  }

  async sendCommand(deviceId: string, command: DeviceCommand): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const entry: CommandEntry = {
      deviceId,
      command,
      timestamp: Date.now(),
      resolve: () => {},
      reject: () => {}
    };

    const promise = new Promise<void>((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });

    const queue = this.commandQueue.get(deviceId)!;
    queue.push(entry);

    this.scheduleBatch(deviceId);
    return promise;
  }

  private scheduleBatch(deviceId: string): void {
    if (this.batchTimeouts.has(deviceId)) {
      return; // Batch already scheduled
    }

    const queue = this.commandQueue.get(deviceId)!;
    if (queue.length === 0) {
      return; // Nothing to process
    }

    // Calculate optimal delay based on queue size
    const queueSize = queue.length;
    const delay = Math.max(
      this.config.batch.minDelay,
      Math.min(
        this.config.batch.maxDelay,
        this.config.batch.maxDelay * (1 - queueSize / this.config.batch.maxBatchSize)
      )
    );

    const timeout = setTimeout(() => {
      this.processBatch(deviceId);
    }, delay);

    this.batchTimeouts.set(deviceId, timeout);
  }

  private async processBatch(deviceId: string): void {
    this.batchTimeouts.delete(deviceId);
    
    const queue = this.commandQueue.get(deviceId)!;
    if (queue.length === 0) return;

    const device = this.devices.get(deviceId)!;
    const batch = queue.splice(0, this.config.batch.maxBatchSize);

    try {
      // Ensure we have enough rate limit tokens
      if (!this.checkRateLimit(deviceId, batch.length)) {
        // Re-queue commands and try later
        queue.unshift(...batch);
        setTimeout(() => this.scheduleBatch(deviceId), this.calculateBackoff(deviceId));
        return;
      }

      // Process commands in batch
      await this.executeBatch(device, batch);

      // Resolve promises for successful commands
      batch.forEach(entry => entry.resolve());

    } catch (error) {
      this.logger.error('Error processing command batch', {
        deviceId,
        batchSize: batch.length,
        error
      });

      // Reject all commands in failed batch
      batch.forEach(entry => entry.reject(error));
    }

    // Schedule processing of remaining commands
    if (queue.length > 0) {
      this.scheduleBatch(deviceId);
    }
  }

  private async executeBatch(device: Device, batch: CommandEntry[]): Promise<void> {
    // Group similar commands to optimize
    const optimizedCommands = this.optimizeCommands(batch);

    for (const command of optimizedCommands) {
      await device.sendCommand(command);
      
      // Small delay between commands in batch to prevent device overload
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  private optimizeCommands(batch: CommandEntry[]): DeviceCommand[] {
    const optimized: DeviceCommand[] = [];
    let current: DeviceCommand | null = null;

    for (const entry of batch) {
      const command = entry.command;

      if (!current) {
        current = { ...command };
        continue;
      }

      // Combine compatible commands
      if (this.canCombineCommands(current, command)) {
        current = this.combineCommands(current, command);
      } else {
        optimized.push(current);
        current = { ...command };
      }
    }

    if (current) {
      optimized.push(current);
    }

    return optimized;
  }

  private canCombineCommands(a: DeviceCommand, b: DeviceCommand): boolean {
    // Commands can be combined if they're the same type and within a small time window
    return a.type === b.type &&
           Math.abs((a.timestamp || 0) - (b.timestamp || 0)) < 20;
  }

  private combineCommands(a: DeviceCommand, b: DeviceCommand): DeviceCommand {
    // Combine commands based on type
    switch (a.type) {
      case 'vibrate':
        // Use latest intensity
        return {
          ...b,
          intensity: b.intensity
        };
      case 'pattern':
        // Merge patterns if possible
        return b.pattern ? b : a;
      default:
        // Default to latest command
        return b;
    }
  }

  private checkRateLimit(deviceId: string, commandCount: number): boolean {
    const now = Date.now();
    const lastRefill = this.rateLimitLastRefill.get(deviceId)!;
    let tokens = this.rateLimitTokens.get(deviceId)!;

    // Refill tokens based on time elapsed
    const elapsed = now - lastRefill;
    const newTokens = Math.floor(elapsed / this.config.rateLimit.interval) * 
                     this.config.rateLimit.tokensPerInterval;

    if (newTokens > 0) {
      tokens = Math.min(tokens + newTokens, this.config.rateLimit.burstSize);
      this.rateLimitTokens.set(deviceId, tokens);
      this.rateLimitLastRefill.set(deviceId, 
        lastRefill + Math.floor(elapsed / this.config.rateLimit.interval) * 
                    this.config.rateLimit.interval
      );
    }

    // Check if we have enough tokens
    if (tokens >= commandCount) {
      this.rateLimitTokens.set(deviceId, tokens - commandCount);
      return true;
    }

    return false;
  }

  private calculateBackoff(deviceId: string): number {
    const tokens = this.rateLimitTokens.get(deviceId)!;
    const deficit = Math.max(0, this.config.rateLimit.tokensPerInterval - tokens);
    
    return Math.ceil(
      (deficit / this.config.rateLimit.tokensPerInterval) * 
      this.config.rateLimit.interval
    );
  }

  getConfig(): CommandProcessorConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<CommandProcessorConfig>): void {
    this.config.batch = {
      ...this.config.batch,
      ...config.batch
    };

    this.config.rateLimit = {
      ...this.config.rateLimit,
      ...config.rateLimit
    };
  }

  getQueueLength(deviceId: string): number {
    return this.commandQueue.get(deviceId)?.length || 0;
  }

  getRateLimitTokens(deviceId: string): number {
    return this.rateLimitTokens.get(deviceId) || 0;
  }

  clearQueue(deviceId: string): void {
    const queue = this.commandQueue.get(deviceId);
    if (queue) {
      queue.forEach(entry => {
        entry.reject(new Error('Queue cleared'));
      });
      queue.length = 0;
    }
  }
}
