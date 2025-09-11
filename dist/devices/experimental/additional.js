"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoveLifeDevice = exports.HicooDevice = exports.SatisfyerDevice = exports.VibeaseDevice = exports.TENSDevice = exports.TCodeDevice = exports.PiShockDevice = void 0;
exports.createAdditionalDevice = createAdditionalDevice;
const events_1 = require("events");
const Logger_1 = require("../../utils/Logger");
const monitoring_1 = require("../../monitoring");
/**
 * PiShock device support
 */
class PiShockDevice extends events_1.EventEmitter {
    constructor(info, serverUrl) {
        super();
        this.info = info;
        this.serverUrl = serverUrl;
        this.socket = null;
        this.apiKey = null;
        this.connected = false;
        this.handleMessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                switch (message.type) {
                    case 'feedback':
                        this.emit('feedback', message.data);
                        break;
                    case 'error':
                        this.handleError(message.error);
                        break;
                }
            }
            catch (error) {
                this.logger.error('Error handling PiShock message', {
                    error,
                    data: event.data
                });
            }
        };
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
    }
    async connect() {
        try {
            // Authenticate with PiShock API
            const authResponse = await fetch(`${this.serverUrl}/auth`, {
                method: 'POST',
                body: JSON.stringify({ deviceId: this.info.id })
            });
            const { key } = await authResponse.json();
            this.apiKey = key;
            // Connect WebSocket
            this.socket = new WebSocket(`${this.serverUrl}/ws?key=${key}`);
            await new Promise((resolve, reject) => {
                this.socket.onopen = resolve;
                this.socket.onerror = reject;
            });
            this.socket.onmessage = this.handleMessage;
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to PiShock device', { error });
            throw error;
        }
    }
    async disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.apiKey = null;
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    isConnected() {
        return this.connected;
    }
    async sendCommand(command) {
        if (!this.socket || !this.connected) {
            throw new Error('Device not connected');
        }
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            await this.sendShockCommand(command);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    handleError(error) {
        this.logger.error('PiShock error', { error });
        this.monitor.onError(new Error(error.message), error);
    }
    async sendShockCommand(command) {
        // Convert library command to PiShock format
        const shockCommand = {
            type: command.type,
            intensity: command.params?.intensity || 0,
            duration: command.params?.duration || 1000
        };
        this.socket.send(JSON.stringify(shockCommand));
    }
}
exports.PiShockDevice = PiShockDevice;
/**
 * TCode-compatible device support
 */
class TCodeDevice extends events_1.EventEmitter {
    constructor(info, baudRate = 115200) {
        super();
        this.info = info;
        this.baudRate = baudRate;
        this.connected = false;
        this.axisPositions = new Map();
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
    }
    async connect() {
        try {
            const port = await navigator.serial.requestPort({
                filters: [{ usbVendorId: 0x0483 }] // Example vendor ID
            });
            await port.open({ baudRate: this.baudRate });
            this.serial = port;
            // Set up serial reader
            this.startReading();
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to TCode device', { error });
            throw error;
        }
    }
    async disconnect() {
        if (this.serial) {
            await this.serial.close();
            this.serial = null;
        }
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    isConnected() {
        return this.connected;
    }
    async sendCommand(command) {
        if (!this.serial || !this.connected) {
            throw new Error('Device not connected');
        }
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            await this.sendTCode(this.convertToTCode(command));
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    async startReading() {
        const reader = this.serial.readable.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value);
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    this.handleResponse(line.trim());
                }
            }
        }
        catch (error) {
            this.logger.error('Error reading from TCode device', { error });
        }
        finally {
            reader.releaseLock();
        }
    }
    handleResponse(response) {
        if (response.startsWith('P')) {
            // Position update
            const matches = response.match(/P(\d+)=(\d+)/);
            if (matches) {
                const [_, axis, position] = matches;
                this.axisPositions.set(axis, parseInt(position));
                this.emit('position', { axis, position: parseInt(position) });
            }
        }
    }
    convertToTCode(command) {
        // Convert library command to TCode format
        let tcode = '';
        switch (command.type) {
            case 'move':
                const { axis, position, speed } = command.params;
                tcode = `${axis}${position}S${speed || 1000}`;
                break;
            case 'vibrate':
                const { intensity } = command.params;
                tcode = `V${Math.floor(intensity * 9)}`;
                break;
            // Add more command types as needed
        }
        return tcode;
    }
    async sendTCode(tcode) {
        const encoder = new TextEncoder();
        const writer = this.serial.writable.getWriter();
        try {
            await writer.write(encoder.encode(tcode + '\n'));
        }
        finally {
            writer.releaseLock();
        }
    }
}
exports.TCodeDevice = TCodeDevice;
/**
 * Bluetooth TENS unit support
 */
