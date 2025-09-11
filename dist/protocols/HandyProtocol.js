"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandyProtocol = void 0;
const BLEProtocol_1 = require("./BLEProtocol");
class HandyProtocol extends BLEProtocol_1.BLEProtocol {
    constructor(deviceId) {
        super(deviceId);
        this.serverTimeOffset = 0;
        this.info = {
            id: deviceId,
            name: 'TheHandy',
            protocol: 'handy',
            manufacturer: 'Sweet Tech AS',
            model: 'Handy',
            firmwareVersion: '0.0.0',
            serverTimeOffset: 0,
            slideMin: 0,
            slideMax: 100,
            encoderResolution: 3600,
            capabilities: [
                'slide',
                'velocity',
                'position',
                'sync'
            ]
        };
        this.status = {
            connected: false,
            lastSeen: new Date(),
            mode: 'manual',
            position: 0,
            velocity: 0,
            slideMin: 0,
            slideMax: 100
        };
    }
    async connect() {
        await super.connect();
        // Subscribe to status notifications
        await this.subscribe(HandyProtocol.STATUS_UUID);
        // Get initial device info
        await this.updateDeviceInfo();
        // Synchronize time with server
        await this.synchronizeTime();
    }
    async sendCommand(command) {
        if (!this.status.connected) {
            throw new Error('Device not connected');
        }
        const buffer = this.encodeCommand(command);
        await this.writeCharacteristic(HandyProtocol.CONTROL_UUID, buffer);
        this.status.lastSeen = new Date();
    }
    /**
     * Set device mode (automatic, manual, or sync)
     */
    async setMode(mode) {
        await this.sendCommand({ mode });
        this.status.mode = mode;
    }
    /**
     * Set absolute position (0-100)
     */
    async setPosition(position) {
        position = Math.min(Math.max(position, 0), 100);
        await this.sendCommand({ position });
        this.status.position = position;
    }
    /**
     * Set movement velocity (0-100)
     */
    async setVelocity(velocity) {
        velocity = Math.min(Math.max(velocity, 0), 100);
        await this.sendCommand({ velocity });
        this.status.velocity = velocity;
    }
    /**
     * Set stroke length range
     */
    async setStrokeRange(min, max) {
        min = Math.min(Math.max(min, 0), 100);
        max = Math.min(Math.max(max, min), 100);
        await this.sendCommand({
            slideMin: min,
            slideMax: max
        });
        this.status.slideMin = min;
        this.status.slideMax = max;
    }
    /**
     * Send timed movement command for synchronization
     */
    async sendTimedCommand(position, velocity, timestamp) {
        const adjustedTime = timestamp + this.serverTimeOffset;
        const buffer = this.encodeTimedCommand(position, velocity, adjustedTime);
        await this.writeCharacteristic(HandyProtocol.CONTROL_UUID, buffer);
    }
    getInfo() {
        return { ...this.info };
    }
    getStatus() {
        return { ...this.status };
    }
    async updateDeviceInfo() {
        const data = await this.readCharacteristic(HandyProtocol.SETTINGS_UUID);
        const info = this.decodeDeviceInfo(data);
        this.info = {
            ...this.info,
            ...info
        };
        this.status.slideMin = info.slideMin;
        this.status.slideMax = info.slideMax;
    }
    async synchronizeTime() {
        const startTime = Date.now();
        const data = await this.readCharacteristic(HandyProtocol.SETTINGS_UUID);
        const endTime = Date.now();
        const deviceTime = this.decodeDeviceTime(data);
        const localTime = Math.floor((startTime + endTime) / 2);
        this.serverTimeOffset = deviceTime - localTime;
        this.info.serverTimeOffset = this.serverTimeOffset;
    }
    encodeCommand(command) {
        // Command format:
        // Byte 0: Command type
        // Byte 1-4: Value (32-bit float)
        const buffer = Buffer.alloc(5);
        if (command.mode !== undefined) {
            buffer[0] = 0x01;
            buffer.writeUInt32LE(command.mode === 'automatic' ? 1 :
                command.mode === 'sync' ? 2 : 0, 1);
        }
        else if (command.position !== undefined) {
            buffer[0] = 0x02;
            buffer.writeFloatLE(command.position, 1);
        }
        else if (command.velocity !== undefined) {
            buffer[0] = 0x03;
            buffer.writeFloatLE(command.velocity, 1);
        }
        else if (command.slideMin !== undefined && command.slideMax !== undefined) {
            buffer[0] = 0x04;
            buffer.writeUInt16LE(command.slideMin, 1);
            buffer.writeUInt16LE(command.slideMax, 3);
        }
        return buffer;
    }
    encodeTimedCommand(position, velocity, timestamp) {
        const buffer = Buffer.alloc(13);
        buffer[0] = 0x05; // Timed command
        buffer.writeFloatLE(position, 1);
        buffer.writeFloatLE(velocity, 5);
        buffer.writeUInt32LE(timestamp, 9);
        return buffer;
    }
    decodeDeviceInfo(data) {
        return {
            firmwareVersion: `${data[0]}.${data[1]}.${data[2]}`,
            slideMin: data.readUInt16LE(3),
            slideMax: data.readUInt16LE(5),
            encoderResolution: data.readUInt16LE(7)
        };
    }
    decodeDeviceTime(data) {
        return data.readUInt32LE(0);
    }
    handleNotification(uuid, data) {
        if (uuid === HandyProtocol.STATUS_UUID) {
            this.handleStatusNotification(data);
        }
    }
    handleStatusNotification(data) {
        const mode = data[0] === 0 ? 'manual' :
            data[0] === 1 ? 'automatic' : 'sync';
        const position = data.readFloatLE(1);
        const velocity = data.readFloatLE(5);
        this.status = {
            ...this.status,
            mode,
            position,
            velocity,
            lastSeen: new Date()
        };
        this.emit('statusChanged', this.status);
    }
}
exports.HandyProtocol = HandyProtocol;
// TheHandy service UUIDs
HandyProtocol.SERVICE_UUID = '00001524-1212-efde-1523-785feabcd123';
HandyProtocol.CONTROL_UUID = '00001526-1212-efde-1523-785feabcd123';
HandyProtocol.STATUS_UUID = '00001527-1212-efde-1523-785feabcd123';
HandyProtocol.SETTINGS_UUID = '00001528-1212-efde-1523-785feabcd123';
//# sourceMappingURL=HandyProtocol.js.map