import { EventEmitter } from 'events';
import { DeviceRegistry } from '../registry/DeviceRegistry';
import { Logger } from '../../core/logging/Logger';
import { MetricsCollector } from '../../core/metrics/MetricsCollector';
import { ErrorHandler } from '../../core/errors/ErrorHandler';
import { RetryStrategy } from '../../core/errors/RetryStrategy';
import { DeviceDataFormatter } from '../protocol/DeviceDataFormatter';
interface CommandOptions {
    id?: string;
    type?: string;
    priority?: number;
    timeout?: number;
    retryStrategy?: RetryStrategy;
    errorHandler?: ErrorHandler;
    inputFormat?: string;
    outputFormat?: string;
    validateResponse?: boolean;
    queueIfOffline?: boolean;
    maxQueueSize?: number;
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
interface DeviceControllerOptions {
    defaultTimeout?: number;
    maxConcurrentCommands?: number;
    commandQueueSize?: number;
    defaultRetryStrategy?: RetryStrategy;
    defaultErrorHandler?: ErrorHandler;
    dataFormatter?: DeviceDataFormatter;
    validateResponses?: boolean;
    enableBatching?: boolean;
    batchSize?: number;
    batchTimeout?: number;
}
/**
 * Device Controller
 * Provides high-level device interaction with error handling,
 * command queuing, and data formatting
 */
export declare class DeviceController extends EventEmitter {
    private registry;
    private metrics;
    private logger;
    private options;
    private commandQueue;
    private activeCommands;
    private dataFormatter;
    constructor(registry: DeviceRegistry, metrics: MetricsCollector, logger: Logger, options?: DeviceControllerOptions);
    /**
     * Send command to device
     */
    sendCommand(deviceId: string, command: any, options?: CommandOptions): Promise<CommandResult>;
    /**
     * Send batch of commands to device
     */
    sendBatch(deviceId: string, commands: any[], options?: CommandOptions): Promise<CommandResult[]>;
    /**
     * Cancel pending commands
     */
    cancelCommands(deviceId: string): void;
    /**
     * Initialize options
     */
    private initializeOptions;
    /**
     * Apply command options with defaults
     */
    private applyCommandOptions;
    /**
     * Check if command can be executed
     */
    private canExecuteCommand;
    /**
     * Queue command for later execution
     */
    private queueCommand;
    /**
     * Sort command queue by priority
     */
    private sortQueue;
    /**
     * Execute command
     */
    private executeCommand;
    /**
     * Execute command with retry
     */
    private executeWithRetry;
    /**
     * Check if command should be retried
     */
    private shouldRetry;
    /**
     * Calculate retry delay
     */
    private calculateRetryDelay;
    /**
     * Validate command response
     */
    private validateResponse;
    /**
     * Track command metrics
     */
    private trackMetrics;
    /**
     * Track active command
     */
    private trackActiveCommand;
    /**
     * Complete command execution
     */
    private completeCommand;
    /**
     * Handle command error
     */
    private handleCommandError;
    /**
     * Process command queue
     */
    private processQueue;
    /**
     * Setup event handlers
     */
    private setupEventHandlers;
    /**
     * Handle device disconnection
     */
    private handleDeviceDisconnect;
    /**
     * Handle device removal
     */
    private handleDeviceRemoved;
    /**
     * Generate command ID
     */
    private generateCommandId;
}
export {};
