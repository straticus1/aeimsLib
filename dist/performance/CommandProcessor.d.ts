import { EventEmitter } from 'events';
import { Device, DeviceCommand } from '../interfaces/device';
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
export declare class CommandProcessor extends EventEmitter {
    private static instance;
    private readonly devices;
    private readonly commandQueue;
    private readonly rateLimitTokens;
    private readonly rateLimitLastRefill;
    private readonly batchTimeouts;
    private readonly config;
    private readonly logger;
    private constructor();
    static getInstance(config?: Partial<CommandProcessorConfig>): CommandProcessor;
    registerDevice(device: Device): void;
    unregisterDevice(deviceId: string): void;
    sendCommand(deviceId: string, command: DeviceCommand): Promise<void>;
    private scheduleBatch;
    private processBatch;
    private executeBatch;
    private optimizeCommands;
    private canCombineCommands;
    private combineCommands;
    private checkRateLimit;
    private calculateBackoff;
    getConfig(): CommandProcessorConfig;
    updateConfig(config: Partial<CommandProcessorConfig>): void;
    getQueueLength(deviceId: string): number;
    getRateLimitTokens(deviceId: string): number;
    clearQueue(deviceId: string): void;
}
