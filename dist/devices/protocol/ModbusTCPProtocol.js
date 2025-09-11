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
exports.ModbusTCPProtocol = void 0;
const BaseProtocol_1 = require("./BaseProtocol");
const BaseProtocol_2 = require("./BaseProtocol");
const net = __importStar(require("net"));
// Standard Modbus Function Codes
var ModbusFunctionCode;
(function (ModbusFunctionCode) {
    ModbusFunctionCode[ModbusFunctionCode["READ_COILS"] = 1] = "READ_COILS";
    ModbusFunctionCode[ModbusFunctionCode["READ_DISCRETE_INPUTS"] = 2] = "READ_DISCRETE_INPUTS";
    ModbusFunctionCode[ModbusFunctionCode["READ_HOLDING_REGISTERS"] = 3] = "READ_HOLDING_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["READ_INPUT_REGISTERS"] = 4] = "READ_INPUT_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_SINGLE_COIL"] = 5] = "WRITE_SINGLE_COIL";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_SINGLE_REGISTER"] = 6] = "WRITE_SINGLE_REGISTER";
    ModbusFunctionCode[ModbusFunctionCode["READ_EXCEPTION_STATUS"] = 7] = "READ_EXCEPTION_STATUS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_MULTIPLE_COILS"] = 15] = "WRITE_MULTIPLE_COILS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_MULTIPLE_REGISTERS"] = 16] = "WRITE_MULTIPLE_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["REPORT_SLAVE_ID"] = 17] = "REPORT_SLAVE_ID";
    ModbusFunctionCode[ModbusFunctionCode["READ_FILE_RECORD"] = 20] = "READ_FILE_RECORD";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_FILE_RECORD"] = 21] = "WRITE_FILE_RECORD";
    ModbusFunctionCode[ModbusFunctionCode["MASK_WRITE_REGISTER"] = 22] = "MASK_WRITE_REGISTER";
    ModbusFunctionCode[ModbusFunctionCode["READ_WRITE_MULTIPLE_REGISTERS"] = 23] = "READ_WRITE_MULTIPLE_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["READ_FIFO_QUEUE"] = 24] = "READ_FIFO_QUEUE";
})(ModbusFunctionCode || (ModbusFunctionCode = {}));
// Modbus Exception Codes
var ModbusExceptionCode;
(function (ModbusExceptionCode) {
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_FUNCTION"] = 1] = "ILLEGAL_FUNCTION";
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_DATA_ADDRESS"] = 2] = "ILLEGAL_DATA_ADDRESS";
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_DATA_VALUE"] = 3] = "ILLEGAL_DATA_VALUE";
    ModbusExceptionCode[ModbusExceptionCode["SLAVE_DEVICE_FAILURE"] = 4] = "SLAVE_DEVICE_FAILURE";
    ModbusExceptionCode[ModbusExceptionCode["ACKNOWLEDGE"] = 5] = "ACKNOWLEDGE";
    ModbusExceptionCode[ModbusExceptionCode["SLAVE_DEVICE_BUSY"] = 6] = "SLAVE_DEVICE_BUSY";
    ModbusExceptionCode[ModbusExceptionCode["MEMORY_PARITY_ERROR"] = 8] = "MEMORY_PARITY_ERROR";
    ModbusExceptionCode[ModbusExceptionCode["GATEWAY_PATH_UNAVAILABLE"] = 10] = "GATEWAY_PATH_UNAVAILABLE";
    ModbusExceptionCode[ModbusExceptionCode["GATEWAY_TARGET_FAILED"] = 11] = "GATEWAY_TARGET_FAILED";
})(ModbusExceptionCode || (ModbusExceptionCode = {}));
/**
 * ModbusTCP Protocol Implementation
 */