class TENSDevice extends events_1.EventEmitter {
    constructor(info) {
        super();
        this.info = info;
        this.connected = false;
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
    }
    async connect() {
        try {
            // Request Bluetooth device with appropriate service UUID
            this.btDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['00001523-1212-efde-1523-785feabcd123'] } // Example UUID
                ]
            });
            const server = await this.btDevice.gatt.connect();
            this.service = await server.getPrimaryService('00001523-1212-efde-1523-785feabcd123');
            this.characteristic = await this.service.getCharacteristic('00001524-1212-efde-1523-785feabcd123');
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to TENS device', { error });
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
    isConnected() {
        return this.connected;
    }
    async sendCommand(command) {
        if (!this.connected || !this.characteristic) {
            throw new Error('Device not connected');
        }
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            await this.sendTENSCommand(command);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    async sendTENSCommand(command) {
        // Convert library command to TENS protocol format
        const data = new Uint8Array(4);
        switch (command.type) {
            case 'intensity':
                const { channel, level } = command.params;
                data[0] = 0x01; // Intensity command
                data[1] = channel;
                data[2] = Math.floor(level * 100);
                data[3] = this.calculateChecksum(data.slice(0, 3));
                break;
            case 'mode':
                const { mode } = command.params;
                data[0] = 0x02; // Mode command
                data[1] = mode;
                data[2] = 0x00;
                data[3] = this.calculateChecksum(data.slice(0, 3));
                break;
        }
        await this.characteristic.writeValue(data);
    }
    calculateChecksum(data) {
        return data.reduce((sum, byte) => sum ^ byte, 0);
    }
}
exports.TENSDevice = TENSDevice;
/**
 * Vibease device support
 */
class VibeaseDevice extends events_1.EventEmitter {
    constructor(info) {
        super();
        this.info = info;
        this.connected = false;
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
    }
    async connect() {
        try {
            this.btDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'Vibease' }
                ],
                optionalServices: ['f0006900-110c-478b-b74b-6f403b364a9c']
            });
            const server = await this.btDevice.gatt.connect();
            const service = await server.getPrimaryService('f0006900-110c-478b-b74b-6f403b364a9c');
            this.characteristic = await service.getCharacteristic('f0006901-110c-478b-b74b-6f403b364a9c');
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to Vibease device', { error });
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
    isConnected() {
        return this.connected;
    }
    async sendCommand(command) {
        if (!this.connected || !this.characteristic) {
            throw new Error('Device not connected');
        }
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            await this.sendVibeaseCommand(command);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    async sendVibeaseCommand(command) {
        const data = new Uint8Array(20);
        data[0] = 0xAA; // Header
        data[1] = 0x55;
        switch (command.type) {
            case 'vibrate':
                const { intensity } = command.params;
                data[2] = 0x01; // Vibrate command
                data[3] = Math.floor(intensity * 20); // 0-20 range
                break;
            case 'pattern':
                const { pattern } = command.params;
                data[2] = 0x02; // Pattern command
                data[3] = pattern;
                break;
        }
        // Calculate checksum (simple XOR)
        data[19] = data.slice(0, 19).reduce((a, b) => a ^ b);
        await this.characteristic.writeValue(data);
    }
}
exports.VibeaseDevice = VibeaseDevice;
/**
 * Satisfyer Connect device support
 */
