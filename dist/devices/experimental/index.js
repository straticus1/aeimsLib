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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandyDevice = exports.MaxDevice = exports.OSRDevice = exports.GamepadDevice = exports.VorzeDevice = exports.SvakomDevice = void 0;
exports.createExperimentalDevice = createExperimentalDevice;
const events_1 = require("events");
const Logger_1 = require("../../utils/Logger");
const monitoring_1 = require("../../monitoring");
/**
 * Base class for experimental device support
 */
class ExperimentalDevice extends events_1.EventEmitter {
    constructor(info) {
        super();
        this.info = info;
        this.connected = false;
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
    }
    isConnected() {
        return this.connected;
    }
}
/**
 * Svakom device support
 */
class SvakomDevice extends ExperimentalDevice {
    async connect() {
        try {
            // Request Bluetooth device
            this.btDevice = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'Svakom' }],
                optionalServices: ['device_info', 'battery_service']
            });
            await this.btDevice.gatt.connect();
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to Svakom device', { error });
            throw error;
        }
    }
    async disconnect() {
        if (this.btDevice?.gatt.connected) {
            await this.btDevice.gatt.disconnect();
        }
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    async sendCommand(command) {
        const startTime = Date.now();
        try {
            // Implementation specific to Svakom protocol
            // Command structure varies by model
            this.monitor.onCommandStart(command.type);
            await this._sendRawCommand(command);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    async _sendRawCommand(command) {
        // Implement Svakom-specific command protocol
    }
}
exports.SvakomDevice = SvakomDevice;
/**
 * Vorze device support
 */
class VorzeDevice extends ExperimentalDevice {
    constructor(info, serverUrl) {
        super(info);
        this.socket = null;
        this.serverUrl = serverUrl;
    }
    async connect() {
        try {
            this.socket = new WebSocket(this.serverUrl);
            await new Promise((resolve, reject) => {
                this.socket.onopen = resolve;
                this.socket.onerror = reject;
            });
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to Vorze device', { error });
            throw error;
        }
    }
    async disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    async sendCommand(command) {
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            // Implement Vorze-specific command protocol
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
}
exports.VorzeDevice = VorzeDevice;
/**
 * XInput/DirectInput device support
 */
class GamepadDevice extends ExperimentalDevice {
    constructor() {
        super(...arguments);
        this.gamepad = null;
        this.updateInterval = null;
        this.handleGamepadConnect = (event) => {
            const { gamepad } = event;
            if (this.isCompatibleGamepad(gamepad)) {
                this.gamepad = gamepad;
                this.connected = true;
                this.monitor.onConnect();
                this.emit('connected');
                // Start polling gamepad state
                this.updateInterval = setInterval(() => this.updateState(), 50);
            }
        };
        this.handleGamepadDisconnect = (event) => {
            if (event.gamepad.id === this.gamepad?.id) {
                this.disconnect();
            }
        };
    }
    async connect() {
        try {
            // Listen for gamepad connection
            window.addEventListener('gamepadconnected', this.handleGamepadConnect);
            window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnect);
            // Check if gamepad is already connected
            const gamepads = navigator.getGamepads();
            for (const gamepad of gamepads) {
                if (gamepad && this.isCompatibleGamepad(gamepad)) {
                    this.handleGamepadConnect({ gamepad });
                    break;
                }
            }
        }
        catch (error) {
            this.logger.error('Failed to initialize gamepad device', { error });
            throw error;
        }
    }
    async disconnect() {
        window.removeEventListener('gamepadconnected', this.handleGamepadConnect);
        window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnect);
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.gamepad = null;
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    async sendCommand(command) {
        // Gamepad devices are input-only
        throw new Error('Gamepad devices do not support direct commands');
    }
    isCompatibleGamepad(gamepad) {
        // Check if gamepad matches supported devices
        return true; // Implement actual compatibility check
    }
    updateState() {
        if (!this.gamepad)
            return;
        // Read gamepad state and emit events
        const gamepad = navigator.getGamepads()[this.gamepad.index];
        if (gamepad) {
            this.emit('state', {
                buttons: gamepad.buttons.map(b => b.value),
                axes: gamepad.axes
            });
        }
    }
}
exports.GamepadDevice = GamepadDevice;
/**
 * OSR/OpenSexRouter device support
 */
class OSRDevice extends ExperimentalDevice {
    constructor(info, serverUrl) {
        super(info);
        this.socket = null;
        this.handleMessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                // Handle different message types
                switch (message.type) {
                    case 'state':
                        this.emit('state', message.data);
                        break;
                    case 'error':
                        this.handleError(message.error);
                        break;
                }
            }
            catch (error) {
                this.logger.error('Error handling OSR message', { error, data: event.data });
            }
        };
        this.serverUrl = serverUrl;
    }
    async connect() {
        try {
            this.socket = new WebSocket(this.serverUrl);
            await new Promise((resolve, reject) => {
                this.socket.onopen = resolve;
                this.socket.onerror = reject;
            });
            // Set up message handling
            this.socket.onmessage = this.handleMessage;
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to OSR server', { error });
            throw error;
        }
    }
    async disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    async sendCommand(command) {
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            // Convert command to OSR format
            const osrCommand = this.convertToOSRCommand(command);
            await this.sendOSRCommand(osrCommand);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    handleError(error) {
        this.logger.error('OSR error', { error });
        this.monitor.onError(new Error(error.message), error);
    }
    convertToOSRCommand(command) {
        // Convert library command format to OSR format
        return {
            type: command.type,
            params: command.params
        };
    }
    async sendOSRCommand(command) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('OSR connection not ready');
        }
        this.socket.send(JSON.stringify(command));
    }
}
exports.OSRDevice = OSRDevice;
/**
 * MaxPro/Max2 device support
 */
