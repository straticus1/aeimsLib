import { BaseProtocol } from './BaseProtocol';
import { SerialPort } from 'serialport';
import { DelimiterParser, InterByteTimeoutParser } from '@serialport/parser-delimiter';
import { ProtocolError, ProtocolErrorType } from './BaseProtocol';

interface SerialOptions {
  // Port settings
  path: string;
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  rtscts?: boolean;
  xon?: boolean;
  xoff?: boolean;
  
  // Protocol settings
  delimiter?: string | Buffer;
  interByteTimeout?: number;
  commandTimeout?: number;
  responseTimeout?: number;
  
  // Flow control
  flowControl?: {
    enabled: boolean;
    xon?: number;
    xoff?: number;
    throttleWatermark?: number;
  };

  // Recovery options
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

interface SerialStats {
  bytesRead: number;
  bytesWritten: number;
  writeSpeed: number;
  readSpeed: number;
  errors: number;
  lastError?: Error;
  uptime: number;
  reconnects: number;
}

/**
 * Serial Protocol Implementation
 */
export class SerialProtocol extends BaseProtocol {
  private port?: SerialPort;
  private parser?: DelimiterParser | InterByteTimeoutParser;
  private writeQueue: Array<{
    data: Buffer;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = [];
  private writing: boolean = false;
  private lastWrite: number = 0;
  private reconnectAttempts: number = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private responseTimer?: NodeJS.Timeout;
  
  private stats: SerialStats = {
    bytesRead: 0,
    bytesWritten: 0,
    writeSpeed: 0,
    readSpeed: 0,
    errors: 0,
    uptime: 0,
    reconnects: 0
  };

  constructor(private options: SerialOptions) {
    super({
      bidirectional: true,
      binary: true,
      batching: true,
      encryption: false,
      compression: false,
      maxPacketSize: 16384, // 16KB default
      features: new Set([
        'write',
        'read',
        'flow-control',
        'binary'
      ])
    });
  }

  /**
   * Connect to serial port
   */
  protected async doConnect(): Promise<void> {
    try {
      // Create port
      this.port = new SerialPort({
        path: this.options.path,
        baudRate: this.options.baudRate || 9600,
        dataBits: this.options.dataBits || 8,
        stopBits: this.options.stopBits || 1,
        parity: this.options.parity || 'none',
        rtscts: this.options.rtscts || false,
        xon: this.options.xon || false,
        xoff: this.options.xoff || false
      });

      // Setup parser
      if (this.options.delimiter) {
        this.parser = this.port.pipe(new DelimiterParser({
          delimiter: this.options.delimiter
        }));
      } else if (this.options.interByteTimeout) {
        this.parser = this.port.pipe(new InterByteTimeoutParser({
          interval: this.options.interByteTimeout
        }));
      }

      await this.waitForOpen();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Configure flow control
      if (this.options.flowControl?.enabled) {
        await this.configureFlowControl();
      }

    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Disconnect from serial port
   */
  protected async doDisconnect(): Promise<void> {
    this.clearTimers();

    if (this.port) {
      this.port.removeAllListeners();
      await new Promise<void>((resolve) => {
        this.port!.close(() => resolve());
      });
      this.port = undefined;
    }

    // Clear write queue
    this.writeQueue.forEach(item => {
      item.reject(new Error('Disconnected'));
    });
    this.writeQueue = [];
    this.writing = false;
  }

  /**
   * Send command via serial port
   */
  protected async doSendCommand(command: any): Promise<any> {
    if (!this.port || !this.port.isOpen) {
      throw new ProtocolError(
        ProtocolErrorType.INVALID_STATE,
        'Port not open'
      );
    }

    const data = await this.encode(command);
    
    return new Promise((resolve, reject) => {
      // Add to write queue
      this.writeQueue.push({ data, resolve, reject });
      
      // Start processing queue if not already processing
      if (!this.writing) {
        this.processWriteQueue();
      }
    });
  }

  /**
   * Send batch of commands via serial port
   */
  protected async doSendBatch(commands: any[]): Promise<any[]> {
    if (!this.port || !this.port.isOpen) {
      throw new ProtocolError(
        ProtocolErrorType.INVALID_STATE,
        'Port not open'
      );
    }

    // Encode all commands
    const encodedCommands = await Promise.all(
      commands.map(cmd => this.encode(cmd))
    );

    // Create single buffer
    const totalLength = encodedCommands.reduce((sum, buf) => sum + buf.length, 0);
    const buffer = Buffer.alloc(totalLength);
    let offset = 0;
    
    for (const cmd of encodedCommands) {
      cmd.copy(buffer, offset);
      offset += cmd.length;
    }

    return new Promise((resolve, reject) => {
      const results: any[] = [];
      let received = 0;

      // Set response handler
      const cleanup = () => {
        if (this.responseTimer) {
          clearTimeout(this.responseTimer);
        }
        if (this.parser) {
          this.parser.removeListener('data', onData);
        }
      };

      const onData = (data: Buffer) => {
        try {
          const result = this.decode(data);
          results.push(result);
          received++;

          if (received === commands.length) {
            cleanup();
            resolve(results);
          }
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      // Set timeout
      this.responseTimer = setTimeout(() => {
        cleanup();
        reject(new ProtocolError(
          ProtocolErrorType.TIMEOUT,
          'Response timeout'
        ));
      }, this.options.responseTimeout || 5000);

      // Listen for responses
      if (this.parser) {
        this.parser.on('data', onData);
      }

      // Write data
      this.writeQueue.push({
        data: buffer,
        resolve: () => {}, // Resolved by response handler
        reject: (error) => {
          cleanup();
          reject(error);
        }
      });

      if (!this.writing) {
        this.processWriteQueue();
      }
    });
  }

  /**
   * Process write queue
   */
  private async processWriteQueue(): Promise<void> {
    if (this.writing || this.writeQueue.length === 0) {
      return;
    }

    this.writing = true;

    while (this.writeQueue.length > 0) {
      const { data, resolve, reject } = this.writeQueue[0];

      try {
        await this.write(data);
        this.writeQueue.shift();
        resolve(true);
      } catch (error) {
        this.writeQueue.shift();
        reject(error);
        this.handleError(error);
      }

      // Flow control delay if needed
      if (this.options.flowControl?.enabled) {
        await this.handleFlowControl();
      }
    }

    this.writing = false;
  }

  /**
   * Write data to port
   */
  private write(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        reject(new Error('Port not available'));
        return;
      }

      this.port.write(data, (error) => {
        if (error) {
          reject(error);
          return;
        }

        this.port!.drain((error) => {
          if (error) {
            reject(error);
            return;
          }

          // Update stats
          const now = Date.now();
          if (this.lastWrite) {
            const timeDiff = now - this.lastWrite;
            this.stats.writeSpeed = data.length / (timeDiff / 1000);
          }
          this.lastWrite = now;
          this.stats.bytesWritten += data.length;

          resolve();
        });
      });
    });
  }

  /**
   * Wait for port to open
   */
  private waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        reject(new Error('Port not available'));
        return;
      }

      if (this.port.isOpen) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        this.port!.removeListener('open', onOpen);
        reject(new Error('Open timeout'));
      }, this.options.commandTimeout || 5000);

