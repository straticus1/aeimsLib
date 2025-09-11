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
    REPORT_SLAVE_ID = 17
}
interface ModbusRTUOptions {
    path: string;
    baudRate?: number;
    dataBits?: 5 | 6 | 7 | 8;
    stopBits?: 1 | 2;
    parity?: 'none' | 'even' | 'odd';
    unitId?: number;
    timeout?: number;
    interFrameDelay?: number;
    interCharDelay?: number;
    retries?: number;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
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
 * ModbusRTU Protocol Implementation
 */
export declare class ModbusRTUProtocol extends BaseProtocol {
    private options;
    private port?;
    private connected;
    private connecting;
    private buffer;
    private lastRequestTime;
    private reconnectAttempts;
    private reconnectTimer?;
    private responseTimer?;
    private interCharTimer?;
    private pendingRequest?;
    constructor(options: ModbusRTUOptions);
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
     * Establish serial connection
     */
    private establishConnection;
    /**
     * Setup port event handlers
     */
    private setupPortHandlers;
    /**
     * Send Modbus request
     */
    private sendRequest;
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
     * Calculate CRC16 (Modbus)
     */
    private calculateCRC16;
    /**
     * Handle port disconnection
     */
    private handleDisconnect;
    /**
     * Handle port error
     */
    private handleError;
    /**
     * Clear timers
     */
    private clearTimers;
    /**
     * Reject pending request
     */
    private rejectPendingRequest;
}
export {};