class MaxDevice extends ExperimentalDevice {
    constructor() {
        super(...arguments);
        this.handleNotification = (event) => {
            const value = event.target.value;
            // Process notification data
            // Emit state changes, battery updates, etc.
        };
    }
    async connect() {
        try {
            // Request Bluetooth device
            this.btDevice = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'MaxPro' }],
                optionalServices: ['device_control', 'battery_service']
            });
            const server = await this.btDevice.gatt.connect();
            const service = await server.getPrimaryService('device_control');
            // Get command and notification characteristics
            this.characteristic = await service.getCharacteristic('command');
            this.notifyCharacteristic = await service.getCharacteristic('notify');
            // Set up notifications
            await this.notifyCharacteristic.startNotifications();
            this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification);
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to Max device', { error });
            throw error;
        }
    }
    async disconnect() {
        try {
            if (this.notifyCharacteristic) {
                await this.notifyCharacteristic.stopNotifications();
            }
            if (this.btDevice?.gatt.connected) {
                await this.btDevice.gatt.disconnect();
            }
        }
        finally {
            this.characteristic = null;
            this.notifyCharacteristic = null;
            this.btDevice = null;
            this.connected = false;
            this.monitor.onDisconnect();
            this.emit('disconnected');
        }
    }
    async sendCommand(command) {
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            // Convert and send command
            const data = this.convertToMaxCommand(command);
            await this.characteristic.writeValue(data);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    convertToMaxCommand(command) {
        // Convert library command format to Max protocol format
        // Implementation varies by model/firmware
        return new Uint8Array([ /* command bytes */]);
    }
}
exports.MaxDevice = MaxDevice;
/**
 * Handy/Stroker device support
 */
class HandyDevice extends ExperimentalDevice {
    constructor(info, serverUrl) {
        super(info);
        this.socket = null;
        this.connectionToken = null;
        this.handleMessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                switch (message.type) {
                    case 'state':
                        this.emit('state', message.data);
                        break;
                    case 'error':
                        this.handleError(message.error);
                        break;
                }
            }
            catch (error) {
                this.logger.error('Error handling Handy message', { error, data: event.data });
            }
        };
        this.serverUrl = serverUrl;
    }
    async connect() {
        try {
            // Authenticate with Handy server
            const authResponse = await fetch(`${this.serverUrl}/auth`, {
                method: 'POST',
                body: JSON.stringify({ deviceId: this.info.id })
            });
            const { token } = await authResponse.json();
            this.connectionToken = token;
            // Connect WebSocket
            this.socket = new WebSocket(`${this.serverUrl}/ws?token=${token}`);
            await new Promise((resolve, reject) => {
                this.socket.onopen = resolve;
                this.socket.onerror = reject;
            });
            // Set up message handling
            this.socket.onmessage = this.handleMessage;
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to Handy device', { error });
            throw error;
        }
    }
    async disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connectionToken = null;
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    async sendCommand(command) {
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            // Convert and send command
            const handyCommand = this.convertToHandyCommand(command);
            await this.sendHandyCommand(handyCommand);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    handleError(error) {
        this.logger.error('Handy error', { error });
        this.monitor.onError(new Error(error.message), error);
    }
    convertToHandyCommand(command) {
        // Convert library command format to Handy protocol format
        return {
            cmd: command.type,
            params: command.params
        };
    }
    async sendHandyCommand(command) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('Handy connection not ready');
        }
        this.socket.send(JSON.stringify(command));
    }
}
exports.HandyDevice = HandyDevice;
__exportStar(require("./additional"), exports);
// Device factory function
async function createExperimentalDevice(type, info, options = {}) {
    switch (type.toLowerCase()) {
        case 'svakom':
            return new SvakomDevice(info);
        case 'vorze':
            return new VorzeDevice(info, options.serverUrl);
        case 'gamepad':
            return new GamepadDevice(info);
        case 'osr':
            return new OSRDevice(info, options.serverUrl);
        case 'max':
            return new MaxDevice(info);
        case 'handy':
            return new HandyDevice(info, options.serverUrl);
        default:
            throw new Error(`Unknown experimental device type: ${type}`);
    }
}
//# sourceMappingURL=index.js.map