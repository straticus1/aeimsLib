import { EventEmitter } from 'events';
import { 
  ProtocolHandler, 
  ProtocolCapabilities 
} from './ProtocolRegistry';

/**
 * Protocol Error Types
 */
export enum ProtocolErrorType {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  DISCONNECTION_FAILED = 'DISCONNECTION_FAILED',
  COMMAND_FAILED = 'COMMAND_FAILED',
  ENCODING_FAILED = 'ENCODING_FAILED',
  DECODING_FAILED = 'DECODING_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  INVALID_STATE = 'INVALID_STATE'
}

/**
 * Protocol Error
 */
export class ProtocolError extends Error {
  constructor(
    public type: ProtocolErrorType,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}

/**
 * Protocol Options
 */
export interface ProtocolOptions {
  // Connection options
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  connectionTimeout?: number;

  // Command options
  commandTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;

  // Batch options
  batchSize?: number;
  batchTimeout?: number;

  // Data options
  maxPacketSize?: number;
  compressionThreshold?: number;
  encryptionEnabled?: boolean;
}

/**
 * Command Status
 */
export enum CommandStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
  CANCELLED = 'CANCELLED'
}

/**
 * Command Context
 */
export interface CommandContext {
  id: string;
  command: any;
  status: CommandStatus;
  attempts: number;
  startTime: number;
  endTime?: number;
  error?: Error;
  retryAt?: number;
}

/**
 * Base Protocol Implementation
 */
export abstract class BaseProtocol extends EventEmitter implements ProtocolHandler {
  protected connected: boolean = false;
  protected connecting: boolean = false;
  protected connectionAttempts: number = 0;
  protected reconnectTimer?: NodeJS.Timeout;
  
  protected commandQueue: CommandContext[] = [];
  protected activeBatch: CommandContext[] = [];
  protected batchTimer?: NodeJS.Timeout;

  constructor(
    protected options: ProtocolOptions = {},
    public capabilities: ProtocolCapabilities
  ) {
    super();
    this.validateOptions();
    this.initializeDefaults();
  }

  /**
   * Connect to device
   */
  async connect(connectionOptions: any): Promise<void> {
    if (this.connected) {
      throw new ProtocolError(
        ProtocolErrorType.INVALID_STATE,
        'Already connected'
      );
    }

    if (this.connecting) {
      throw new ProtocolError(
        ProtocolErrorType.INVALID_STATE,
        'Connection already in progress'
      );
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

    } catch (error) {
      this.connecting = false;

      // Handle reconnection
      if (this.shouldReconnect()) {
        this.scheduleReconnect();
        throw new ProtocolError(
          ProtocolErrorType.CONNECTION_FAILED,
          'Connection failed, will retry',
          error
        );
      }

      throw new ProtocolError(
        ProtocolErrorType.CONNECTION_FAILED,
        'Connection failed',
        error
      );
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
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

    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.DISCONNECTION_FAILED,
        'Failed to disconnect',
        error
      );
    }
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send command to device
   */
  async sendCommand(command: any): Promise<any> {
    // Validate command
    this.validateCommand(command);

    // Create command context
    const context: CommandContext = {
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
    } else {
      this.scheduleBatch();
    }

    // Wait for completion
    return this.waitForCommand(context);
  }

