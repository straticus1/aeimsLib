"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketProtocol = void 0;
const ws_1 = __importDefault(require("ws"));
const BaseProtocolAdapter_1 = require("./BaseProtocolAdapter");
const device_1 = require("../interfaces/device");
class WebSocketProtocol extends BaseProtocolAdapter_1.BaseProtocolAdapter {
    constructor(config) {
        super();
        this.ws = null;
        this.config = config;
        this.reconnectAttempts = 0;
    }
    async connect() {
        if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
            return;
        }
        return new Promise((resolve, reject) => {
            try {
                this.ws = new ws_1.default(this.config.url);
                this.ws.on('open', () => {
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.startPingTimer();
                    this.emitEvent({
                        type: device_1.DeviceEventType.CONNECTED,
                        deviceId: 'ws', // This should be set in the implementing class
                        timestamp: new Date()
                    });
                    resolve();
                });
                this.ws.on('message', async (data) => {
                    try {
                        const message = await this.decryptResponse(data);
                        await this.handleMessage(message);
                    }
                    catch (error) {
                        this.logger.error(`Failed to handle message: ${error}`);
                    }
                });
                this.ws.on('close', () => {
                    this.handleDisconnect();
                });
                this.ws.on('error', (error) => {
                    this.logger.error(`WebSocket error: ${error}`);
                    this.handleDisconnect();
                    reject(error);
                });
                this.ws.on('pong', () => {
                    if (this.pingTimeout) {
                        clearTimeout(this.pingTimeout);
                        this.pingTimeout = undefined;
                    }
                });
            }
            catch (error) {
                this.logger.error(`Failed to create WebSocket: ${error}`);
                this.handleDisconnect();
                reject(error);
            }
        });
    }
    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.stopPingTimer();
        this.connected = false;
    }
    async sendCommand(command) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            return this.createCommandResult(false, command, 'WebSocket not connected');
        }
        try {
            const data = await this.encryptCommand(command);
            return new Promise((resolve, reject) => {
                this.ws.send(data, (error) => {
                    if (error) {
                        this.logger.error(`Failed to send command: ${error}`);
                        resolve(this.createCommandResult(false, command, String(error)));
                    }
                    else {
                        resolve(this.createCommandResult(true, command));
                    }
                });
            });
        }
        catch (error) {
            this.logger.error(`Failed to send command: ${error}`);
            return this.createCommandResult(false, command, String(error));
        }
    }
    startPingTimer() {
        this.stopPingTimer();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
                this.ws.ping();
                this.pingTimeout = setTimeout(() => {
                    this.logger.warn('Ping timeout - reconnecting');
                    this.handleDisconnect();
                }, this.config.pingTimeout);
            }
        }, this.config.pingInterval);
    }
    stopPingTimer() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = undefined;
        }
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = undefined;
        }
    }
    handleDisconnect() {
        this.connected = false;
        this.stopPingTimer();
        this.emitEvent({
            type: device_1.DeviceEventType.DISCONNECTED,
            deviceId: 'ws', // This should be set in the implementing class
            timestamp: new Date()
        });
        // Attempt to reconnect if configured
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connect().catch(error => {
                    this.logger.error(`Reconnection attempt failed: ${error}`);
                });
            }, this.config.reconnectInterval);
        }
    }
    async handleMessage(message) {
        // Implement message handling based on your protocol
        // This is a basic example - extend based on your needs
        if (message.type === 'status') {
            await this.emitEvent({
                type: device_1.DeviceEventType.STATUS_CHANGED,
                deviceId: 'ws', // This should be set in the implementing class
                timestamp: new Date(),
                data: message.status
            });
        }
        else if (message.type === 'error') {
            await this.emitEvent({
                type: device_1.DeviceEventType.ERROR,
                deviceId: 'ws', // This should be set in the implementing class
                timestamp: new Date(),
                data: message.error
            });
        }
    }
}
exports.WebSocketProtocol = WebSocketProtocol;
//# sourceMappingURL=WebSocketProtocol.js.map