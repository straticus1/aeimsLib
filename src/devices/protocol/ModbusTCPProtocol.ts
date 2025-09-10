import { BaseProtocol } from './BaseProtocol';
import { ProtocolError, ProtocolErrorType } from './BaseProtocol';
import * as net from 'net';

// Standard Modbus Function Codes
enum ModbusFunctionCode {
  READ_COILS = 0x01,
  READ_DISCRETE_INPUTS = 0x02,
  READ_HOLDING_REGISTERS = 0x03,
  READ_INPUT_REGISTERS = 0x04,
  WRITE_SINGLE_COIL = 0x05,
  WRITE_SINGLE_REGISTER = 0x06,
  READ_EXCEPTION_STATUS = 0x07,
  WRITE_MULTIPLE_COILS = 0x0F,
  WRITE_MULTIPLE_REGISTERS = 0x10,
  REPORT_SLAVE_ID = 0x11,
  READ_FILE_RECORD = 0x14,
  WRITE_FILE_RECORD = 0x15,
  MASK_WRITE_REGISTER = 0x16,
  READ_WRITE_MULTIPLE_REGISTERS = 0x17,
  READ_FIFO_QUEUE = 0x18
}

// Modbus Exception Codes
enum ModbusExceptionCode {
  ILLEGAL_FUNCTION = 0x01,
  ILLEGAL_DATA_ADDRESS = 0x02,
  ILLEGAL_DATA_VALUE = 0x03,
  SLAVE_DEVICE_FAILURE = 0x04,
  ACKNOWLEDGE = 0x05,
  SLAVE_DEVICE_BUSY = 0x06,
  MEMORY_PARITY_ERROR = 0x08,
  GATEWAY_PATH_UNAVAILABLE = 0x0A,
  GATEWAY_TARGET_FAILED = 0x0B
}

interface ModbusTCPOptions {
  host: string;
  port?: number;
  unitId?: number;
  timeout?: number;
  retries?: number;
  reconnectDelay?: number;
  keepAlive?: boolean;
  keepAliveInterval?: number;
  maxTransactions?: number;
  debug?: boolean;
}

interface ModbusRequest {
  functionCode: ModbusFunctionCode;
  address: number;
  quantity?: number;
  values?: number[] | boolean[];
  unitId?: number;
}

interface ModbusResponse {
  functionCode: ModbusFunctionCode;
  data: number[] | boolean[];
  unitId: number;
}

interface TransactionContext {
  id: number;
  request: Buffer;
  resolve: (response: ModbusResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  retries: number;
}

/**
 * ModbusTCP Protocol Implementation
 */
export class ModbusTCPProtocol extends BaseProtocol {
  private options: Required<ModbusTCPOptions>;
  private socket?: net.Socket;
  private connected: boolean = false;
  private connecting: boolean = false;
  private transactionId: number = 0;
  private transactions = new Map<number, TransactionContext>();
  private buffer = Buffer.alloc(0);
  private keepAliveTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private lastActivity: number = 0;

  constructor(options: ModbusTCPOptions) {
    super({
      bidirectional: true,
      binary: true,
      batching: false,
      encryption: false,
      compression: false,
      maxPacketSize: 256,
      features: new Set([
        'read',
        'write',
        'batch',
        'diagnostics'
      ])
    });

    this.options = this.initializeOptions(options);
  }

  private initializeOptions(options: ModbusTCPOptions): Required<ModbusTCPOptions> {
    return {
      host: options.host,
      port: options.port || 502,
      unitId: options.unitId || 1,
      timeout: options.timeout || 5000,
      retries: options.retries || 3,
      reconnectDelay: options.reconnectDelay || 1000,
      keepAlive: options.keepAlive !== false,
      keepAliveInterval: options.keepAliveInterval || 30000,
      maxTransactions: options.maxTransactions || 16,
      debug: options.debug || false
    };
  }

  /**
   * Connect to Modbus device
   */
  protected async doConnect(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;

    try {
      await this.establishConnection();
      this.setupKeepAlive();
      this.connected = true;
      this.connecting = false;
      this.lastActivity = Date.now();
    } catch (error) {
      this.connecting = false;
      throw error;
    }
  }