  /**
   * Send batch of commands
   */
  async sendBatch(commands: any[]): Promise<any[]> {
    if (!this.capabilities.batching) {
      throw new ProtocolError(
        ProtocolErrorType.INVALID_STATE,
        'Batching not supported'
      );
    }

    // Validate all commands
    commands.forEach(cmd => this.validateCommand(cmd));

    // Create command contexts
    const contexts: CommandContext[] = commands.map(cmd => ({
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
    return Promise.all(
      contexts.map(ctx => this.waitForCommand(ctx))
    );
  }

  /**
   * Encode data for transmission
   */
  async encode(data: any): Promise<Buffer> {
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

    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.ENCODING_FAILED,
        'Failed to encode data',
        error
      );
    }
  }

  /**
   * Decode received data
   */
  async decode(data: Buffer): Promise<any> {
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

    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.DECODING_FAILED,
        'Failed to decode data',
        error
      );
    }
  }

  // Abstract methods to be implemented by specific protocols
  protected abstract doConnect(options: any): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  protected abstract doSendCommand(command: any): Promise<any>;
  protected abstract doSendBatch?(commands: any[]): Promise<any[]>;

  // Optional compression methods
  protected async compress(data: Buffer): Promise<Buffer> {
    if (!this.capabilities.compression) {
      return data;
    }
    
    try {
      const zlib = await import('zlib');
      return new Promise((resolve, reject) => {
        zlib.gzip(data, (err, compressed) => {
          if (err) reject(err);
          else resolve(compressed);
        });
      });
    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.ENCODING_FAILED,
        'Compression failed',
        error
      );
    }
  }

  protected async decompress(data: Buffer): Promise<Buffer> {
    if (!this.capabilities.compression) {
      return data;
    }
    
    try {
      const zlib = await import('zlib');
      return new Promise((resolve, reject) => {
        zlib.gunzip(data, (err, decompressed) => {
          if (err) reject(err);
          else resolve(decompressed);
        });
      });
    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.DECODING_FAILED,
        'Decompression failed',
        error
      );
    }
  }

  // Optional encryption methods
  protected async encrypt(data: Buffer): Promise<Buffer> {
    if (!this.options.encryptionEnabled) {
      return data;
    }
    
    try {
      const crypto = await import('crypto');
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
    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.ENCODING_FAILED,
        'Encryption failed',
        error
      );
    }
  }

  protected async decrypt(data: Buffer): Promise<Buffer> {
    if (!this.options.encryptionEnabled) {
      return data;
    }
    
    try {
      const crypto = await import('crypto');
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
    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.DECODING_FAILED,
        'Decryption failed',
        error
      );
    }
  }

  private validateOptions() {
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

  private initializeDefaults() {
    const defaults: ProtocolOptions = {
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
      compressionThreshold: 1024,  // 1KB
      encryptionEnabled: false
    };

    this.options = { ...defaults, ...this.options };
  }

  private validateCommand(command: any): void {
    if (!command) {
      throw new ProtocolError(
        ProtocolErrorType.VALIDATION_FAILED,
        'Command cannot be null'
      );
    }

    // Add additional validation as needed
  }

  private generateCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private shouldReconnect(): boolean {
    return this.options.reconnect! &&
           this.connectionAttempts < this.options.maxReconnectAttempts!;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      void this.connect({});
    }, this.options.reconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private shouldProcessBatch(): boolean {
    return this.connected &&
           this.commandQueue.length >= this.options.batchSize!;
  }

  private scheduleBatch(): void {
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        void this.processBatch();
      }, this.options.batchTimeout);
    }
  }

  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
  }

  private async processBatch(): Promise<void> {
    this.clearBatchTimer();

    if (!this.connected || this.commandQueue.length === 0) {
      return;
    }

    // Get next batch
    const batch = this.commandQueue.splice(0, this.options.batchSize!);
    this.activeBatch.push(...batch);

    try {
      let results: any[];

      // Use batch send if available and enabled
      if (this.capabilities.batching && this.doSendBatch) {
        results = await this.doSendBatch(
          batch.map(ctx => ctx.command)
        );
      } else {
        // Send commands individually
        results = await Promise.all(
          batch.map(ctx => this.doSendCommand(ctx.command))
        );
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

    } catch (error) {
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
    this.activeBatch = this.activeBatch.filter(
      ctx => !batch.includes(ctx)
    );

    // Process next batch if needed
    if (this.shouldProcessBatch()) {
      await this.processBatch();
    } else {
      this.scheduleBatch();
    }
  }

  private cancelPendingCommands(): void {
    const pending = [...this.commandQueue, ...this.activeBatch];
    this.commandQueue = [];
    this.activeBatch = [];

    pending.forEach(ctx => {
      ctx.status = CommandStatus.CANCELLED;
      ctx.endTime = Date.now();
      this.emit('commandCancelled', { context: ctx });
    });
  }

  private waitForCommand(context: CommandContext): Promise<any> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.off('commandComplete', onComplete);
        this.off('commandFailed', onFailed);
        this.off('commandCancelled', onCancelled);
      };

      const onComplete = (data: { context: CommandContext; result: any }) => {
        if (data.context.id === context.id) {
          cleanup();
          resolve(data.result);
        }
      };

      const onFailed = (data: { context: CommandContext; error: Error }) => {
        if (data.context.id === context.id) {
          cleanup();
          reject(data.error);
        }
      };

      const onCancelled = (data: { context: CommandContext }) => {
        if (data.context.id === context.id) {
          cleanup();
          reject(new ProtocolError(
            ProtocolErrorType.INVALID_STATE,
            'Command cancelled'
          ));
        }
      };

      this.on('commandComplete', onComplete);
      this.on('commandFailed', onFailed);
      this.on('commandCancelled', onCancelled);

      // Set timeout if configured
      if (this.options.commandTimeout) {
        setTimeout(() => {
          cleanup();
          reject(new ProtocolError(
            ProtocolErrorType.TIMEOUT,
            'Command timed out'
          ));
        }, this.options.commandTimeout);
      }
    });
  }

  private shouldCompress(data: Buffer): boolean {
    return this.capabilities.compression &&
           data.length >= this.options.compressionThreshold!;
  }

  private isCompressed(data: Buffer): boolean {
    // Implement compression detection
    return false;
  }

  private isJson(data: Buffer): boolean {
    const str = data.toString().trim();
    return str.startsWith('{') || str.startsWith('[');
  }
}
