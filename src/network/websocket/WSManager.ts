import { EventEmitter } from 'events';
import * as WebSocket from 'ws';
import { Buffer } from 'buffer';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';

interface WSOptions {
  // Connection options
  url: string;
  protocols?: string | string[];
  pingInterval?: number;
  pingTimeout?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  
  // Performance options
  maxConcurrentConnections?: number;
  bufferSize?: number;
  compressionThreshold?: number;
  keepAliveInterval?: number;
  
  // Batching options
  batchSize?: number;
  batchTimeout?: number;
  
  // Recovery options
  enableRecovery?: boolean;
  recoveryWindow?: number;
  recoveryBatchSize?: number;
}

interface WSStats {
  sent: number;
  received: number;
  errors: number;
  reconnects: number;
  avgLatency: number;
  messageRate: number;
  byteRate: number;
  compressionRatio: number;
  connectionUptime: number;
}

interface PendingMessage {
  id: string;
  data: any;
  timestamp: number;
  attempts: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

interface BatchContext {
  id: string;
  messages: PendingMessage[];
  timestamp: number;
  resolve: (value: any[]) => void;
  reject: (error: Error) => void;
}

/**
 * WebSocket Connection Manager
 * Optimized WebSocket handling with connection pooling, batching, and recovery
 */
export class WSManager extends EventEmitter {
  private ws?: WebSocket;
  private options: Required<WSOptions>;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;

  private messageQueue: PendingMessage[] = [];
  private activeBatch?: BatchContext;
  private batchTimer?: NodeJS.Timeout;
  private recoveryQueue: Map<string, any> = new Map();

  private stats: WSStats = {
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

  private connectionStart?: number;
  private lastMessageTime?: number;

  constructor(
    private wsOptions: WSOptions,
    private telemetry: TelemetryManager
  ) {
    super();
    this.options = this.initializeOptions(wsOptions);
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
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

    } catch (error) {
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
  async disconnect(): Promise<void> {
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
  async send(data: any): Promise<any> {
    // Create message context
    const message: PendingMessage = {
      id: this.generateMessageId(),
      data,
      timestamp: Date.now(),
      attempts: 0,
      resolve: () => {},
      reject: () => {}
    };

    // Create promise
    const promise = new Promise<any>((resolve, reject) => {
      message.resolve = resolve;
      message.reject = reject;
    });

    // Add to queue
    this.messageQueue.push(message);

    // Process queue if possible
    if (this.shouldProcessBatch()) {
      await this.processBatch();
    } else {
      this.scheduleBatch();
    }

    return promise;
  }

  /**
   * Get connection statistics
   */
  getStats(): WSStats {
    return {
      ...this.stats,
      connectionUptime: this.connectionStart ? 
        Date.now() - this.connectionStart : 
        0
    };
  }

  private initializeOptions(options: WSOptions): Required<WSOptions> {
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

  private async setupWebSocket(): Promise<void> {
    if (!this.ws) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.pingTimeout);

      this.ws!.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws!.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws!.on('close', () => {
        this.handleDisconnect();
      });

      this.ws!.on('error', (error: Error) => {
        this.handleError(error);
      });

      this.ws!.on('ping', () => {
        this.ws!.pong();
      });

      this.ws!.on('pong', () => {
        this.handlePong();
      });
    });
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (!this.connected || !this.ws) return;

      this.ws.ping();
      
      this.pingTimeout = setTimeout(() => {
        this.handlePingTimeout();
      }, this.options.pingTimeout);
      
    }, this.options.pingInterval);
  }

  private handlePong(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }

  private handlePingTimeout(): void {
    // Connection is stale, reconnect
    this.disconnect().then(() => {
      if (this.shouldReconnect()) {
        this.connect();
      }
    });
  }

  private handleMessage(data: Buffer): void {
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

    } catch (error) {
      this.handleError(error);
    }
  }

  private handleBatchResponse(response: any): void {
    if (!this.activeBatch) {
      return;
    }

    const { messages, resolve, reject } = this.activeBatch;

    try {
      // Map responses to messages
      const results = response.results.map((result: any, i: number) => {
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

    } catch (error) {
      reject(error);
    } finally {
      this.activeBatch = undefined;
    }
  }

  private handleResponse(response: any): void {
    const message = this.messageQueue.find(m => m.id === response.id);
    if (!message) return;

    if (response.error) {
      this.handleMessageError(message, response.error);
    } else {
      message.resolve(response.data);
    }

    this.messageQueue = this.messageQueue.filter(m => m !== message);
  }

  private handleMessageError(message: PendingMessage, error: any): void {
    this.stats.errors++;

    // Add to recovery queue if enabled
    if (this.options.enableRecovery &&
        Date.now() - message.timestamp <= this.options.recoveryWindow) {
      this.recoveryQueue.set(message.id, message);
    }

    message.reject(error);
  }

  private handleError(error: Error): void {
    this.stats.errors++;
    this.emit('error', error);
  }

  private handleDisconnect(): void {
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
    } else {
      this.rejectPendingMessages(new Error('Connection lost'));
    }
  }

  private clearTimers(): void {
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

  private shouldReconnect(): boolean {
    return this.reconnectAttempts < this.options.maxReconnectAttempts;
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.options.reconnectDelay);
  }

  private rejectPendingMessages(error: Error): void {
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

  private shouldProcessBatch(): boolean {
    return this.connected &&
           !this.activeBatch &&
           this.messageQueue.length >= this.options.batchSize;
  }

  private scheduleBatch(): void {
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.options.batchTimeout);
    }
  }

  private async processBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    if (!this.connected || this.messageQueue.length === 0) {
      return;
    }

    // Create batch
    const messages = this.messageQueue.splice(0, this.options.batchSize);
    const batch: BatchContext = {
      id: this.generateMessageId(),
      messages,
      timestamp: Date.now(),
      resolve: () => {},
      reject: () => {}
    };

    // Create batch promise
    const promise = new Promise<any[]>((resolve, reject) => {
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

    } catch (error) {
      batch.reject(error);
      this.activeBatch = undefined;
      throw error;
    }
  }

  private async processPendingMessages(): Promise<void> {
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
    } else {
      this.scheduleBatch();
    }
  }

  private async sendData(data: any): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected');
    }

    // Convert to buffer
    const buffer = Buffer.from(JSON.stringify(data));

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

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private shouldCompress(data: Buffer): boolean {
    return data.length >= this.options.compressionThreshold;
  }

  private shouldDecompress(data: Buffer): boolean {
    // Implement compression detection
    return false;
  }

  private compress(data: Buffer): Buffer {
    // Use zlib deflate for compression
    const zlib = require('zlib');
    return zlib.deflateSync(data, {
      level: zlib.constants.Z_BEST_SPEED
    });
  }

  private decompress(data: Buffer): Buffer {
    // Use zlib inflate for decompression
    const zlib = require('zlib');
    return zlib.inflateSync(data);
  }

  private shouldDecompress(data: Buffer): boolean {
    // Check first byte for zlib header
    return data.length > 0 && (data[0] === 0x78 || data[0] === 0x58);
  }

  private isResponse(message: any): boolean {
    return message && message.type === 'response' && message.id;
  }

  private isBatchResponse(message: any): boolean {
    return message && message.type === 'batch_response' && message.id;
  }
}