  /**
   * Disconnect from Modbus device
   */
  protected async doDisconnect(): Promise<void> {
    this.connected = false;
    this.connecting = false;

    this.clearTimers();
    this.clearTransactions();

    if (this.socket) {
      this.socket.destroy();
      this.socket = undefined;
    }
  }

  /**
   * Send command to Modbus device
   */
  protected async doSendCommand(command: ModbusRequest): Promise<ModbusResponse> {
    if (!this.connected || !this.socket) {
      throw new ProtocolError(
        ProtocolErrorType.INVALID_STATE,
        'Not connected'
      );
    }

    // Check transaction limit
    if (this.transactions.size >= this.options.maxTransactions) {
      throw new ProtocolError(
        ProtocolErrorType.INVALID_STATE,
        'Transaction limit reached'
      );
    }

    // Create transaction
    const transactionId = this.getNextTransactionId();
    const request = this.encodeRequest(command, transactionId);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const transaction = this.transactions.get(transactionId);
        if (transaction) {
          this.transactions.delete(transactionId);
          if (transaction.retries < this.options.retries) {
            // Retry transaction
            transaction.retries++;
            this.socket!.write(transaction.request);
            this.resetTransactionTimeout(transaction);
          } else {
            reject(new ProtocolError(
              ProtocolErrorType.TIMEOUT,
              'Transaction timeout'
            ));
          }
        }
      }, this.options.timeout);

      this.transactions.set(transactionId, {
        id: transactionId,
        request,
        resolve,
        reject,
        timeout,
        retries: 0
      });

      try {
        this.socket.write(request);
        this.lastActivity = Date.now();
      } catch (error) {
        this.transactions.delete(transactionId);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Establish TCP connection
   */
  private async establishConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = new net.Socket();

      const timeout = setTimeout(() => {
        cleanup();
        reject(new ProtocolError(
          ProtocolErrorType.TIMEOUT,
          'Connection timeout'
        ));
      }, this.options.timeout);

      const cleanup = () => {
        this.socket!.removeListener('connect', onConnect);
        this.socket!.removeListener('error', onError);
        clearTimeout(timeout);
      };

      const onConnect = () => {
        cleanup();
        this.setupSocketHandlers();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      this.socket.once('connect', onConnect);
      this.socket.once('error', onError);

      this.socket.connect({
        host: this.options.host,
        port: this.options.port
      });
    });
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    this.socket.on('close', () => {
      this.handleDisconnect();
    });