class ModbusTCPProtocol extends BaseProtocol_1.BaseProtocol {
    constructor(options) {
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
        this.connected = false;
        this.connecting = false;
        this.transactionId = 0;
        this.transactions = new Map();
        this.buffer = Buffer.alloc(0);
        this.lastActivity = 0;
        this.options = this.initializeOptions(options);
    }
    initializeOptions(options) {
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
    async doConnect() {
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
        }
        catch (error) {
            this.connecting = false;
            throw error;
        }
    }
    /**
     * Disconnect from Modbus device
     */
    async doDisconnect() {
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
    async doSendCommand(command) {
        if (!this.connected || !this.socket) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.INVALID_STATE, 'Not connected');
        }
        // Check transaction limit
        if (this.transactions.size >= this.options.maxTransactions) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.INVALID_STATE, 'Transaction limit reached');
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
                        this.socket.write(transaction.request);
                        this.resetTransactionTimeout(transaction);
                    }
                    else {
                        reject(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.TIMEOUT, 'Transaction timeout'));
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
            }
            catch (error) {
                this.transactions.delete(transactionId);
                clearTimeout(timeout);
                reject(error);
            }
        });
    }
    /**
     * Establish TCP connection
     */
    async establishConnection() {
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            const timeout = setTimeout(() => {
                cleanup();
                reject(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.TIMEOUT, 'Connection timeout'));
            }, this.options.timeout);
            const cleanup = () => {
                this.socket.removeListener('connect', onConnect);
                this.socket.removeListener('error', onError);
                clearTimeout(timeout);
            };
            const onConnect = () => {
                cleanup();
                this.setupSocketHandlers();
                resolve();
            };
            const onError = (error) => {
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
    setupSocketHandlers() {
        if (!this.socket)
            return;
        this.socket.on('data', (data) => {
            this.handleData(data);
        });
        this.socket.on('close', () => {
            this.handleDisconnect();
        });
        this.socket.on('error', (error) => {
            this.handleError(error);
        });
    }
    /**
     * Handle received data
     */
    handleData(data) {
        this.lastActivity = Date.now();
        this.buffer = Buffer.concat([this.buffer, data]);
        // Process complete messages
        while (this.buffer.length >= 6) { // Minimum Modbus TCP header size
            const length = this.buffer.readUInt16BE(4) + 6;
            if (this.buffer.length < length) {
                break; // Wait for complete message
            }
            const message = this.buffer.slice(0, length);
            this.buffer = this.buffer.slice(length);
            this.processResponse(message);
        }
    }
    /**
     * Process Modbus response
     */
    processResponse(response) {
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
        }
        catch (error) {
            console.error('Error processing response:', error);
        }
    }
    /**
     * Create Modbus exception error
     */
    createExceptionError(code) {
        let message;
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
        return new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.PROTOCOL_ERROR, message);
    }
    /**
     * Parse response data based on function code
     */
    parseResponseData(functionCode, data) {
        switch (functionCode) {
            case ModbusFunctionCode.READ_COILS:
            case ModbusFunctionCode.READ_DISCRETE_INPUTS: {
                const count = data.readUInt8(0);
                const values = [];
                for (let i = 0; i < count * 8; i++) {
                    const byte = data[1 + Math.floor(i / 8)];
                    values.push((byte & (1 << (i % 8))) !== 0);
                }
                return values;
            }
            case ModbusFunctionCode.READ_HOLDING_REGISTERS:
            case ModbusFunctionCode.READ_INPUT_REGISTERS: {
                const count = data.readUInt8(0) / 2;
                const values = [];
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
                    data.readUInt16BE(0), // Address
                    data.readUInt16BE(2) // Quantity
                ];
            default:
                throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.PROTOCOL_ERROR, `Unsupported function code: ${functionCode}`);
        }
    }
    /**
     * Encode Modbus request
     */
    encodeRequest(request, transactionId) {
        const { functionCode, address, quantity, values, unitId } = request;
        let data;
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
                data.writeUInt16BE(values[0], 3);
                break;
            }
            case ModbusFunctionCode.WRITE_MULTIPLE_COILS: {
                const byteCount = Math.ceil((values.length) / 8);
                data = Buffer.alloc(6 + byteCount);
                data.writeUInt8(functionCode, 0);
                data.writeUInt16BE(address, 1);
                data.writeUInt16BE(values.length, 3);
                data.writeUInt8(byteCount, 5);
                // Pack bits into bytes
                const bits = values;
                for (let i = 0; i < bits.length; i++) {
                    if (bits[i]) {
                        data[6 + Math.floor(i / 8)] |= 1 << (i % 8);
                    }
                }
                break;
            }
            case ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS: {
                const byteCount = values.length * 2;
                data = Buffer.alloc(6 + byteCount);
                data.writeUInt8(functionCode, 0);
                data.writeUInt16BE(address, 1);
                data.writeUInt16BE(values.length, 3);
                data.writeUInt8(byteCount, 5);
                // Write register values
                const registers = values;
                for (let i = 0; i < registers.length; i++) {
                    data.writeUInt16BE(registers[i], 6 + i * 2);
                }
                break;
            }
            default:
                throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.PROTOCOL_ERROR, `Unsupported function code: ${functionCode}`);
        }
        // Build Modbus TCP header
        const header = Buffer.alloc(7);
        header.writeUInt16BE(transactionId, 0); // Transaction ID
        header.writeUInt16BE(0, 2); // Protocol ID (always 0)
        header.writeUInt16BE(data.length + 1, 4); // Length
        header.writeUInt8(unitId || this.options.unitId, 6); // Unit ID
        return Buffer.concat([header, data]);
    }
    /**
     * Handle socket disconnection
     */
    handleDisconnect() {
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
        this.clearTimers();
        this.rejectPendingTransactions(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.CONNECTION_LOST, 'Connection lost'));
        if (wasConnected) {
            // Schedule reconnection
            this.reconnectTimer = setTimeout(() => {
                this.connect({}).catch(() => { });
            }, this.options.reconnectDelay);
        }
    }
    /**
     * Handle socket error
     */
    handleError(error) {
        this.emit('error', error);
    }
    /**
     * Setup keep-alive monitoring
     */
    setupKeepAlive() {
        if (!this.options.keepAlive)
            return;
        this.keepAliveTimer = setInterval(() => {
            const idle = Date.now() - this.lastActivity;
            if (idle >= this.options.keepAliveInterval) {
                // Send keep-alive query (Read Exception Status)
                this.sendCommand({
                    functionCode: ModbusFunctionCode.READ_EXCEPTION_STATUS,
                    address: 0
                }).catch(() => { });
            }
        }, this.options.keepAliveInterval);
    }
    /**
     * Clear timers
     */
    clearTimers() {
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
    clearTransactions() {
        for (const transaction of this.transactions.values()) {
            clearTimeout(transaction.timeout);
        }
        this.transactions.clear();
    }
    /**
     * Reset transaction timeout
     */
    resetTransactionTimeout(transaction) {
        clearTimeout(transaction.timeout);
        transaction.timeout = setTimeout(() => {
            this.transactions.delete(transaction.id);
            transaction.reject(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.TIMEOUT, 'Transaction timeout'));
        }, this.options.timeout);
    }
    /**
     * Reject all pending transactions
     */
    rejectPendingTransactions(error) {
        for (const transaction of this.transactions.values()) {
            clearTimeout(transaction.timeout);
            transaction.reject(error);
        }
        this.transactions.clear();
    }
    /**
     * Get next transaction ID
     */
    getNextTransactionId() {
        this.transactionId = (this.transactionId + 1) % 0xFFFF;
        return this.transactionId;
    }
}
exports.ModbusTCPProtocol = ModbusTCPProtocol;
//# sourceMappingURL=ModbusTCPProtocol.js.map