"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProtocol = exports.CommandStatus = exports.ProtocolError = exports.ProtocolErrorType = void 0;
const events_1 = require("events");
/**
 * Protocol Error Types
 */
var ProtocolErrorType;
(function (ProtocolErrorType) {
    ProtocolErrorType["CONNECTION_FAILED"] = "CONNECTION_FAILED";
    ProtocolErrorType["DISCONNECTION_FAILED"] = "DISCONNECTION_FAILED";
    ProtocolErrorType["COMMAND_FAILED"] = "COMMAND_FAILED";
    ProtocolErrorType["ENCODING_FAILED"] = "ENCODING_FAILED";
    ProtocolErrorType["DECODING_FAILED"] = "DECODING_FAILED";
    ProtocolErrorType["VALIDATION_FAILED"] = "VALIDATION_FAILED";
    ProtocolErrorType["TIMEOUT"] = "TIMEOUT";
    ProtocolErrorType["INVALID_STATE"] = "INVALID_STATE";
})(ProtocolErrorType || (exports.ProtocolErrorType = ProtocolErrorType = {}));
/**
 * Protocol Error
 */
class ProtocolError extends Error {
    constructor(type, message, details) {
        super(message);
        this.type = type;
        this.details = details;
        this.name = 'ProtocolError';
    }
}
exports.ProtocolError = ProtocolError;
/**
 * Command Status
 */
var CommandStatus;
(function (CommandStatus) {
    CommandStatus["PENDING"] = "PENDING";
    CommandStatus["SENT"] = "SENT";
    CommandStatus["SUCCEEDED"] = "SUCCEEDED";
    CommandStatus["FAILED"] = "FAILED";
    CommandStatus["RETRYING"] = "RETRYING";
    CommandStatus["CANCELLED"] = "CANCELLED";
})(CommandStatus || (exports.CommandStatus = CommandStatus = {}));
/**
 * Base Protocol Implementation
 */
