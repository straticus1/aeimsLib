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
exports.WSManager = void 0;
const events_1 = require("events");
const WebSocket = __importStar(require("ws"));
const buffer_1 = require("buffer");
/**
 * WebSocket Connection Manager
 * Optimized WebSocket handling with connection pooling, batching, and recovery
 */
class WSManager extends events_1.EventEmitter {
    constructor(wsOptions, telemetry) {
        super();
        this.wsOptions = wsOptions;
        this.telemetry = telemetry;
        this.connected = false;
        this.connecting = false;
        this.reconnectAttempts = 0;
        this.messageQueue = [];
        this.recoveryQueue = new Map();
        this.stats = {
            sent: 0,
            received: 0,
            errors: 0,
            reconnects: 0,
            avgLatency: 0,
            messageRate: 0,
            byteRate: 0,
            compressionRatio: 0,
            connectionUptime: 0
        };
        this.options = this.initializeOptions(wsOptions);
    }
    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (this.connected) {
            return;
        }
        if (this.connecting) {
            throw new Error('Connection already in progress');
        }
        this.connecting = true;
        this.reconnectAttempts++;
        try {
            this.ws = new WebSocket(this.options.url, this.options.protocols);
            await this.setupWebSocket();
            this.connected = true;
            this.connecting = false;
            this.reconnectAttempts = 0;
            this.connectionStart = Date.now();
            this.startPing();
            this.processPendingMessages();
            this.emit('connected');
        }
        catch (error) {
            this.connecting = false;
            if (this.shouldReconnect()) {
                this.scheduleReconnect();
                throw new Error('Connection failed, will retry');
            }
            throw new Error('Connection failed');
        }
    }
    /**
     * Disconnect from server
     */
    async disconnect() {
        if (!this.connected) {
            return;
        }
        this.clearTimers();
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        this.connected = false;
        this.connecting = false;
        // Clear pending messages
        this.rejectPendingMessages(new Error('Disconnected'));
        this.emit('disconnected');
    }
    /**
     * Send message to server
     */
    async send(data) {
        // Create message context
        const message = {
            id: this.generateMessageId(),
            data,
            timestamp: Date.now(),
            attempts: 0,
            resolve: () => { },
            reject: () => { }
        };
        // Create promise
        const promise = new Promise((resolve, reject) => {
            message.resolve = resolve;
            message.reject = reject;
        });
        // Add to queue
        this.messageQueue.push(message);
        // Process queue if possible
        if (this.shouldProcessBatch()) {
            await this.processBatch();
        }
        else {
            this.scheduleBatch();
        }
        return promise;
    }
    /**
     * Get connection statistics
     */
    getStats() {
        return {
            ...this.stats,
            connectionUptime: this.connectionStart ?
                Date.now() - this.connectionStart :
                0
        };
    }
    initializeOptions(options) {
        return {
            url: options.url,
            protocols: options.protocols || [],
            pingInterval: options.pingInterval || 30000,
            pingTimeout: options.pingTimeout || 5000,
            reconnectDelay: options.reconnectDelay || 1000,
            maxReconnectAttempts: options.maxReconnectAttempts || 5,
            maxConcurrentConnections: options.maxConcurrentConnections || 1,
            bufferSize: options.bufferSize || 1024 * 1024, // 1MB
            compressionThreshold: options.compressionThreshold || 1024, // 1KB
            keepAliveInterval: options.keepAliveInterval || 30000,
            batchSize: options.batchSize || 100,
            batchTimeout: options.batchTimeout || 50,
            enableRecovery: options.enableRecovery || true,
            recoveryWindow: options.recoveryWindow || 300000, // 5 minutes
            recoveryBatchSize: options.recoveryBatchSize || 1000
        };
    }
    async setupWebSocket() {
        if (!this.ws)
            return;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, this.options.pingTimeout);
            this.ws.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            this.ws.on('close', () => {
                this.handleDisconnect();
            });
            this.ws.on('error', (error) => {
                this.handleError(error);
            });
            this.ws.on('ping', () => {
                this.ws.pong();
            });
            this.ws.on('pong', () => {
                this.handlePong();
            });
        });
    }
    startPing() {
        this.pingTimer = setInterval(() => {
            if (!this.connected || !this.ws)
                return;
            this.ws.ping();
            this.pingTimeout = setTimeout(() => {
                this.handlePingTimeout();
            }, this.options.pingTimeout);
        }, this.options.pingInterval);
    }
    handlePong() {
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = undefined;
        }
    }
    handlePingTimeout() {
        // Connection is stale, reconnect
        this.disconnect().then(() => {
            if (this.shouldReconnect()) {
                this.connect();
            }
        });
    }
    handleMessage(data) {
        this.lastMessageTime = Date.now();
        this.stats.received++;
        try {
            // Decompress if needed
            const decompressed = this.shouldDecompress(data) ?
                this.decompress(data) :
                data;
            // Parse message
            const message = JSON.parse(decompressed.toString());
            // Handle batch response
            if (this.isBatchResponse(message)) {
                this.handleBatchResponse(message);
                return;
            }
            // Handle single response
            if (this.isResponse(message)) {
                this.handleResponse(message);
                return;
            }
            // Handle server message
            this.emit('message', message);
        }
        catch (error) {
            this.handleError(error);
        }
    }
    handleBatchResponse(response) {
        if (!this.activeBatch) {
            return;
        }
        const { messages, resolve, reject } = this.activeBatch;
        try {
            // Map responses to messages
            const results = response.results.map((result, i) => {
                const message = messages[i];
                if (result.error) {
                    // Handle failed message
                    this.handleMessageError(message, result.error);
                    return result.error;
                }
                // Handle successful message
                message.resolve(result.data);
                return result.data;
            });
            resolve(results);
        }
        catch (error) {
            reject(error);
        }
        finally {
            this.activeBatch = undefined;
        }
    }
    handleResponse(response) {
        const message = this.messageQueue.find(m => m.id === response.id);
        if (!message)
            return;
        if (response.error) {
            this.handleMessageError(message, response.error);
        }
        else {
            message.resolve(response.data);
        }
        this.messageQueue = this.messageQueue.filter(m => m !== message);
    }
    handleMessageError(message, error) {
        this.stats.errors++;
        // Add to recovery queue if enabled
        if (this.options.enableRecovery &&
            Date.now() - message.timestamp <= this.options.recoveryWindow) {
            this.recoveryQueue.set(message.id, message);
        }
        message.reject(error);
    }
    handleError(error) {
        this.stats.errors++;
        this.emit('error', error);
    }
    handleDisconnect() {
        this.clearTimers();
        this.connected = false;
        this.connecting = false;
        // Update stats
        if (this.connectionStart) {
            const duration = Date.now() - this.connectionStart;
            this.stats.connectionUptime += duration;
        }
        this.emit('disconnected');
        // Attempt reconnection if needed
        if (this.shouldReconnect()) {
            this.scheduleReconnect();
        }
        else {
            this.rejectPendingMessages(new Error('Connection lost'));
        }
    }
    clearTimers() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = undefined;
        }
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = undefined;
        }
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }
    }
    shouldReconnect() {
        return this.reconnectAttempts < this.options.maxReconnectAttempts;
    }
    scheduleReconnect() {
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, this.options.reconnectDelay);
    }
    rejectPendingMessages(error) {
        // Reject batch if active
        if (this.activeBatch) {
            this.activeBatch.reject(error);
            this.activeBatch = undefined;
        }
        // Reject queued messages
        this.messageQueue.forEach(message => {
            message.reject(error);
        });
        this.messageQueue = [];
    }
    shouldProcessBatch() {
        return this.connected &&
            !this.activeBatch &&
            this.messageQueue.length >= this.options.batchSize;
    }
    scheduleBatch() {
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.processBatch();
            }, this.options.batchTimeout);
        }
    }
    async processBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }
        if (!this.connected || this.messageQueue.length === 0) {
            return;
        }
        // Create batch
        const messages = this.messageQueue.splice(0, this.options.batchSize);
        const batch = {
            id: this.generateMessageId(),
            messages,
            timestamp: Date.now(),
            resolve: () => { },
            reject: () => { }
        };
        // Create batch promise
        const promise = new Promise((resolve, reject) => {
            batch.resolve = resolve;
            batch.reject = reject;
        });
        this.activeBatch = batch;
        try {
            // Send batch
            const data = {
                type: 'batch',
                id: batch.id,
                messages: messages.map(m => ({
                    id: m.id,
                    data: m.data
                }))
            };
            await this.sendData(data);
            // Wait for response
            return await promise;
        }
        catch (error) {
            batch.reject(error);
            this.activeBatch = undefined;
            throw error;
        }
    }
    async processPendingMessages() {
        if (this.recoveryQueue.size === 0) {
            return;
        }
        // Get messages within recovery window
        const now = Date.now();
        const messages = Array.from(this.recoveryQueue.values())
            .filter(m => now - m.timestamp <= this.options.recoveryWindow)
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(0, this.options.recoveryBatchSize);
        // Clear processed messages
        messages.forEach(m => this.recoveryQueue.delete(m.id));
        // Add to queue
        this.messageQueue.push(...messages);
        // Process queue
        if (this.shouldProcessBatch()) {
            await this.processBatch();
        }
        else {
            this.scheduleBatch();
        }
    }
    async sendData(data) {
        if (!this.connected || !this.ws) {
            throw new Error('Not connected');
        }
        // Convert to buffer
        const buffer = buffer_1.Buffer.from(JSON.stringify(data));
        // Compress if needed
        const compressed = this.shouldCompress(buffer) ?
            this.compress(buffer) :
            buffer;
        // Send data
        this.ws.send(compressed);
        this.stats.sent++;
        // Update stats
        const now = Date.now();
        if (this.lastMessageTime) {
            const interval = now - this.lastMessageTime;
            this.stats.messageRate = 1000 / interval;
            this.stats.byteRate = compressed.length / (interval / 1000);
        }
        this.lastMessageTime = now;
        // Track telemetry
        await this.telemetry.track({
            type: 'websocket_message_sent',
            timestamp: now,
            data: {
                size: buffer.length,
                compressedSize: compressed.length,
                messageType: data.type
            }
        });
    }
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    shouldCompress(data) {
        return data.length >= this.options.compressionThreshold;
    }
    shouldDecompress(data) {
        // Implement compression detection
        return false;
    }
    compress(data) {
        // Use zlib deflate for compression
        const zlib = require('zlib');
        return zlib.deflateSync(data, {
            level: zlib.constants.Z_BEST_SPEED
        });
    }
    decompress(data) {
        // Use zlib inflate for decompression
        const zlib = require('zlib');
        return zlib.inflateSync(data);
    }
    shouldDecompress(data) {
        // Check first byte for zlib header
        return data.length > 0 && (data[0] === 0x78 || data[0] === 0x58);
    }
    isResponse(message) {
        return message && message.type === 'response' && message.id;
    }
    isBatchResponse(message) {
        return message && message.type === 'batch_response' && message.id;
    }
}
exports.WSManager = WSManager;
//# sourceMappingURL=WSManager.js.map