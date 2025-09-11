"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerialProtocol = void 0;
const BaseProtocol_1 = require("./BaseProtocol");
const serialport_1 = require("serialport");
const parser_delimiter_1 = require("@serialport/parser-delimiter");
const BaseProtocol_2 = require("./BaseProtocol");
/**
 * Serial Protocol Implementation
 */
class SerialProtocol extends BaseProtocol_1.BaseProtocol {
    constructor(options) {
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
        this.options = options;
        this.writeQueue = [];
        this.writing = false;
        this.lastWrite = 0;
        this.reconnectAttempts = 0;
        this.stats = {
            bytesRead: 0,
            bytesWritten: 0,
            writeSpeed: 0,
            readSpeed: 0,
            errors: 0,
            uptime: 0,
            reconnects: 0
        };
    }
    /**
     * Connect to serial port
     */
    async doConnect() {
        try {
            // Create port
            this.port = new serialport_1.SerialPort({
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
                this.parser = this.port.pipe(new parser_delimiter_1.DelimiterParser({
                    delimiter: this.options.delimiter
                }));
            }
            else if (this.options.interByteTimeout) {
                this.parser = this.port.pipe(new parser_delimiter_1.InterByteTimeoutParser({
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
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    /**
     * Disconnect from serial port
     */
    async doDisconnect() {
        this.clearTimers();
        if (this.port) {
            this.port.removeAllListeners();
            await new Promise((resolve) => {
                this.port.close(() => resolve());
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
    async doSendCommand(command) {
        if (!this.port || !this.port.isOpen) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.INVALID_STATE, 'Port not open');
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
    async doSendBatch(commands) {
        if (!this.port || !this.port.isOpen) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.INVALID_STATE, 'Port not open');
        }
        // Encode all commands
        const encodedCommands = await Promise.all(commands.map(cmd => this.encode(cmd)));
        // Create single buffer
        const totalLength = encodedCommands.reduce((sum, buf) => sum + buf.length, 0);
        const buffer = Buffer.alloc(totalLength);
        let offset = 0;
        for (const cmd of encodedCommands) {
            cmd.copy(buffer, offset);
            offset += cmd.length;
        }
        return new Promise((resolve, reject) => {
            const results = [];
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
            const onData = (data) => {
                try {
                    const result = this.decode(data);
                    results.push(result);
                    received++;
                    if (received === commands.length) {
                        cleanup();
                        resolve(results);
                    }
                }
                catch (error) {
                    cleanup();
                    reject(error);
                }
            };
            // Set timeout
            this.responseTimer = setTimeout(() => {
                cleanup();
                reject(new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.TIMEOUT, 'Response timeout'));
            }, this.options.responseTimeout || 5000);
            // Listen for responses
            if (this.parser) {
                this.parser.on('data', onData);
            }
            // Write data
            this.writeQueue.push({
                data: buffer,
                resolve: () => { }, // Resolved by response handler
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
    async processWriteQueue() {
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
            }
            catch (error) {
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
    write(data) {
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
                this.port.drain((error) => {
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
    waitForOpen() {
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
                this.port.removeListener('open', onOpen);
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
    setupEventHandlers() {
        if (!this.port)
            return;
        this.port.on('data', (data) => {
            this.stats.bytesRead += data.length;
            const now = Date.now();
            if (this.lastWrite) {
                const timeDiff = now - this.lastWrite;
                this.stats.readSpeed = data.length / (timeDiff / 1000);
            }
        });
        this.port.on('error', (error) => {
            this.handleError(error);
        });
        this.port.on('close', () => {
            this.handleDisconnect();
        });
    }
    /**
     * Configure flow control
     */
    async configureFlowControl() {
        if (!this.port || !this.options.flowControl?.enabled)
            return;
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
    async handleFlowControl() {
        if (!this.options.flowControl?.enabled)
            return;
        const { throttleWatermark } = this.options.flowControl;
        if (!throttleWatermark)
            return;
        // Simple delay based on buffer fullness
        const bufferLength = this.port?.writableLength || 0;
        if (bufferLength > throttleWatermark) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    /**
     * Clear timers
     */
    clearTimers() {
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
    handleDisconnect() {
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
    handleError(error) {
        this.stats.errors++;
        this.stats.lastError = error;
        super.handleError(error);
    }
    /**
     * Get connection statistics
     */
    getStats() {
        return { ...this.stats };
    }
}
exports.SerialProtocol = SerialProtocol;
//# sourceMappingURL=SerialProtocol.js.map