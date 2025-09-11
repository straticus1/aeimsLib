"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandProcessor = void 0;
const events_1 = require("events");
const Logger_1 = require("../utils/Logger");
class CommandProcessor extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.devices = new Map();
        this.commandQueue = new Map();
        this.rateLimitTokens = new Map();
        this.rateLimitLastRefill = new Map();
        this.batchTimeouts = new Map();
        this.logger = Logger_1.Logger.getInstance();
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
    static getInstance(config) {
        if (!CommandProcessor.instance) {
            CommandProcessor.instance = new CommandProcessor(config);
        }
        return CommandProcessor.instance;
    }
    registerDevice(device) {
        this.devices.set(device.info.id, device);
        this.commandQueue.set(device.info.id, []);
        this.rateLimitTokens.set(device.info.id, this.config.rateLimit.burstSize);
        this.rateLimitLastRefill.set(device.info.id, Date.now());
    }
    unregisterDevice(deviceId) {
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
    async sendCommand(deviceId, command) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device not found: ${deviceId}`);
        }
        const entry = {
            deviceId,
            command,
            timestamp: Date.now(),
            resolve: () => { },
            reject: () => { }
        };
        const promise = new Promise((resolve, reject) => {
            entry.resolve = resolve;
            entry.reject = reject;
        });
        const queue = this.commandQueue.get(deviceId);
        queue.push(entry);
        this.scheduleBatch(deviceId);
        return promise;
    }
    scheduleBatch(deviceId) {
        if (this.batchTimeouts.has(deviceId)) {
            return; // Batch already scheduled
        }
        const queue = this.commandQueue.get(deviceId);
        if (queue.length === 0) {
            return; // Nothing to process
        }
        // Calculate optimal delay based on queue size
        const queueSize = queue.length;
        const delay = Math.max(this.config.batch.minDelay, Math.min(this.config.batch.maxDelay, this.config.batch.maxDelay * (1 - queueSize / this.config.batch.maxBatchSize)));
        const timeout = setTimeout(() => {
            this.processBatch(deviceId);
        }, delay);
        this.batchTimeouts.set(deviceId, timeout);
    }
    async processBatch(deviceId) {
        this.batchTimeouts.delete(deviceId);
        const queue = this.commandQueue.get(deviceId);
        if (queue.length === 0)
            return;
        const device = this.devices.get(deviceId);
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
        }
        catch (error) {
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
    async executeBatch(device, batch) {
        // Group similar commands to optimize
        const optimizedCommands = this.optimizeCommands(batch);
        for (const command of optimizedCommands) {
            await device.sendCommand(command);
            // Small delay between commands in batch to prevent device overload
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    }
    optimizeCommands(batch) {
        const optimized = [];
        let current = null;
        for (const entry of batch) {
            const command = entry.command;
            if (!current) {
                current = { ...command };
                continue;
            }
            // Combine compatible commands
            if (this.canCombineCommands(current, command)) {
                current = this.combineCommands(current, command);
            }
            else {
                optimized.push(current);
                current = { ...command };
            }
        }
        if (current) {
            optimized.push(current);
        }
        return optimized;
    }
    canCombineCommands(a, b) {
        // Commands can be combined if they're the same type and within a small time window
        return a.type === b.type &&
            Math.abs((a.timestamp || 0) - (b.timestamp || 0)) < 20;
    }
    combineCommands(a, b) {
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
    checkRateLimit(deviceId, commandCount) {
        const now = Date.now();
        const lastRefill = this.rateLimitLastRefill.get(deviceId);
        let tokens = this.rateLimitTokens.get(deviceId);
        // Refill tokens based on time elapsed
        const elapsed = now - lastRefill;
        const newTokens = Math.floor(elapsed / this.config.rateLimit.interval) *
            this.config.rateLimit.tokensPerInterval;
        if (newTokens > 0) {
            tokens = Math.min(tokens + newTokens, this.config.rateLimit.burstSize);
            this.rateLimitTokens.set(deviceId, tokens);
            this.rateLimitLastRefill.set(deviceId, lastRefill + Math.floor(elapsed / this.config.rateLimit.interval) *
                this.config.rateLimit.interval);
        }
        // Check if we have enough tokens
        if (tokens >= commandCount) {
            this.rateLimitTokens.set(deviceId, tokens - commandCount);
            return true;
        }
        return false;
    }
    calculateBackoff(deviceId) {
        const tokens = this.rateLimitTokens.get(deviceId);
        const deficit = Math.max(0, this.config.rateLimit.tokensPerInterval - tokens);
        return Math.ceil((deficit / this.config.rateLimit.tokensPerInterval) *
            this.config.rateLimit.interval);
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(config) {
        this.config.batch = {
            ...this.config.batch,
            ...config.batch
        };
        this.config.rateLimit = {
            ...this.config.rateLimit,
            ...config.rateLimit
        };
    }
    getQueueLength(deviceId) {
        return this.commandQueue.get(deviceId)?.length || 0;
    }
    getRateLimitTokens(deviceId) {
        return this.rateLimitTokens.get(deviceId) || 0;
    }
    clearQueue(deviceId) {
        const queue = this.commandQueue.get(deviceId);
        if (queue) {
            queue.forEach(entry => {
                entry.reject(new Error('Queue cleared'));
            });
            queue.length = 0;
        }
    }
}
exports.CommandProcessor = CommandProcessor;
//# sourceMappingURL=CommandProcessor.js.map