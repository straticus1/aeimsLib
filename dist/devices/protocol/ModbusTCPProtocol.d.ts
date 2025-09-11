import { BaseProtocol } from './BaseProtocol';
declare enum ModbusFunctionCode {
    READ_COILS = 1,
    READ_DISCRETE_INPUTS = 2,
    READ_HOLDING_REGISTERS = 3,
    READ_INPUT_REGISTERS = 4,
    WRITE_SINGLE_COIL = 5,
    WRITE_SINGLE_REGISTER = 6,
    READ_EXCEPTION_STATUS = 7,
    WRITE_MULTIPLE_COILS = 15,
    WRITE_MULTIPLE_REGISTERS = 16,
    REPORT_SLAVE_ID = 17,
    READ_FILE_RECORD = 20,
    WRITE_FILE_RECORD = 21,
    MASK_WRITE_REGISTER = 22,
    READ_WRITE_MULTIPLE_REGISTERS = 23,
    READ_FIFO_QUEUE = 24
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
/**
 * ModbusTCP Protocol Implementation
 */
export declare class ModbusTCPProtocol extends BaseProtocol {
    private options;
    private socket?;
    private connected;
    private connecting;
    private transactionId;
    private transactions;
    private buffer;
    private keepAliveTimer?;
    private reconnectTimer?;
    private lastActivity;
    constructor(options: ModbusTCPOptions);
    private initializeOptions;
    /**
     * Connect to Modbus device
     */
    protected doConnect(): Promise<void>;
    /**
     * Disconnect from Modbus device
     */
    protected doDisconnect(): Promise<void>;
    /**
     * Send command to Modbus device
     */
    protected doSendCommand(command: ModbusRequest): Promise<ModbusResponse>;
    /**
     * Establish TCP connection
     */
    private establishConnection;
    /**
     * Setup socket event handlers
     */
    private setupSocketHandlers;
    /**
     * Handle received data
     */
    private handleData;
    /**
     * Process Modbus response
     */
    private processResponse;
    /**
     * Create Modbus exception error
     */
    private createExceptionError;
    /**
     * Parse response data based on function code
     */
    private parseResponseData;
    /**
     * Encode Modbus request
     */
    private encodeRequest;
    /**
     * Handle socket disconnection
     */
    private handleDisconnect;
    /**
     * Handle socket error
     */
    private handleError;
    /**
     * Setup keep-alive monitoring
     */
    private setupKeepAlive;
    /**
     * Clear timers
     */
    private clearTimers;
    /**
     * Clear pending transactions
     */
    private clearTransactions;
    /**
     * Reset transaction timeout
     */
    private resetTransactionTimeout;
    /**
     * Reject all pending transactions
     */
    private rejectPendingTransactions;
    /**
     * Get next transaction ID
     */
    private getNextTransactionId;
}
export {};
