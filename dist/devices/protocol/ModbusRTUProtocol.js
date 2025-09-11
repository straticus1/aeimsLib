"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModbusRTUProtocol = void 0;
const BaseProtocol_1 = require("./BaseProtocol");
const BaseProtocol_2 = require("./BaseProtocol");
const serialport_1 = require("serialport");
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
})(ModbusExceptionCode || (ModbusExceptionCode = {}));
/**
 * ModbusRTU Protocol Implementation
 */
class ModbusRTUProtocol extends BaseProtocol_1.BaseProtocol {
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
                'diagnostics'
            ])
        });
        this.connected = false;
        this.connecting = false;
        this.buffer = Buffer.alloc(0);
        this.lastRequestTime = 0;
        this.reconnectAttempts = 0;
        this.options = this.initializeOptions(options);
    }
    initializeOptions(options) {
        return {
            path: options.path,
            baudRate: options.baudRate || 9600,
            dataBits: options.dataBits || 8,
            stopBits: options.stopBits || 1,
            parity: options.parity || 'none',
            unitId: options.unitId || 1,
            timeout: options.timeout || 1000,
            interFrameDelay: options.interFrameDelay || 35, // 3.5 char times default
            interCharDelay: options.interCharDelay || 10, // 1 char time default
            retries: options.retries || 3,
            reconnectDelay: options.reconnectDelay || 1000,
            maxReconnectAttempts: options.maxReconnectAttempts || 3,
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
            this.connected = true;
            this.connecting = false;
            this.reconnectAttempts = 0;
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
        this.rejectPendingRequest(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.CONNECTION_LOST, 'Connection closed'));
        if (this.port) {
            this.port.removeAllListeners();
            await new Promise((resolve) => {
                this.port.close(() => resolve());
            });
            this.port = undefined;
        }
    }
    /**
     * Send command to Modbus device
     */
    async doSendCommand(command) {
        if (!this.connected || !this.port) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.INVALID_STATE, 'Not connected');
        }
        if (this.pendingRequest) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.INVALID_STATE, 'Request already in progress');
        }
        // Wait for inter-frame delay
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.options.interFrameDelay) {
            await new Promise(resolve => setTimeout(resolve, this.options.interFrameDelay - timeSinceLastRequest));
        }
        // Create request
        const request = this.encodeRequest(command);
        return new Promise((resolve, reject) => {
            this.pendingRequest = {
                resolve,
                reject,
                retries: 0
            };
            this.sendRequest(request);
        });
    }
    /**
     * Establish serial connection
     */
    async establishConnection() {
        return new Promise((resolve, reject) => {
            this.port = new serialport_1.SerialPort({
                path: this.options.path,
                baudRate: this.options.baudRate,
                dataBits: this.options.dataBits,
                stopBits: this.options.stopBits,
                parity: this.options.parity,
                autoOpen: false
            });
            const timeout = setTimeout(() => {
                cleanup();
                reject(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.TIMEOUT, 'Connection timeout'));
            }, this.options.timeout);
            const cleanup = () => {
                this.port.removeListener('open', onOpen);
                this.port.removeListener('error', onError);
                clearTimeout(timeout);
            };
            const onOpen = () => {
                cleanup();
                this.setupPortHandlers();
                resolve();
            };
            const onError = (error) => {
                cleanup();
                reject(error);
            };
            this.port.once('open', onOpen);
            this.port.once('error', onError);
            this.port.open();
        });
    }
    /**
     * Setup port event handlers
     */
    setupPortHandlers() {
        if (!this.port)
            return;
        this.port.on('data', (data) => {
            this.handleData(data);
        });
        this.port.on('close', () => {
            this.handleDisconnect();
        });
        this.port.on('error', (error) => {
            this.handleError(error);
        });
    }
    /**
     * Send Modbus request
     */
    sendRequest(request) {
        if (!this.port)
            return;
        try {
            // Set response timeout
            this.responseTimer = setTimeout(() => {
                if (!this.pendingRequest)
                    return;
                if (this.pendingRequest.retries < this.options.retries) {
                    // Retry request
                    this.pendingRequest.retries++;
                    this.clearTimers();
                    this.sendRequest(request);
                }
                else {
                    // Give up
                    this.rejectPendingRequest(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.TIMEOUT, 'Response timeout'));
                }
            }, this.options.timeout);
            this.port.write(request);
            this.lastRequestTime = Date.now();
        }
        catch (error) {
            this.rejectPendingRequest(error);
        }
    }
    /**
     * Handle received data
     */
    handleData(data) {
        if (!this.pendingRequest)
            return;
        // Reset inter-character timer
        if (this.interCharTimer) {
            clearTimeout(this.interCharTimer);
        }
        // Append data to buffer
        this.buffer = Buffer.concat([this.buffer, data]);
        // Wait for complete message
        this.interCharTimer = setTimeout(() => {
            // Message complete - process it
            this.processResponse(this.buffer);
            this.buffer = Buffer.alloc(0);
        }, this.options.interCharDelay);
    }
    /**
     * Process Modbus response
     */
    processResponse(response) {
        try {
            if (!this.pendingRequest)
                return;
            // Validate CRC
            const crc = response.slice(-2);
            const data = response.slice(0, -2);
            const calculatedCrc = this.calculateCRC16(data);
            if (crc.readUInt16LE(0) !== calculatedCrc) {
                throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.PROTOCOL_ERROR, 'Invalid CRC');
            }
            // Check for exception response
            const functionCode = response[1];
            if (functionCode > 0x80) {
                const exceptionCode = response[2];
                const error = this.createExceptionError(exceptionCode);
                this.rejectPendingRequest(error);
                return;
            }
            // Parse response
            const unitId = response[0];
            const responseData = this.parseResponseData(functionCode, response.slice(2));
            this.pendingRequest.resolve({
                functionCode,
                unitId,
                data: responseData
            });
            this.pendingRequest = undefined;
        }
        catch (error) {
            this.rejectPendingRequest(error);
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
                const count = data[0];
                const values = [];
                for (let i = 0; i < count * 8; i++) {
                    const byte = data[1 + Math.floor(i / 8)];
                    values.push((byte & (1 << (i % 8))) !== 0);
                }
                return values;
            }
            case ModbusFunctionCode.READ_HOLDING_REGISTERS:
            case ModbusFunctionCode.READ_INPUT_REGISTERS: {
                const count = data[0] / 2;
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
    encodeRequest(request) {
        const { functionCode, address, quantity, values, unitId } = request;
        let data;
        switch (functionCode) {
            case ModbusFunctionCode.READ_COILS:
            case ModbusFunctionCode.READ_DISCRETE_INPUTS:
            case ModbusFunctionCode.READ_HOLDING_REGISTERS:
            case ModbusFunctionCode.READ_INPUT_REGISTERS: {
                data = Buffer.alloc(5);
                data[0] = unitId || this.options.unitId;
                data[1] = functionCode;
                data.writeUInt16BE(address, 2);
                data.writeUInt16BE(quantity || 1, 4);
                break;
            }
            case ModbusFunctionCode.WRITE_SINGLE_COIL:
            case ModbusFunctionCode.WRITE_SINGLE_REGISTER: {
                data = Buffer.alloc(5);
                data[0] = unitId || this.options.unitId;
                data[1] = functionCode;
                data.writeUInt16BE(address, 2);
                data.writeUInt16BE(values[0], 4);
                break;
            }
            case ModbusFunctionCode.WRITE_MULTIPLE_COILS: {
                const byteCount = Math.ceil((values.length) / 8);
                data = Buffer.alloc(6 + byteCount);
                data[0] = unitId || this.options.unitId;
                data[1] = functionCode;
                data.writeUInt16BE(address, 2);
                data.writeUInt16BE(values.length, 4);
                data[6] = byteCount;
                // Pack bits into bytes
                const bits = values;
                for (let i = 0; i < bits.length; i++) {
                    if (bits[i]) {
                        data[7 + Math.floor(i / 8)] |= 1 << (i % 8);
                    }
                }
                break;
            }
            case ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS: {
                const byteCount = values.length * 2;
                data = Buffer.alloc(6 + byteCount);
                data[0] = unitId || this.options.unitId;
                data[1] = functionCode;
                data.writeUInt16BE(address, 2);
                data.writeUInt16BE(values.length, 4);
                data[6] = byteCount;
                // Write register values
                const registers = values;
                for (let i = 0; i < registers.length; i++) {
                    data.writeUInt16BE(registers[i], 7 + i * 2);
                }
                break;
            }
            default:
                throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.PROTOCOL_ERROR, `Unsupported function code: ${functionCode}`);
        }
        // Add CRC
        const crc = this.calculateCRC16(data);
        const request = Buffer.alloc(data.length + 2);
        data.copy(request);
        request.writeUInt16LE(crc, data.length);
        return request;
    }
    /**
     * Calculate CRC16 (Modbus)
     */
    calculateCRC16(data) {
        let crc = 0xFFFF;
        for (const byte of data) {
            crc ^= byte;
            for (let i = 0; i < 8; i++) {
                const carry = crc & 0x0001;
                crc >>= 1;
                if (carry) {
                    crc ^= 0xA001;
                }
            }
        }
        return crc;
    }
    /**
     * Handle port disconnection
     */
    handleDisconnect() {
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
        this.clearTimers();
        this.rejectPendingRequest(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.CONNECTION_LOST, 'Connection lost'));
        if (wasConnected &&
            this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.reconnectTimer = setTimeout(() => {
                this.connect({}).catch(() => { });
            }, this.options.reconnectDelay);
        }
    }
    /**
     * Handle port error
     */
    handleError(error) {
        this.emit('error', error);
    }
    /**
     * Clear timers
     */
    clearTimers() {
        if (this.responseTimer) {
            clearTimeout(this.responseTimer);
            this.responseTimer = undefined;
        }
        if (this.interCharTimer) {
            clearTimeout(this.interCharTimer);
            this.interCharTimer = undefined;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }
    /**
     * Reject pending request
     */
    rejectPendingRequest(error) {
        if (this.pendingRequest) {
            this.pendingRequest.reject(error);
            this.pendingRequest = undefined;
        }
        this.clearTimers();
        this.buffer = Buffer.alloc(0);
    }
}
exports.ModbusRTUProtocol = ModbusRTUProtocol;
//# sourceMappingURL=ModbusRTUProtocol.js.map