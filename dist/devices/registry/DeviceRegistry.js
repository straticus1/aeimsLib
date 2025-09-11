"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceRegistry = exports.DeviceStatus = void 0;
const events_1 = require("events");
const ProtocolRegistry_1 = require("../protocol/ProtocolRegistry");
/**
 * Device Status
 */
var DeviceStatus;
(function (DeviceStatus) {
    DeviceStatus["UNKNOWN"] = "unknown";
    DeviceStatus["OFFLINE"] = "offline";
    DeviceStatus["ONLINE"] = "online";
    DeviceStatus["ERROR"] = "error";
    DeviceStatus["DISABLED"] = "disabled";
    DeviceStatus["MAINTENANCE"] = "maintenance";
})(DeviceStatus || (exports.DeviceStatus = DeviceStatus = {}));
/**
 * Device Registry
 * Manages device lifecycle, state and connectivity
 */
class DeviceRegistry extends events_1.EventEmitter {
    constructor(database, logger, options = {}) {
        super();
        this.database = database;
        this.logger = logger;
        this.devices = new Map();
        this.protocolHandlers = new Map();
        this.options = this.initializeOptions(options);
        this.setupCleanupTimer();
    }
    /**
     * Get singleton instance
     */
    static getInstance(database, logger, options) {
        if (!DeviceRegistry.instance) {
            DeviceRegistry.instance = new DeviceRegistry(database, logger, options);
        }
        return DeviceRegistry.instance;
    }
    /**
     * Initialize registry
     */
    async initialize() {
        try {
            if (this.options.persistentStorage) {
                await this.loadDevices();
            }
        }
        catch (error) {
            this.logger.error('Failed to initialize device registry:', error);
            throw error;
        }
    }
    /**
     * Add or update device
     */
    async addDevice(device, config) {
        try {
            // Create or update device info
            const existing = this.devices.get(device.id);
            const info = {
                id: device.id,
                name: device.name,
                type: device.type,
                protocol: device.protocol,
                address: device.address,
                status: existing?.status || DeviceStatus.OFFLINE,
                manufacturer: device.manufacturer,
                model: device.model,
                serialNumber: device.serialNumber,
                firmware: device.firmware,
                capabilities: device.capabilities || [],
                features: new Set(device.capabilities || []),
                metadata: device.metadata || {},
                lastSeen: device.lastSeen,
                lastConnected: existing?.lastConnected,
                lastError: existing?.lastError,
                errorCount: existing?.errorCount || 0,
                config: config || existing?.config,
                enabled: existing?.enabled ?? true
            };
            if (existing) {
                // Update existing device
                Object.assign(existing, info);
                await this.persistDevice(existing);
                this.emit('deviceUpdated', existing);
                return existing;
            }
            else {
                // Add new device
                this.devices.set(info.id, info);
                await this.persistDevice(info);
                this.emit('deviceAdded', info);
                // Auto-connect if enabled
                if (this.options.autoConnect && info.enabled) {
                    await this.connectDevice(info.id).catch(error => {
                        this.logger.warn(`Failed to auto-connect device ${info.id}:`, error);
                    });
                }
                return info;
            }
        }
        catch (error) {
            this.logger.error(`Failed to add/update device ${device.id}:`, error);
            throw error;
        }
    }
    /**
     * Remove device
     */
    async removeDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device)
            return;
        try {
            // Disconnect if connected
            await this.disconnectDevice(deviceId);
            // Remove from storage
            if (this.options.persistentStorage) {
                await this.database.delete(`${this.options.storagePrefix}:${deviceId}`);
            }
            // Remove from registry
            this.devices.delete(deviceId);
            this.emit('deviceRemoved', deviceId);
        }
        catch (error) {
            this.logger.error(`Failed to remove device ${deviceId}:`, error);
            throw error;
        }
    }
    /**
     * Get device by ID
     */
    getDevice(deviceId) {
        return this.devices.get(deviceId);
    }
    /**
     * List all devices
     */
    listDevices(filter) {
        let devices = Array.from(this.devices.values());
        if (filter) {
            devices = devices.filter(device => {
                if (filter.type && device.type !== filter.type) {
                    return false;
                }
                if (filter.protocol && device.protocol !== filter.protocol) {
                    return false;
                }
                if (filter.status && device.status !== filter.status) {
                    return false;
                }
                if (filter.capability && !device.capabilities.includes(filter.capability)) {
                    return false;
                }
                return true;
            });
        }
        return devices;
    }
    /**
     * Update device configuration
     */
    async updateDeviceConfig(deviceId, config) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        try {
            device.config = config;
            await this.persistDevice(device);
            this.emit('deviceUpdated', device);
        }
        catch (error) {
            this.logger.error(`Failed to update device config ${deviceId}:`, error);
            throw error;
        }
    }
    /**
     * Enable/disable device
     */
    async setDeviceEnabled(deviceId, enabled) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        try {
            if (device.enabled !== enabled) {
                device.enabled = enabled;
                if (!enabled && device.status === DeviceStatus.ONLINE) {
                    await this.disconnectDevice(deviceId);
                }
                device.status = enabled ?
                    DeviceStatus.OFFLINE :
                    DeviceStatus.DISABLED;
                await this.persistDevice(device);
                this.emit('deviceUpdated', device);
            }
        }
        catch (error) {
            this.logger.error(`Failed to ${enabled ? 'enable' : 'disable'} device ${deviceId}:`, error);
            throw error;
        }
    }
    /**
     * Connect to device
     */
    async connectDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        if (!device.enabled) {
            throw new Error(`Device ${deviceId} is disabled`);
        }
        if (device.status === DeviceStatus.ONLINE) {
            return;
        }
        try {
            // Get or create protocol handler
            let handler = this.protocolHandlers.get(deviceId);
            if (!handler) {
                handler = await this.createProtocolHandler(device);
                this.protocolHandlers.set(deviceId, handler);
            }
            // Connect with retry
            let retries = 0;
            while (retries <= this.options.connectRetries) {
                try {
                    await handler.connect(device.config);
                    break;
                }
                catch (error) {
                    retries++;
                    if (retries > this.options.connectRetries) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, this.options.reconnectDelay));
                }
            }
            // Update device state
            device.status = DeviceStatus.ONLINE;
            device.lastConnected = Date.now();
            device.errorCount = 0;
            await this.persistDevice(device);
            this.emit('deviceConnected', deviceId);
            this.emit('deviceUpdated', device);
        }
        catch (error) {
            this.handleDeviceError(device, error);
            throw error;
        }
    }
    /**
     * Disconnect from device
     */
    async disconnectDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        const handler = this.protocolHandlers.get(deviceId);
        if (!handler) {
            return;
        }
        try {
            await handler.disconnect();
            this.protocolHandlers.delete(deviceId);
            // Update device state
            device.status = DeviceStatus.OFFLINE;
            await this.persistDevice(device);
            this.emit('deviceDisconnected', deviceId);
            this.emit('deviceUpdated', device);
        }
        catch (error) {
            this.handleDeviceError(device, error);
            throw error;
        }
    }
    /**
     * Send command to device
     */
    async sendCommand(deviceId, command) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        if (!device.enabled) {
            throw new Error(`Device ${deviceId} is disabled`);
        }
        const handler = this.protocolHandlers.get(deviceId);
        if (!handler) {
            throw new Error(`Device ${deviceId} not connected`);
        }
        try {
            return await handler.sendCommand(command);
        }
        catch (error) {
            this.handleDeviceError(device, error);
            throw error;
        }
    }
    /**
     * Initialize options
     */
    initializeOptions(options) {
        return {
            autoConnect: options.autoConnect !== false,
            connectRetries: options.connectRetries || 3,
            connectTimeout: options.connectTimeout || 5000,
            reconnectDelay: options.reconnectDelay || 1000,
            staleTimeout: options.staleTimeout || 300000, // 5 minutes
            cleanupInterval: options.cleanupInterval || 60000, // 1 minute
            maxErrorCount: options.maxErrorCount || 10,
            persistentStorage: options.persistentStorage !== false,
            storagePrefix: options.storagePrefix || 'device'
        };
    }
    /**
     * Setup cleanup timer
     */
    setupCleanupTimer() {
        this.cleanupTimer = setInterval(() => this.cleanup(), this.options.cleanupInterval);
    }
    /**
     * Cleanup stale devices
     */
    async cleanup() {
        const now = Date.now();
        for (const [id, device] of this.devices) {
            // Check if device is stale
            if (device.lastSeen &&
                now - device.lastSeen > this.options.staleTimeout) {
                // Disconnect if connected
                if (device.status === DeviceStatus.ONLINE) {
                    await this.disconnectDevice(id).catch(() => { });
                }
                // Update state
                device.status = DeviceStatus.OFFLINE;
                await this.persistDevice(device);
                this.emit('deviceUpdated', device);
            }
            // Check error threshold
            if (device.errorCount > this.options.maxErrorCount) {
                device.status = DeviceStatus.ERROR;
                await this.persistDevice(device);
                this.emit('deviceUpdated', device);
            }
        }
    }
    /**
     * Create protocol handler
     */
    async createProtocolHandler(device) {
        const registry = ProtocolRegistry_1.ProtocolRegistry.getInstance();
        try {
            return registry.createProtocolHandler(device.protocol, device.config);
        }
        catch (error) {
            this.logger.error(`Failed to create protocol handler for ${device.id}:`, error);
            throw error;
        }
    }
    /**
     * Handle device error
     */
    handleDeviceError(device, error) {
        device.lastError = error;
        device.errorCount++;
        if (device.errorCount > this.options.maxErrorCount) {
            device.status = DeviceStatus.ERROR;
        }
        this.persistDevice(device).catch(error => {
            this.logger.error(`Failed to persist device state for ${device.id}:`, error);
        });
        this.emit('deviceError', device.id, error);
        this.emit('deviceUpdated', device);
    }
    /**
     * Load devices from storage
     */
    async loadDevices() {
        try {
            const prefix = `${this.options.storagePrefix}:`;
            const keys = await this.database.keys(prefix);
            for (const key of keys) {
                try {
                    const data = await this.database.get(key);
                    if (!data)
                        continue;
                    const device = JSON.parse(data);
                    device.status = DeviceStatus.OFFLINE;
                    this.devices.set(device.id, device);
                }
                catch (error) {
                    this.logger.error(`Failed to load device ${key}:`, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Failed to load devices from storage:', error);
            throw error;
        }
    }
    /**
     * Persist device to storage
     */
    async persistDevice(device) {
        if (!this.options.persistentStorage)
            return;
        try {
            const key = `${this.options.storagePrefix}:${device.id}`;
            await this.database.set(key, JSON.stringify(device));
        }
        catch (error) {
            this.logger.error(`Failed to persist device ${device.id}:`, error);
            throw error;
        }
    }
    /**
     * Cleanup resources
     */
    async destroy() {
        // Stop cleanup timer
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        // Disconnect all devices
        const disconnects = Array.from(this.devices.keys()).map(id => this.disconnectDevice(id).catch(() => { }));
        await Promise.all(disconnects);
        // Clear state
        this.devices.clear();
        this.protocolHandlers.clear();
        this.removeAllListeners();
    }
}
exports.DeviceRegistry = DeviceRegistry;
//# sourceMappingURL=DeviceRegistry.js.map