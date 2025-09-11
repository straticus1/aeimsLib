"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceManager = void 0;
const events_1 = require("events");
const DeviceConfig_1 = require("./config/DeviceConfig");
const DeviceMode_1 = require("./types/DeviceMode");
const DeviceState_1 = require("./types/DeviceState");
const DeviceError_1 = require("./errors/DeviceError");
const PersistenceManager_1 = require("./persistence/PersistenceManager");
const AuditLogger_1 = require("./logging/AuditLogger");
class DeviceManager extends events_1.EventEmitter {
    constructor(mode = DeviceMode_1.DeviceMode.DEVELOPMENT) {
        super();
        this.devices = new Map();
        this.defaultDevice = null;
        this.currentMode = mode;
        this.persistence = new PersistenceManager_1.PersistenceManager();
        this.logger = new AuditLogger_1.AuditLogger();
        // Load persisted state
        this.loadState();
    }
    /**
     * Add a new device to the system
     */
    async addDevice(device) {
        this.validateDeviceOperation('add');
        if (this.devices.has(device.id)) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.DUPLICATE_DEVICE, `Device with ID ${device.id} already exists`);
        }
        // Get device configuration
        const config = await DeviceConfig_1.DeviceConfig.getDeviceConfig(device.type);
        // Initialize device state
        const newDevice = {
            ...device,
            features: this.resolveFeatures(config.features, this.currentMode),
            pricing: this.calculatePricing(config.pricing, this.currentMode),
            state: DeviceState_1.DeviceState.INITIALIZED,
            mode: this.currentMode
        };
        // Persist and emit events atomically
        await this.persistence.transaction(async () => {
            this.devices.set(device.id, newDevice);
            // Make first device default
            if (this.devices.size === 1) {
                this.defaultDevice = device.id;
                newDevice.isDefault = true;
            }
            await this.persistence.saveDevices(this.devices);
            await this.logger.logDeviceOperation('add', device.id);
            this.emit('deviceAdded', newDevice);
        });
        return newDevice;
    }
    /**
     * List all devices with optional filtering
     */
    listDevices(filter) {
        this.validateDeviceOperation('list');
        let devices = Array.from(this.devices.values());
        if (filter) {
            devices = devices.filter(device => {
                if (filter.type && device.type !== filter.type)
                    return false;
                if (filter.mode && device.mode !== filter.mode)
                    return false;
                if (filter.features) {
                    return filter.features.every(feature => device.features.includes(feature));
                }
                return true;
            });
        }
        return devices;
    }
    /**
     * Delete a device from the system
     */
    async deleteDevice(deviceId) {
        this.validateDeviceOperation('delete');
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.DEVICE_NOT_FOUND, `Device ${deviceId} not found`);
        }
        // Persist and emit events atomically
        await this.persistence.transaction(async () => {
            this.devices.delete(deviceId);
            // Update default device if needed
            if (this.defaultDevice === deviceId) {
                const nextDevice = this.devices.values().next().value;
                this.defaultDevice = nextDevice ? nextDevice.id : null;
                if (nextDevice) {
                    nextDevice.isDefault = true;
                    this.emit('devicePromoted', nextDevice);
                }
            }
            await this.persistence.saveDevices(this.devices);
            await this.logger.logDeviceOperation('delete', deviceId);
            this.emit('deviceDeleted', device);
        });
    }
    /**
     * Promote a device to be the default
     */
    async promoteDevice(deviceId) {
        this.validateDeviceOperation('promote');
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.DEVICE_NOT_FOUND, `Device ${deviceId} not found`);
        }
        // Don't promote if already default
        if (this.defaultDevice === deviceId) {
            return device;
        }
        // Persist and emit events atomically
        await this.persistence.transaction(async () => {
            // Clear previous default
            if (this.defaultDevice) {
                const previousDefault = this.devices.get(this.defaultDevice);
                if (previousDefault) {
                    previousDefault.isDefault = false;
                }
            }
            // Set new default
            this.defaultDevice = deviceId;
            device.isDefault = true;
            await this.persistence.saveDevices(this.devices);
            await this.logger.logDeviceOperation('promote', deviceId);
            this.emit('devicePromoted', device);
        });
        return device;
    }
    /**
     * Get the current default device
     */
    getDefaultDevice() {
        return this.defaultDevice ? this.devices.get(this.defaultDevice) || null : null;
    }
    /**
     * Switch between development and production modes
     */
    async setMode(mode) {
        if (mode === this.currentMode)
            return;
        await this.persistence.transaction(async () => {
            this.currentMode = mode;
            // Update all device features and pricing
            for (const device of this.devices.values()) {
                const config = await DeviceConfig_1.DeviceConfig.getDeviceConfig(device.type);
                device.features = this.resolveFeatures(config.features, mode);
                device.pricing = this.calculatePricing(config.pricing, mode);
                device.mode = mode;
            }
            await this.persistence.saveDevices(this.devices);
            await this.logger.logModeChange(mode);
            this.emit('modeChanged', mode);
        });
    }
    /**
     * Get available features for a device type
     */
    async getAvailableFeatures(deviceType) {
        const config = await DeviceConfig_1.DeviceConfig.getDeviceConfig(deviceType);
        return this.resolveFeatures(config.features, this.currentMode);
    }
    /**
     * Calculate pricing for a device type
     */
    async getPricing(deviceType) {
        const config = await DeviceConfig_1.DeviceConfig.getDeviceConfig(deviceType);
        return this.calculatePricing(config.pricing, this.currentMode);
    }
    validateDeviceOperation(operation) {
        // Basic validation
        if (!['add', 'list', 'delete', 'promote'].includes(operation)) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.INVALID_OPERATION, `Invalid operation: ${operation}`);
        }
        // Mode-specific validation
        if (this.currentMode === DeviceMode_1.DeviceMode.PRODUCTION) {
            // Add additional production mode validation
            // For example, require auth tokens, validate against quotas, etc.
        }
    }
    resolveFeatures(features, mode) {
        // In production, only expose stable features
        if (mode === DeviceMode_1.DeviceMode.PRODUCTION) {
            return features.filter(feature => !feature.experimental);
        }
        return features;
    }
    calculatePricing(pricing, mode) {
        // Apply mode-specific pricing rules
        if (mode === DeviceMode_1.DeviceMode.DEVELOPMENT) {
            return {
                ...pricing,
                baseRate: 0, // Free in dev mode
                featureRates: Object.fromEntries(Object.entries(pricing.featureRates).map(([k, v]) => [k, 0]))
            };
        }
        return pricing;
    }
    async loadState() {
        try {
            const state = await this.persistence.loadDevices();
            this.devices = state.devices;
            this.defaultDevice = state.defaultDevice;
        }
        catch (error) {
            this.logger.logError('Failed to load device state', error);
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.STATE_LOAD_ERROR, 'Failed to load device state');
        }
    }
}
exports.DeviceManager = DeviceManager;
//# sourceMappingURL=DeviceManager.js.map