class SatisfyerDevice extends events_1.EventEmitter {
    constructor(info) {
        super();
        this.info = info;
        this.characteristics = new Map();
        this.connected = false;
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
    }
    async connect() {
        try {
            this.btDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'Satisfyer' }
                ],
                optionalServices: [SatisfyerDevice.SERVICE_UUID]
            });
            const server = await this.btDevice.gatt.connect();
            const service = await server.getPrimaryService(SatisfyerDevice.SERVICE_UUID);
            // Get all required characteristics
            const characteristics = await Promise.all([
                service.getCharacteristic(SatisfyerDevice.VIBRATION_UUID),
                service.getCharacteristic(SatisfyerDevice.AIR_UUID),
                service.getCharacteristic(SatisfyerDevice.BATTERY_UUID)
            ]);
            this.characteristics.set('vibration', characteristics[0]);
            this.characteristics.set('air', characteristics[1]);
            this.characteristics.set('battery', characteristics[2]);
            // Set up battery level notifications
            await characteristics[2].startNotifications();
            characteristics[2].addEventListener('characteristicvaluechanged', this.handleBatteryChange.bind(this));
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to Satisfyer device', { error });
            throw error;
        }
    }
    async disconnect() {
        if (this.btDevice?.gatt.connected) {
            const battery = this.characteristics.get('battery');
            if (battery) {
                await battery.stopNotifications();
            }
            await this.btDevice.gatt.disconnect();
        }
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    isConnected() {
        return this.connected;
    }
    async sendCommand(command) {
        if (!this.connected) {
            throw new Error('Device not connected');
        }
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            await this.sendSatisfyerCommand(command);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    async sendSatisfyerCommand(command) {
        switch (command.type) {
            case 'vibration':
                const vibChar = this.characteristics.get('vibration');
                if (!vibChar)
                    throw new Error('Vibration characteristic not available');
                const { intensity } = command.params;
                await vibChar.writeValue(new Uint8Array([
                    Math.floor(intensity * 100)
                ]));
                break;
            case 'air':
                const airChar = this.characteristics.get('air');
                if (!airChar)
                    throw new Error('Air characteristic not available');
                const { pressure, frequency } = command.params;
                await airChar.writeValue(new Uint8Array([
                    Math.floor(pressure * 100),
                    Math.floor(frequency * 100)
                ]));
                break;
            default:
                throw new Error(`Unsupported command type: ${command.type}`);
        }
    }
    handleBatteryChange(event) {
        const value = event.target.value.getUint8(0);
        this.emit('battery', { level: value });
    }
}
exports.SatisfyerDevice = SatisfyerDevice;
// Satisfyer service/characteristic UUIDs
SatisfyerDevice.SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
SatisfyerDevice.VIBRATION_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';
SatisfyerDevice.AIR_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';
SatisfyerDevice.BATTERY_UUID = '0000fff3-0000-1000-8000-00805f9b34fb';
/**
 * Hicoo/Hi-Link device support
 */
class HicooDevice extends events_1.EventEmitter {
    constructor(info) {
        super();
        this.info = info;
        this.connected = false;
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
    }
    async connect() {
        try {
            this.btDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'Hi-' }
                ],
                optionalServices: ['0000180a-0000-1000-8000-00805f9b34fb']
            });
            const server = await this.btDevice.gatt.connect();
            const service = await server.getPrimaryService('0000180a-0000-1000-8000-00805f9b34fb');
            this.characteristic = await service.getCharacteristic('00002a1c-0000-1000-8000-00805f9b34fb');
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to Hicoo device', { error });
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
    isConnected() {
        return this.connected;
    }
    async sendCommand(command) {
        if (!this.connected || !this.characteristic) {
            throw new Error('Device not connected');
        }
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            await this.sendHicooCommand(command);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    async sendHicooCommand(command) {
        // Hicoo protocol uses 20-byte packets
        const packet = new Uint8Array(20);
        packet[0] = 0xAA; // Header
        switch (command.type) {
            case 'vibrate':
                const { motor, intensity } = command.params;
                packet[1] = 0x01; // Vibrate command
                packet[2] = motor;
                packet[3] = Math.floor(intensity * 100);
                break;
            case 'rotate':
                const { direction, speed } = command.params;
                packet[1] = 0x02; // Rotate command
                packet[2] = direction === 'clockwise' ? 0x01 : 0x02;
                packet[3] = Math.floor(speed * 100);
                break;
            case 'heat':
                const { temperature } = command.params;
                packet[1] = 0x03; // Heat command
                packet[2] = Math.floor(temperature);
                break;
        }
        // Add checksum
        packet[19] = this.calculateChecksum(packet);
        await this.characteristic.writeValue(packet);
    }
    calculateChecksum(data) {
        return data.slice(0, 19).reduce((sum, byte) => sum ^ byte, 0);
    }
}
exports.HicooDevice = HicooDevice;
/**
 * LoveLife Krush/Apex device support
 */
