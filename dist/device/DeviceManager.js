"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceManager = void 0;
const events_1 = require("events");
const device_1 = require("../interfaces/device");
const PatternFactory_1 = require("../patterns/PatternFactory");
const Logger_1 = require("../utils/Logger");
class DeviceManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.devices = new Map();
        this.protocols = new Map();
        this.patterns = new Map();
        this.logger = Logger_1.Logger.getInstance();
    }
    static getInstance() {
        if (!DeviceManager.instance) {
            DeviceManager.instance = new DeviceManager();
        }
        return DeviceManager.instance;
    }
    setMonitoringService(service) {
        this.monitoring = service;
    }
    registerProtocol(protocol, handler) {
        this.protocols.set(protocol.toLowerCase(), handler);
        this.logger.info(`Protocol registered: ${protocol}`);
    }
    async addDevice(deviceInfo) {
        if (this.devices.has(deviceInfo.id)) {
            throw new Error(`Device ${deviceInfo.id} already exists`);
        }
        const protocol = this.protocols.get(deviceInfo.protocol.toLowerCase());
        if (!protocol) {
            throw new Error(`Unsupported protocol: ${deviceInfo.protocol}`);
        }
        const device = {
            info: deviceInfo,
            status: {
                connected: false,
                lastSeen: new Date(),
            },
            settings: {
                rate_per_minute: 0,
                maxDuration: 3600,
                intensityLimit: 100,
                allowIntensityOverride: false,
                allowedPatterns: ['constant', 'wave', 'pulse', 'escalation']
            }
        };
        this.devices.set(deviceInfo.id, device);
        this.logger.info(`Device added: ${deviceInfo.id}`);
        // Subscribe to device events
        protocol.subscribe((event) => this.handleDeviceEvent(event));
        // Initial connection attempt
        try {
            await protocol.connect();
            this.updateDeviceStatus(deviceInfo.id, { connected: true, lastSeen: new Date() });
        }
        catch (error) {
            this.logger.error(`Failed to connect to device ${deviceInfo.id}: ${error}`);
            this.updateDeviceStatus(deviceInfo.id, { connected: false, lastSeen: new Date(), error: String(error) });
        }
        return device;
    }
    async removeDevice(deviceId) {
        const device = this.getDevice(deviceId);
        const protocol = this.protocols.get(device.info.protocol.toLowerCase());
        if (protocol) {
            await protocol.disconnect();
        }
        this.devices.delete(deviceId);
        this.patterns.delete(deviceId);
        this.logger.info(`Device removed: ${deviceId}`);
    }
    getDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device not found: ${deviceId}`);
        }
        return device;
    }
    getAllDevices() {
        return Array.from(this.devices.values());
    }
    async sendCommand(deviceId, command) {
        const device = this.getDevice(deviceId);
        if (!device.status.connected) {
            throw new Error('Device is not connected');
        }
        const protocol = this.protocols.get(device.info.protocol.toLowerCase());
        if (!protocol) {
            throw new Error(`Protocol not found: ${device.info.protocol}`);
        }
        try {
            // Validate command against device settings
            this.validateCommand(device, command);
            // Send command through protocol
            const result = await protocol.sendCommand(command);
            // Update device state
            if (result.success) {
                device.currentPattern = command.pattern || 'constant';
                device.currentIntensity = command.intensity;
                this.devices.set(deviceId, device);
                // Record metrics
                if (this.monitoring) {
                    this.monitoring.recordMetric('device_command_success', 1, {
                        deviceId,
                        pattern: command.pattern || 'constant'
                    });
                }
            }
            else {
                throw new Error(result.error || 'Command failed');
            }
        }
        catch (error) {
            this.logger.error(`Command failed for device ${deviceId}: ${error}`);
            if (this.monitoring) {
                this.monitoring.recordMetric('device_command_error', 1, {
                    deviceId,
                    error: String(error)
                });
            }
            throw error;
        }
    }
    validateCommand(device, command) {
        // Check intensity limits
        if (command.intensity < 0 || command.intensity > device.settings.intensityLimit) {
            throw new Error(`Intensity ${command.intensity} exceeds device limits`);
        }
        // Check pattern support
        if (command.pattern && !device.settings.allowedPatterns.includes(command.pattern)) {
            throw new Error(`Pattern ${command.pattern} not supported by device`);
        }
        // Validate pattern-specific parameters
        if (command.pattern && command.pattern !== 'constant') {
            const patternFactory = PatternFactory_1.DefaultPatternFactory.getInstance();
            if (!patternFactory.validatePattern(command.pattern, {
                name: command.pattern,
                minIntensity: 0,
                maxIntensity: device.settings.intensityLimit,
                defaultIntensity: command.intensity
            })) {
                throw new Error('Invalid pattern configuration');
            }
        }
    }
    updateDeviceStatus(deviceId, status) {
        const device = this.getDevice(deviceId);
        device.status = { ...device.status, ...status };
        this.devices.set(deviceId, device);
        // Emit device status event
        const event = {
            type: device_1.DeviceEventType.STATUS_CHANGED,
            deviceId,
            timestamp: new Date(),
            data: device.status
        };
        this.emit('deviceEvent', event);
        // Update monitoring metrics
        if (this.monitoring) {
            this.monitoring.recordMetric('device_status', status.connected ? 1 : 0, { deviceId });
            if (status.batteryLevel !== undefined) {
                this.monitoring.recordMetric('device_battery', status.batteryLevel, { deviceId });
            }
        }
    }
    handleDeviceEvent(event) {
        switch (event.type) {
            case device_1.DeviceEventType.CONNECTED:
            case device_1.DeviceEventType.DISCONNECTED:
                this.updateDeviceStatus(event.deviceId, {
                    connected: event.type === device_1.DeviceEventType.CONNECTED,
                    lastSeen: event.timestamp
                });
                break;
            case device_1.DeviceEventType.STATUS_CHANGED:
                if (event.data) {
                    this.updateDeviceStatus(event.deviceId, event.data);
                }
                break;
            case device_1.DeviceEventType.ERROR:
                this.updateDeviceStatus(event.deviceId, {
                    error: String(event.data),
                    lastSeen: event.timestamp
                });
                break;
        }
        // Forward event to listeners
        this.emit('deviceEvent', event);
    }
}
exports.DeviceManager = DeviceManager;
//# sourceMappingURL=DeviceManager.js.map