"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceStateManager = exports.DeviceStateEvent = void 0;
const events_1 = require("events");
const Logger_1 = require("../utils/Logger");
const DeviceManager_1 = require("../core/DeviceManager");
const CommandProcessor_1 = require("./CommandProcessor");
var DeviceStateEvent;
(function (DeviceStateEvent) {
    DeviceStateEvent["STATE_CHANGED"] = "stateChanged";
    DeviceStateEvent["RECOVERY_STARTED"] = "recoveryStarted";
    DeviceStateEvent["RECOVERY_COMPLETED"] = "recoveryCompleted";
    DeviceStateEvent["RECOVERY_FAILED"] = "recoveryFailed";
})(DeviceStateEvent || (exports.DeviceStateEvent = DeviceStateEvent = {}));
class DeviceStateManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.deviceStates = new Map();
        this.recoveryTimeouts = new Map();
        this.commandProcessor = CommandProcessor_1.CommandProcessor.getInstance();
        this.logger = Logger_1.Logger.getInstance();
        this.config = {
            maxAttempts: 3,
            retryDelay: 1000,
            maxRetryDelay: 10000,
            recoveryTimeout: 30000,
            validateState: true,
            ...config
        };
    }
    static getInstance(config) {
        if (!DeviceStateManager.instance) {
            DeviceStateManager.instance = new DeviceStateManager(config);
        }
        return DeviceStateManager.instance;
    }
    registerDevice(device) {
        const state = {
            status: {
                connected: false,
                lastSeen: new Date()
            },
            recoveryAttempts: 0,
            customState: {}
        };
        this.deviceStates.set(device.info.id, state);
        this.commandProcessor.registerDevice(device);
        // Set up state monitoring
        this.monitorDeviceState(device);
    }
    unregisterDevice(deviceId) {
        this.deviceStates.delete(deviceId);
        this.commandProcessor.unregisterDevice(deviceId);
        const timeout = this.recoveryTimeouts.get(deviceId);
        if (timeout) {
            clearTimeout(timeout);
            this.recoveryTimeouts.delete(deviceId);
        }
    }
    async updateDeviceState(deviceId, status, customState) {
        const state = this.getDeviceState(deviceId);
        if (!state) {
            throw new Error(`Device not found: ${deviceId}`);
        }
        const previousState = { ...state };
        state.status = { ...state.status, ...status };
        if (customState) {
            state.customState = {
                ...state.customState,
                ...customState
            };
        }
        state.status.lastSeen = new Date();
        this.deviceStates.set(deviceId, state);
        // Check if recovery is needed
        if (this.shouldAttemptRecovery(previousState, state)) {
            await this.initiateStateRecovery(deviceId);
        }
        this.emit(DeviceStateEvent.STATE_CHANGED, { deviceId, state });
    }
    getDeviceState(deviceId) {
        return this.deviceStates.get(deviceId);
    }
    async saveCommand(deviceId, command) {
        const state = this.getDeviceState(deviceId);
        if (!state) {
            throw new Error(`Device not found: ${deviceId}`);
        }
        state.lastCommand = command;
        state.lastCommandTime = Date.now();
        this.deviceStates.set(deviceId, state);
    }
    monitorDeviceState(device) {
        // Set up periodic state checks
        const checkInterval = setInterval(() => {
            const state = this.getDeviceState(device.info.id);
            if (!state) {
                clearInterval(checkInterval);
                return;
            }
            const now = Date.now();
            const lastSeen = state.status.lastSeen?.getTime() || 0;
            // Check for stale state
            if (now - lastSeen > 5000) { // 5 seconds threshold
                this.updateDeviceState(device.info.id, {
                    connected: false,
                    error: 'Device communication timeout'
                });
            }
        }, 1000);
        // Clean up interval when device is unregistered
        this.once(`unregister:${device.info.id}`, () => {
            clearInterval(checkInterval);
        });
    }
    shouldAttemptRecovery(previous, current) {
        // Recovery conditions:
        // 1. Device was connected and is now disconnected
        // 2. Device has encountered an error
        // 3. Device state validation fails (if enabled)
        if (previous.status.connected && !current.status.connected) {
            return true;
        }
        if (current.status.error && !previous.status.error) {
            return true;
        }
        if (this.config.validateState && current.customState) {
            try {
                this.validateDeviceState(current);
            }
            catch {
                return true;
            }
        }
        return false;
    }
    async initiateStateRecovery(deviceId) {
        const state = this.getDeviceState(deviceId);
        if (!state)
            return;
        // Clear any existing recovery timeout
        const existingTimeout = this.recoveryTimeouts.get(deviceId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        // Check recovery attempts
        if (state.recoveryAttempts >= this.config.maxAttempts) {
            this.emit(DeviceStateEvent.RECOVERY_FAILED, {
                deviceId,
                reason: 'Maximum recovery attempts exceeded'
            });
            return;
        }
        state.recoveryAttempts++;
        state.lastRecoveryTime = Date.now();
        this.deviceStates.set(deviceId, state);
        this.emit(DeviceStateEvent.RECOVERY_STARTED, { deviceId, attempt: state.recoveryAttempts });
        try {
            // Attempt recovery
            await this.performStateRecovery(deviceId);
            // Reset recovery attempts on success
            state.recoveryAttempts = 0;
            this.deviceStates.set(deviceId, state);
            this.emit(DeviceStateEvent.RECOVERY_COMPLETED, { deviceId });
        }
        catch (error) {
            this.logger.error('State recovery failed', { deviceId, error });
            // Schedule next recovery attempt
            const delay = Math.min(this.config.retryDelay * Math.pow(2, state.recoveryAttempts), this.config.maxRetryDelay);
            const timeout = setTimeout(() => {
                this.initiateStateRecovery(deviceId);
            }, delay);
            this.recoveryTimeouts.set(deviceId, timeout);
        }
    }
    async performStateRecovery(deviceId) {
        const state = this.getDeviceState(deviceId);
        if (!state)
            return;
        // Set recovery timeout
        const recoveryTimeout = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Recovery timeout'));
            }, this.config.recoveryTimeout);
        });
        try {
            // Perform recovery steps
            await Promise.race([
                this.executeRecoverySteps(deviceId, state),
                recoveryTimeout
            ]);
        }
        catch (error) {
            this.logger.error('Recovery steps failed', { deviceId, error });
            throw error;
        }
    }
    async executeRecoverySteps(deviceId, state) {
        // 1. Clear command queue
        this.commandProcessor.clearQueue(deviceId);
        // 2. Reset device connection
        const device = await this.getDevice(deviceId);
        await device.disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await device.connect();
        // 3. Validate device state
        if (this.config.validateState) {
            this.validateDeviceState(state);
        }
        // 4. Restore last known state if available
        if (state.lastCommand) {
            await this.commandProcessor.sendCommand(deviceId, state.lastCommand);
        }
        // 5. Update device state
        await this.updateDeviceState(deviceId, {
            connected: true,
            error: undefined
        });
    }
    validateDeviceState(state) {
        // Implement state validation logic based on device type/protocol
        // This is a basic example - extend based on your needs
        if (!state.status) {
            throw new Error('Invalid state: missing status');
        }
        if (state.status.connected && !state.status.lastSeen) {
            throw new Error('Invalid state: connected device without lastSeen timestamp');
        }
        if (state.customState) {
            // Validate custom state properties
            this.validateCustomState(state.customState);
        }
    }
    validateCustomState(customState) {
        // Implement custom state validation
        // This should be extended based on your specific requirements
        for (const [key, value] of Object.entries(customState)) {
            if (value === undefined || value === null) {
                throw new Error(`Invalid custom state: ${key} is undefined or null`);
            }
        }
    }
    async getDevice(deviceId) {
        try {
            // Get device from device manager
            const deviceManager = DeviceManager_1.DeviceManager.getInstance();
            return deviceManager.getDevice(deviceId);
        }
        catch (error) {
            throw new Error(`Failed to get device ${deviceId}: ${error.message}`);
        }
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(config) {
        this.config = {
            ...this.config,
            ...config
        };
    }
}
exports.DeviceStateManager = DeviceStateManager;
//# sourceMappingURL=DeviceStateManager.js.map