class LoveLifeDevice extends events_1.EventEmitter {
    constructor(info) {
        super();
        this.info = info;
        this.connected = false;
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
    }
    async connect() {
        try {
            this.btDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'Krush' },
                    { namePrefix: 'Apex' }
                ],
                optionalServices: ['f000aa00-0451-4000-b000-000000000000']
            });
            const server = await this.btDevice.gatt.connect();
            const service = await server.getPrimaryService('f000aa00-0451-4000-b000-000000000000');
            this.characteristic = await service.getCharacteristic('f000aa01-0451-4000-b000-000000000000');
            // Set up notifications for pressure readings
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', this.handlePressureReading.bind(this));
            this.connected = true;
            this.monitor.onConnect();
            this.emit('connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to LoveLife device', { error });
            throw error;
        }
    }
    async disconnect() {
        if (this.btDevice?.gatt.connected) {
            if (this.characteristic) {
                await this.characteristic.stopNotifications();
            }
            await this.btDevice.gatt.disconnect();
        }
        this.connected = false;
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    isConnected() {
        return this.connected;
    }
    async sendCommand(command) {
        if (!this.connected || !this.characteristic) {
            throw new Error('Device not connected');
        }
        const startTime = Date.now();
        try {
            this.monitor.onCommandStart(command.type);
            await this.sendLoveLifeCommand(command);
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
        }
        catch (error) {
            this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error);
            throw error;
        }
    }
    async sendLoveLifeCommand(command) {
        const data = new Uint8Array(4);
        switch (command.type) {
            case 'vibrate':
                const { intensity } = command.params;
                data[0] = 0x01; // Vibrate command
                data[1] = Math.floor(intensity * 100);
                break;
            case 'exercise':
                const { mode } = command.params;
                data[0] = 0x02; // Exercise mode command
                data[1] = mode;
                break;
            case 'sensitivity':
                const { level } = command.params;
                data[0] = 0x03; // Sensitivity command
                data[1] = level;
                break;
        }
        await this.characteristic.writeValue(data);
    }
    handlePressureReading(event) {
        const value = event.target.value;
        const pressure = value.getUint16(0, true); // Little-endian
        this.emit('pressure', { value: pressure });
    }
}
exports.LoveLifeDevice = LoveLifeDevice;
// Update the experimental device factory
function createAdditionalDevice(type, info, options = {}) {
    switch (type.toLowerCase()) {
        case 'pishock':
            return new PiShockDevice(info, options.serverUrl);
        case 'tcode':
            return new TCodeDevice(info, options.baudRate);
        case 'tens':
            return new TENSDevice(info);
        case 'vibease':
            return new VibeaseDevice(info);
        case 'satisfyer':
            return new SatisfyerDevice(info);
        case 'hicoo':
            return new HicooDevice(info);
        case 'lovelife':
            return new LoveLifeDevice(info);
        default:
            throw new Error(`Unknown additional device type: ${type}`);
    }
}
//# sourceMappingURL=additional.js.map