      const onOpen = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.port.once('open', onOpen);
    });
  }

  /**
   * Setup port event handlers
   */
  private setupEventHandlers(): void {
    if (!this.port) return;

    this.port.on('data', (data: Buffer) => {
      this.stats.bytesRead += data.length;
      
      const now = Date.now();
      if (this.lastWrite) {
        const timeDiff = now - this.lastWrite;
        this.stats.readSpeed = data.length / (timeDiff / 1000);
      }
    });

    this.port.on('error', (error: Error) => {
      this.handleError(error);
    });

    this.port.on('close', () => {
      this.handleDisconnect();
    });
  }

  /**
   * Configure flow control
   */
  private async configureFlowControl(): Promise<void> {
    if (!this.port || !this.options.flowControl?.enabled) return;

    const { xon, xoff, throttleWatermark } = this.options.flowControl;

    if (xon !== undefined && xoff !== undefined) {
      // Software flow control
      this.port.set({
        xon: true,
        xoff: true
      });
    }

    if (throttleWatermark !== undefined) {
      // Set high watermark
      this.port.set({
        highWaterMark: throttleWatermark
      });
    }
  }

  /**
   * Handle flow control delays
   */
  private async handleFlowControl(): Promise<void> {
    if (!this.options.flowControl?.enabled) return;

    const { throttleWatermark } = this.options.flowControl;
    if (!throttleWatermark) return;

    // Simple delay based on buffer fullness
    const bufferLength = this.port?.writableLength || 0;
    if (bufferLength > throttleWatermark) {
      await new Promise(resolve => 
        setTimeout(resolve, 10)
      );
    }
  }

  /**
   * Clear timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = undefined;
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect() {
    this.clearTimers();
    
    if (this.options.autoReconnect && 
        this.reconnectAttempts < (this.options.maxReconnectAttempts || 5)) {
      this.reconnectAttempts++;
      this.stats.reconnects++;
      
      this.reconnectTimer = setTimeout(() => {
        this.connect(this.options);
      }, this.options.reconnectDelay || 1000);
    }
  }

  /**
   * Handle errors
   */
  protected handleError(error: Error): void {
    this.stats.errors++;
    this.stats.lastError = error;
    super.handleError(error);
  }

  /**
   * Get connection statistics
   */
  getStats(): SerialStats {
    return { ...this.stats };
  }
}