    this.socket.on('error', (error: Error) => {
      this.handleError(error);
    });
  }

  /**
   * Handle received data
   */
  private handleData(data: Buffer): void {
    this.lastActivity = Date.now();
    this.buffer = Buffer.concat([this.buffer, data]);

    // Process complete messages
    while (this.buffer.length >= 6) {  // Minimum Modbus TCP header size
      const length = this.buffer.readUInt16BE(4) + 6;
      
      if (this.buffer.length < length) {
        break;  // Wait for complete message
      }

      const message = this.buffer.slice(0, length);
      this.buffer = this.buffer.slice(length);

      this.processResponse(message);
    }
  }

  /**
   * Process Modbus response
   */
  private processResponse(response: Buffer): void {
    try {
      const transactionId = response.readUInt16BE(0);
      const transaction = this.transactions.get(transactionId);
      
      if (!transaction) {
        if (this.options.debug) {
          console.warn('Unexpected response:', response);
        }
        return;
      }

      clearTimeout(transaction.timeout);
      this.transactions.delete(transactionId);

      // Check for exception response
      const functionCode = response.readUInt8(7);
      if (functionCode > 0x80) {
        const exceptionCode = response.readUInt8(8);
        const error = this.createExceptionError(exceptionCode);
        transaction.reject(error);
        return;
      }

      // Parse response data
      const unitId = response.readUInt8(6);
      const data = this.parseResponseData(functionCode, response.slice(8));
      
      transaction.resolve({
        functionCode,
        unitId,
        data
      });

    } catch (error) {
      console.error('Error processing response:', error);
    }
  }

  /**
   * Create Modbus exception error
   */
  private createExceptionError(code: number): ProtocolError {
    let message: string;
    
    switch (code) {
      case ModbusExceptionCode.ILLEGAL_FUNCTION:
        message = 'Illegal function';
        break;
      case ModbusExceptionCode.ILLEGAL_DATA_ADDRESS:
        message = 'Illegal data address';
        break;
      case ModbusExceptionCode.ILLEGAL_DATA_VALUE:
        message = 'Illegal data value';
        break;
      case ModbusExceptionCode.SLAVE_DEVICE_FAILURE:
        message = 'Device failure';
        break;
      case ModbusExceptionCode.ACKNOWLEDGE:
        message = 'Command acknowledged';
        break;
      case ModbusExceptionCode.SLAVE_DEVICE_BUSY:
        message = 'Device busy';
        break;
      case ModbusExceptionCode.MEMORY_PARITY_ERROR:
        message = 'Memory parity error';
        break;
      case ModbusExceptionCode.GATEWAY_PATH_UNAVAILABLE:
        message = 'Gateway path unavailable';
        break;
      case ModbusExceptionCode.GATEWAY_TARGET_FAILED:
        message = 'Gateway target failed';
        break;
      default:
        message = `Unknown exception (code ${code})`;
    }

    return new ProtocolError(
      ProtocolErrorType.PROTOCOL_ERROR,
      message
    );
  }

  /**
   * Parse response data based on function code
   */
  private parseResponseData(functionCode: number, data: Buffer): number[] | boolean[] {
    switch (functionCode) {
      case ModbusFunctionCode.READ_COILS:
      case ModbusFunctionCode.READ_DISCRETE_INPUTS: {
        const count = data.readUInt8(0);
        const values: boolean[] = [];
        for (let i = 0; i < count * 8; i++) {
          const byte = data[1 + Math.floor(i / 8)];
          values.push((byte & (1 << (i % 8))) !== 0);
        }
        return values;
      }

      case ModbusFunctionCode.READ_HOLDING_REGISTERS:
      case ModbusFunctionCode.READ_INPUT_REGISTERS: {
        const count = data.readUInt8(0) / 2;
        const values: number[] = [];
        for (let i = 0; i < count; i++) {
          values.push(data.readUInt16BE(1 + i * 2));
        }
        return values;
      }

      case ModbusFunctionCode.WRITE_SINGLE_COIL:
      case ModbusFunctionCode.WRITE_SINGLE_REGISTER:
        return [data.readUInt16BE(0)];

      case ModbusFunctionCode.WRITE_MULTIPLE_COILS:
      case ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS:
        return [
          data.readUInt16BE(0),  // Address
          data.readUInt16BE(2)   // Quantity
        ];

      default:
        throw new ProtocolError(
          ProtocolErrorType.PROTOCOL_ERROR,
          `Unsupported function code: ${functionCode}`
        );
    }
  }

  /**
   * Encode Modbus request
   */
  private encodeRequest(request: ModbusRequest, transactionId: number): Buffer {
    const { functionCode, address, quantity, values, unitId } = request;
    
    let data: Buffer;
    switch (functionCode) {
      case ModbusFunctionCode.READ_COILS:
      case ModbusFunctionCode.READ_DISCRETE_INPUTS:
      case ModbusFunctionCode.READ_HOLDING_REGISTERS:
      case ModbusFunctionCode.READ_INPUT_REGISTERS: {
        data = Buffer.alloc(5);
        data.writeUInt8(functionCode, 0);
        data.writeUInt16BE(address, 1);
        data.writeUInt16BE(quantity || 1, 3);
        break;
      }

      case ModbusFunctionCode.WRITE_SINGLE_COIL:
      case ModbusFunctionCode.WRITE_SINGLE_REGISTER: {
        data = Buffer.alloc(5);
        data.writeUInt8(functionCode, 0);
        data.writeUInt16BE(address, 1);
        data.writeUInt16BE(values![0] as number, 3);
        break;
      }

      case ModbusFunctionCode.WRITE_MULTIPLE_COILS: {
        const byteCount = Math.ceil((values!.length) / 8);
        data = Buffer.alloc(6 + byteCount);
        data.writeUInt8(functionCode, 0);
        data.writeUInt16BE(address, 1);
        data.writeUInt16BE(values!.length, 3);
        data.writeUInt8(byteCount, 5);

        // Pack bits into bytes
        const bits = values as boolean[];
        for (let i = 0; i < bits.length; i++) {
          if (bits[i]) {
            data[6 + Math.floor(i / 8)] |= 1 << (i % 8);
          }
        }
        break;
      }

      case ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS: {
        const byteCount = values!.length * 2;
        data = Buffer.alloc(6 + byteCount);
        data.writeUInt8(functionCode, 0);
        data.writeUInt16BE(address, 1);
        data.writeUInt16BE(values!.length, 3);
        data.writeUInt8(byteCount, 5);

        // Write register values
        const registers = values as number[];
        for (let i = 0; i < registers.length; i++) {
          data.writeUInt16BE(registers[i], 6 + i * 2);
        }
        break;
      }

      default:
        throw new ProtocolError(
          ProtocolErrorType.PROTOCOL_ERROR,
          `Unsupported function code: ${functionCode}`
        );
    }

    // Build Modbus TCP header
    const header = Buffer.alloc(7);
    header.writeUInt16BE(transactionId, 0);  // Transaction ID
    header.writeUInt16BE(0, 2);              // Protocol ID (always 0)
    header.writeUInt16BE(data.length + 1, 4);// Length
    header.writeUInt8(unitId || this.options.unitId, 6);  // Unit ID

    return Buffer.concat([header, data]);
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnect(): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.connecting = false;
    
    this.clearTimers();
    this.rejectPendingTransactions(
      new ProtocolError(
        ProtocolErrorType.CONNECTION_LOST,
        'Connection lost'
      )
    );

    if (wasConnected) {
      // Schedule reconnection
      this.reconnectTimer = setTimeout(() => {
        this.connect({}).catch(() => {});
      }, this.options.reconnectDelay);
    }
  }

  /**
   * Handle socket error
   */
  private handleError(error: Error): void {
    this.emit('error', error);
  }

  /**
   * Setup keep-alive monitoring
   */
  private setupKeepAlive(): void {
    if (!this.options.keepAlive) return;

    this.keepAliveTimer = setInterval(() => {
      const idle = Date.now() - this.lastActivity;
      
      if (idle >= this.options.keepAliveInterval) {
        // Send keep-alive query (Read Exception Status)
        this.sendCommand({
          functionCode: ModbusFunctionCode.READ_EXCEPTION_STATUS,
          address: 0
        }).catch(() => {});
      }
    }, this.options.keepAliveInterval);
  }

  /**
   * Clear timers
   */
  private clearTimers(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Clear pending transactions
   */
  private clearTransactions(): void {
    for (const transaction of this.transactions.values()) {
      clearTimeout(transaction.timeout);
    }
    this.transactions.clear();
  }

  /**
   * Reset transaction timeout
   */
  private resetTransactionTimeout(transaction: TransactionContext): void {
    clearTimeout(transaction.timeout);
    transaction.timeout = setTimeout(() => {
      this.transactions.delete(transaction.id);
      transaction.reject(new ProtocolError(
        ProtocolErrorType.TIMEOUT,
        'Transaction timeout'
      ));
    }, this.options.timeout);
  }

  /**
   * Reject all pending transactions
   */
  private rejectPendingTransactions(error: Error): void {
    for (const transaction of this.transactions.values()) {
      clearTimeout(transaction.timeout);
      transaction.reject(error);
    }
    this.transactions.clear();
  }

  /**
   * Get next transaction ID
   */
  private getNextTransactionId(): number {
    this.transactionId = (this.transactionId + 1) % 0xFFFF;
    return this.transactionId;
  }
}