class BaseProtocol extends events_1.EventEmitter {
    constructor(options = {}, capabilities) {
        super();
        this.options = options;
        this.capabilities = capabilities;
        this.connected = false;
        this.connecting = false;
        this.connectionAttempts = 0;
        this.commandQueue = [];
        this.activeBatch = [];
        this.validateOptions();
        this.initializeDefaults();
    }
    /**
     * Connect to device
     */
    async connect(connectionOptions) {
        if (this.connected) {
            throw new ProtocolError(ProtocolErrorType.INVALID_STATE, 'Already connected');
        }
        if (this.connecting) {
            throw new ProtocolError(ProtocolErrorType.INVALID_STATE, 'Connection already in progress');
        }
        this.connecting = true;
        this.connectionAttempts++;
        try {
            // Attempt connection
            await this.doConnect(connectionOptions);
            this.connected = true;
            this.connecting = false;
            this.connectionAttempts = 0;
            this.emit('connected');
            // Process any queued commands
            this.processBatch();
        }
        catch (error) {
            this.connecting = false;
            // Handle reconnection
            if (this.shouldReconnect()) {
                this.scheduleReconnect();
                throw new ProtocolError(ProtocolErrorType.CONNECTION_FAILED, 'Connection failed, will retry', error);
            }
            throw new ProtocolError(ProtocolErrorType.CONNECTION_FAILED, 'Connection failed', error);
        }
    }
    /**
     * Disconnect from device
     */
    async disconnect() {
        if (!this.connected) {
            return;
        }
        try {
            await this.doDisconnect();
            this.connected = false;
            this.clearReconnectTimer();
            this.clearBatchTimer();
            // Cancel all pending commands
            this.cancelPendingCommands();
            this.emit('disconnected');
        }
        catch (error) {
            throw new ProtocolError(ProtocolErrorType.DISCONNECTION_FAILED, 'Failed to disconnect', error);
        }
    }
    /**
     * Check connection status
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Send command to device
     */
    async sendCommand(command) {
        // Validate command
        this.validateCommand(command);
        // Create command context
        const context = {
            id: this.generateCommandId(),
            command,
            status: CommandStatus.PENDING,
            attempts: 0,
            startTime: Date.now()
        };
        // Add to queue
        this.commandQueue.push(context);
        // Process batch if possible
        if (this.shouldProcessBatch()) {
            await this.processBatch();
        }
        else {
            this.scheduleBatch();
        }
        // Wait for completion
        return this.waitForCommand(context);
    }
    /**
     * Send batch of commands
     */
    async sendBatch(commands) {
        if (!this.capabilities.batching) {
            throw new ProtocolError(ProtocolErrorType.INVALID_STATE, 'Batching not supported');
        }
        // Validate all commands
        commands.forEach(cmd => this.validateCommand(cmd));
        // Create command contexts
        const contexts = commands.map(cmd => ({
            id: this.generateCommandId(),
            command: cmd,
            status: CommandStatus.PENDING,
            attempts: 0,
            startTime: Date.now()
        }));
        // Add to queue
        this.commandQueue.push(...contexts);
        // Process batch immediately
        await this.processBatch();
        // Wait for all commands
        return Promise.all(contexts.map(ctx => this.waitForCommand(ctx)));
    }
    /**
     * Encode data for transmission
     */
    async encode(data) {
        try {
            // Convert to buffer if needed
            const buffer = Buffer.isBuffer(data) ?
                data :
                Buffer.from(JSON.stringify(data));
            // Apply compression if enabled and over threshold
            if (this.shouldCompress(buffer)) {
                return this.compress(buffer);
            }
            // Apply encryption if enabled
            if (this.options.encryptionEnabled) {
                return this.encrypt(buffer);
            }
            return buffer;
        }
        catch (error) {
            throw new ProtocolError(ProtocolErrorType.ENCODING_FAILED, 'Failed to encode data', error);
        }
    }
    /**
     * Decode received data
     */
    async decode(data) {
        try {
            let buffer = data;
            // Decrypt if needed
            if (this.options.encryptionEnabled) {
                buffer = await this.decrypt(buffer);
            }
            // Decompress if needed
            if (this.isCompressed(buffer)) {
                buffer = await this.decompress(buffer);
            }
            // Parse JSON if needed
            if (this.isJson(buffer)) {
                return JSON.parse(buffer.toString());
            }
            return buffer;
        }
        catch (error) {
            throw new ProtocolError(ProtocolErrorType.DECODING_FAILED, 'Failed to decode data', error);
        }
    }
    // Optional compression methods
    async compress(data) {
        if (!this.capabilities.compression) {
            return data;
        }
        try {
            const zlib = await Promise.resolve().then(() => __importStar(require('zlib')));
            return new Promise((resolve, reject) => {
                zlib.gzip(data, (err, compressed) => {
                    if (err)
                        reject(err);
                    else
                        resolve(compressed);
                });
            });
        }
        catch (error) {
            throw new ProtocolError(ProtocolErrorType.ENCODING_FAILED, 'Compression failed', error);
        }
    }
    async decompress(data) {
        if (!this.capabilities.compression) {
            return data;
        }
        try {
            const zlib = await Promise.resolve().then(() => __importStar(require('zlib')));
            return new Promise((resolve, reject) => {
                zlib.gunzip(data, (err, decompressed) => {
                    if (err)
                        reject(err);
                    else
                        resolve(decompressed);
                });
            });
        }
        catch (error) {
            throw new ProtocolError(ProtocolErrorType.DECODING_FAILED, 'Decompression failed', error);
        }
    }
    // Optional encryption methods
    async encrypt(data) {
        if (!this.options.encryptionEnabled) {
            return data;
        }
        try {
            const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
            const algorithm = 'aes-256-gcm';
            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(algorithm, key);
            cipher.setAAD(Buffer.from('aeims-protocol', 'utf8'));
            let encrypted = cipher.update(data);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();
            // Combine IV, authTag, and encrypted data
            return Buffer.concat([iv, authTag, encrypted]);
        }
        catch (error) {
            throw new ProtocolError(ProtocolErrorType.ENCODING_FAILED, 'Encryption failed', error);
        }
    }
    async decrypt(data) {
        if (!this.options.encryptionEnabled) {
            return data;
        }
        try {
            const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
            const algorithm = 'aes-256-gcm';
            // Extract IV, authTag, and encrypted data
            const iv = data.slice(0, 16);
            const authTag = data.slice(16, 32);
            const encrypted = data.slice(32);
            const key = crypto.randomBytes(32); // In real implementation, use proper key management
            const decipher = crypto.createDecipher(algorithm, key);
            decipher.setAAD(Buffer.from('aeims-protocol', 'utf8'));
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted;
        }
        catch (error) {
            throw new ProtocolError(ProtocolErrorType.DECODING_FAILED, 'Decryption failed', error);
        }
    }
    validateOptions() {
        const opts = this.options;
        // Connection options
        if (opts.reconnectDelay !== undefined && opts.reconnectDelay < 0) {
            throw new Error('reconnectDelay must be non-negative');
        }
        if (opts.maxReconnectAttempts !== undefined && opts.maxReconnectAttempts < 0) {
            throw new Error('maxReconnectAttempts must be non-negative');
        }
        if (opts.connectionTimeout !== undefined && opts.connectionTimeout < 0) {
            throw new Error('connectionTimeout must be non-negative');
        }
        // Command options
        if (opts.commandTimeout !== undefined && opts.commandTimeout < 0) {
            throw new Error('commandTimeout must be non-negative');
        }
        if (opts.maxRetries !== undefined && opts.maxRetries < 0) {
            throw new Error('maxRetries must be non-negative');
        }
        if (opts.retryDelay !== undefined && opts.retryDelay < 0) {
            throw new Error('retryDelay must be non-negative');
        }
        // Batch options
        if (opts.batchSize !== undefined && opts.batchSize < 0) {
            throw new Error('batchSize must be non-negative');
        }
        if (opts.batchTimeout !== undefined && opts.batchTimeout < 0) {
            throw new Error('batchTimeout must be non-negative');
        }
        // Data options
        if (opts.maxPacketSize !== undefined && opts.maxPacketSize < 0) {
            throw new Error('maxPacketSize must be non-negative');
        }
        if (opts.compressionThreshold !== undefined && opts.compressionThreshold < 0) {
            throw new Error('compressionThreshold must be non-negative');
        }
    }
    initializeDefaults() {
        const defaults = {
            // Connection defaults
            reconnect: true,
            reconnectDelay: 1000,
            maxReconnectAttempts: 5,
            connectionTimeout: 5000,
            // Command defaults
            commandTimeout: 5000,
            maxRetries: 3,
            retryDelay: 1000,
            // Batch defaults
            batchSize: 10,
            batchTimeout: 100,
            // Data defaults
            maxPacketSize: 1024 * 1024, // 1MB
            compressionThreshold: 1024, // 1KB
            encryptionEnabled: false
        };
        this.options = { ...defaults, ...this.options };
    }
    validateCommand(command) {
        if (!command) {
            throw new ProtocolError(ProtocolErrorType.VALIDATION_FAILED, 'Command cannot be null');
        }
        // Add additional validation as needed
    }
    generateCommandId() {
        return `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    shouldReconnect() {
        return this.options.reconnect &&
            this.connectionAttempts < this.options.maxReconnectAttempts;
    }
    scheduleReconnect() {
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            void this.connect({});
        }, this.options.reconnectDelay);
    }
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }
    shouldProcessBatch() {
        return this.connected &&
            this.commandQueue.length >= this.options.batchSize;
    }
    scheduleBatch() {
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                void this.processBatch();
            }, this.options.batchTimeout);
        }
    }
    clearBatchTimer() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }
    }
    async processBatch() {
        this.clearBatchTimer();
        if (!this.connected || this.commandQueue.length === 0) {
            return;
        }
        // Get next batch
        const batch = this.commandQueue.splice(0, this.options.batchSize);
        this.activeBatch.push(...batch);
        try {
            let results;
            // Use batch send if available and enabled
            if (this.capabilities.batching && this.doSendBatch) {
                results = await this.doSendBatch(batch.map(ctx => ctx.command));
            }
            else {
                // Send commands individually
                results = await Promise.all(batch.map(ctx => this.doSendCommand(ctx.command)));
            }
            // Update command contexts
            batch.forEach((ctx, i) => {
                ctx.status = CommandStatus.SUCCEEDED;
                ctx.endTime = Date.now();
                this.emit('commandComplete', {
                    context: ctx,
                    result: results[i]
                });
            });
        }
        catch (error) {
            // Handle failures
            batch.forEach(ctx => {
                ctx.status = CommandStatus.FAILED;
                ctx.endTime = Date.now();
                ctx.error = error;
                this.emit('commandFailed', {
                    context: ctx,
                    error
                });
            });
        }
        // Remove from active batch
        this.activeBatch = this.activeBatch.filter(ctx => !batch.includes(ctx));
        // Process next batch if needed
        if (this.shouldProcessBatch()) {
            await this.processBatch();
        }
        else {
            this.scheduleBatch();
        }
    }
    cancelPendingCommands() {
        const pending = [...this.commandQueue, ...this.activeBatch];
        this.commandQueue = [];
        this.activeBatch = [];
        pending.forEach(ctx => {
            ctx.status = CommandStatus.CANCELLED;
            ctx.endTime = Date.now();
            this.emit('commandCancelled', { context: ctx });
        });
    }
    waitForCommand(context) {
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                this.off('commandComplete', onComplete);
                this.off('commandFailed', onFailed);
                this.off('commandCancelled', onCancelled);
            };
            const onComplete = (data) => {
                if (data.context.id === context.id) {
                    cleanup();
                    resolve(data.result);
                }
            };
            const onFailed = (data) => {
                if (data.context.id === context.id) {
                    cleanup();
                    reject(data.error);
                }
            };
            const onCancelled = (data) => {
                if (data.context.id === context.id) {
                    cleanup();
                    reject(new ProtocolError(ProtocolErrorType.INVALID_STATE, 'Command cancelled'));
                }
            };
            this.on('commandComplete', onComplete);
            this.on('commandFailed', onFailed);
            this.on('commandCancelled', onCancelled);
            // Set timeout if configured
            if (this.options.commandTimeout) {
                setTimeout(() => {
                    cleanup();
                    reject(new ProtocolError(ProtocolErrorType.TIMEOUT, 'Command timed out'));
                }, this.options.commandTimeout);
            }
        });
    }
    shouldCompress(data) {
        return this.capabilities.compression &&
            data.length >= this.options.compressionThreshold;
    }
    isCompressed(data) {
        // Implement compression detection
        return false;
    }
    isJson(data) {
        const str = data.toString().trim();
        return str.startsWith('{') || str.startsWith('[');
    }
}
exports.BaseProtocol = BaseProtocol;
//# sourceMappingURL=BaseProtocol.js.map