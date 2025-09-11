"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XRControllerProtocol = void 0;
const BLEProtocol_1 = require("./BLEProtocol");
class XRControllerProtocol extends BLEProtocol_1.BLEProtocol {
    constructor(deviceId, controllerType) {
        super(deviceId);
        this.info = {
            id: deviceId,
            name: `${controllerType.toUpperCase()} Controller`,
            protocol: 'xr',
            manufacturer: this.getManufacturer(controllerType),
            model: controllerType,
            controllerType,
            trackingType: this.getTrackingType(controllerType),
            degreesOfFreedom: this.getDoF(controllerType),
            hapticCapabilities: this.getHapticCapabilities(controllerType),
            capabilities: [
                'vibrate',
                'pattern',
                'continuous',
                'frequency',
                'amplitude'
            ]
        };
        this.status = {
            connected: false,
            lastSeen: new Date(),
            hapticState: {
                active: false,
                frequency: 0,
                amplitude: 0
            },
            batteryLevel: 100,
            trackingState: 'not-tracked'
        };
    }
    async connect() {
        await super.connect();
        // Subscribe to battery and tracking notifications
        await this.subscribe(XRControllerProtocol.BATTERY_UUID);
        await this.subscribe(XRControllerProtocol.TRACKING_UUID);
        // Get initial status
        await this.updateStatus();
    }
    async disconnect() {
        this.stopActivePattern();
        await super.disconnect();
    }
    async sendCommand(command) {
        if (!this.status.connected) {
            throw new Error('Device not connected');
        }
        switch (command.type) {
            case 'vibrate':
                await this.vibrate(command.frequency || 160, command.amplitude || 1.0, command.duration || 100);
                break;
            case 'pattern':
                if (!command.pattern) {
                    throw new Error('Pattern not specified');
                }
                await this.playPattern(command.pattern);
                break;
            case 'stop':
                await this.stop();
                break;
            default:
                throw new Error(`Unknown command type: ${command.type}`);
        }
        this.status.lastSeen = new Date();
    }
    async vibrate(frequency, amplitude, duration) {
        this.validateHapticParameters(frequency, amplitude);
        const buffer = this.encodeHapticCommand(frequency, amplitude);
        await this.writeCharacteristic(XRControllerProtocol.HAPTIC_UUID, buffer);
        this.status.hapticState = {
            active: true,
            frequency,
            amplitude
        };
        // Stop after duration
        setTimeout(() => this.stop(), duration);
    }
    async playPattern(pattern) {
        if (!pattern || !pattern.points.length) {
            throw new Error('Invalid pattern');
        }
        this.stopActivePattern();
        const playPoint = async (index) => {
            const point = pattern.points[index];
            await this.vibrate(point.frequency, point.amplitude, point.duration);
            // Schedule next point
            const nextIndex = (index + 1) % pattern.points.length;
            if (nextIndex !== 0 || pattern.repeat !== undefined) {
                this.activePattern = setTimeout(() => playPoint(nextIndex), point.duration);
            }
        };
        await playPoint(0);
    }
    async stop() {
        this.stopActivePattern();
        const buffer = this.encodeHapticCommand(0, 0);
        await this.writeCharacteristic(XRControllerProtocol.HAPTIC_UUID, buffer);
        this.status.hapticState = {
            active: false,
            frequency: 0,
            amplitude: 0
        };
    }
    stopActivePattern() {
        if (this.activePattern) {
            clearTimeout(this.activePattern);
            this.activePattern = undefined;
        }
    }
    validateHapticParameters(frequency, amplitude) {
        const { hapticCapabilities } = this.info;
        if (frequency < hapticCapabilities.frequency.min ||
            frequency > hapticCapabilities.frequency.max) {
            throw new Error(`Frequency must be between ${hapticCapabilities.frequency.min} and ` +
                `${hapticCapabilities.frequency.max}`);
        }
        if (amplitude < hapticCapabilities.amplitude.min ||
            amplitude > hapticCapabilities.amplitude.max) {
            throw new Error(`Amplitude must be between ${hapticCapabilities.amplitude.min} and ` +
                `${hapticCapabilities.amplitude.max}`);
        }
    }
    encodeHapticCommand(frequency, amplitude) {
        // Command format varies by controller type
        const buffer = Buffer.alloc(8);
        switch (this.info.controllerType) {
            case 'index':
                // Valve Index format
                buffer.writeUInt16LE(Math.round(frequency), 0);
                buffer.writeFloatLE(amplitude, 2);
                break;
            case 'oculus':
                // Oculus format
                buffer.writeUInt8(Math.round(amplitude * 255), 0);
                buffer.writeUInt16LE(Math.round(frequency), 1);
                break;
            case 'vive':
            case 'wmr':
                // Simple format
                buffer.writeUInt8(Math.round(amplitude * 100), 0);
                break;
        }
        return buffer;
    }
    async updateStatus() {
        // Read battery level
        const batteryData = await this.readCharacteristic(XRControllerProtocol.BATTERY_UUID);
        this.status.batteryLevel = batteryData.readUInt8(0);
        // Read tracking state
        const trackingData = await this.readCharacteristic(XRControllerProtocol.TRACKING_UUID);
        this.status.trackingState = this.decodeTrackingState(trackingData);
    }
    decodeTrackingState(data) {
        switch (data.readUInt8(0)) {
            case 0: return 'not-tracked';
            case 1: return 'limited';
            case 2: return 'tracked';
            default: return 'not-tracked';
        }
    }
    getInfo() {
        return { ...this.info };
    }
    getStatus() {
        return { ...this.status };
    }
    getManufacturer(type) {
        switch (type) {
            case 'index': return 'Valve Corporation';
            case 'oculus': return 'Meta';
            case 'vive': return 'HTC';
            case 'wmr': return 'Microsoft';
            default: return 'Unknown';
        }
    }
    getTrackingType(type) {
        switch (type) {
            case 'index':
            case 'vive':
                return 'outside-in';
            case 'oculus':
            case 'wmr':
                return 'inside-out';
            default:
                return 'inside-out';
        }
    }
    getDoF(type) {
        switch (type) {
            case 'index':
            case 'oculus':
            case 'vive':
                return 6;
            case 'wmr':
                return 6;
            default:
                return 3;
        }
    }
    getHapticCapabilities(type) {
        switch (type) {
            case 'index':
                return {
                    frequency: { min: 0, max: 1000 },
                    amplitude: { min: 0, max: 1.0 },
                    patterns: true,
                    continuous: true
                };
            case 'oculus':
                return {
                    frequency: { min: 0, max: 320 },
                    amplitude: { min: 0, max: 1.0 },
                    patterns: true,
                    continuous: false
                };
            case 'vive':
                return {
                    frequency: { min: 0, max: 160 },
                    amplitude: { min: 0, max: 1.0 },
                    patterns: true,
                    continuous: true
                };
            case 'wmr':
                return {
                    frequency: { min: 0, max: 100 },
                    amplitude: { min: 0, max: 1.0 },
                    patterns: false,
                    continuous: false
                };
            default:
                return {
                    frequency: { min: 0, max: 100 },
                    amplitude: { min: 0, max: 1.0 },
                    patterns: false,
                    continuous: false
                };
        }
    }
    handleNotification(uuid, data) {
        switch (uuid) {
            case XRControllerProtocol.BATTERY_UUID:
                this.status.batteryLevel = data.readUInt8(0);
                break;
            case XRControllerProtocol.TRACKING_UUID:
                this.status.trackingState = this.decodeTrackingState(data);
                break;
        }
        this.emit('statusChanged', this.status);
    }
}
exports.XRControllerProtocol = XRControllerProtocol;
// Service UUIDs for different XR controllers
XRControllerProtocol.SERVICE_UUIDS = {
    index: '28be4a4c-35c9-4687-9a83-2f7f1c1f1a7d',
    oculus: 'fb1b0000-4747-4836-9c4e-faf5be6e6c04',
    vive: '0000180a-0000-1000-8000-00805f9b34fb',
    wmr: '181c0000-0000-1000-8000-00805f9b34fb'
};
// Characteristic UUIDs
XRControllerProtocol.HAPTIC_UUID = '00001525-1212-efde-1523-785feabcd123';
XRControllerProtocol.BATTERY_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
XRControllerProtocol.TRACKING_UUID = '00001526-1212-efde-1523-785feabcd123';
//# sourceMappingURL=XRControllerProtocol.js.map