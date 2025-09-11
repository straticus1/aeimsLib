"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceErrorHandler = exports.DeviceSafetyError = exports.DeviceProtocolError = exports.DeviceTimeoutError = exports.DeviceCommandError = exports.DeviceConnectionError = void 0;
exports.createErrorHandler = createErrorHandler;
const monitoring_1 = require("../../monitoring");
const Logger_1 = require("../../utils/Logger");
/**
 * Custom error types for experimental devices
 */
class DeviceConnectionError extends Error {
    constructor(message, deviceId, cause) {
        super(message);
        this.deviceId = deviceId;
        this.cause = cause;
        this.name = 'DeviceConnectionError';
    }
}
exports.DeviceConnectionError = DeviceConnectionError;
class DeviceCommandError extends Error {
    constructor(message, deviceId, commandType, cause) {
        super(message);
        this.deviceId = deviceId;
        this.commandType = commandType;
        this.cause = cause;
        this.name = 'DeviceCommandError';
    }
}
exports.DeviceCommandError = DeviceCommandError;
class DeviceTimeoutError extends Error {
    constructor(message, deviceId, operation, timeoutMs) {
        super(message);
        this.deviceId = deviceId;
        this.operation = operation;
        this.timeoutMs = timeoutMs;
        this.name = 'DeviceTimeoutError';
    }
}
exports.DeviceTimeoutError = DeviceTimeoutError;
class DeviceProtocolError extends Error {
    constructor(message, deviceId, protocolError) {
        super(message);
        this.deviceId = deviceId;
        this.protocolError = protocolError;
        this.name = 'DeviceProtocolError';
    }
}
exports.DeviceProtocolError = DeviceProtocolError;
class DeviceSafetyError extends Error {
    constructor(message, deviceId, safetyCheck) {
        super(message);
        this.deviceId = deviceId;
        this.safetyCheck = safetyCheck;
        this.name = 'DeviceSafetyError';
    }
}
exports.DeviceSafetyError = DeviceSafetyError;
const DEFAULT_RECOVERY = {
    maxAttempts: 3,
    backoffMs: 1000,
    timeout: 5000
};
/**
 * Enhanced error handling and recovery for experimental devices
 */
class DeviceErrorHandler {
    constructor(device, options = {}) {
        this.device = device;
        this.options = options;
        this.recoveryStrategies = new Map();
        this.activeRecoveries = new Map();
        this.logger = Logger_1.Logger.getInstance();
        this.monitor = new monitoring_1.DeviceMonitoring(device.info.id);
        // Set up default recovery strategies
        this.recoveryStrategies.set('connection', {
            maxAttempts: options.maxReconnectAttempts || 3,
            backoffMs: 2000,
            timeout: 10000,
            onAttempt: (attempt, error) => {
                this.logger.warn('Attempting device reconnection', {
                    deviceId: device.info.id,
                    attempt,
                    error
                });
            }
        });
        this.recoveryStrategies.set('command', {
            maxAttempts: 2,
            backoffMs: 500,
            timeout: 3000
        });
    }
    /**
     * Handle device connection with error recovery
     */
    async connect() {
        const strategy = this.recoveryStrategies.get('connection') || DEFAULT_RECOVERY;
        let lastError;
        for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
            try {
                if (attempt > 1) {
                    await new Promise(resolve => setTimeout(resolve, strategy.backoffMs));
                    strategy.onAttempt?.(attempt, lastError);
                }
                const connectPromise = this.device.connect();
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new DeviceTimeoutError('Connection attempt timed out', this.device.info.id, 'connect', strategy.timeout));
                    }, strategy.timeout);
                });
                await Promise.race([connectPromise, timeoutPromise]);
                return;
            }
            catch (error) {
                lastError = error;
                this.monitor.onError(error, { operation: 'connect', attempt });
            }
        }
        const finalError = new DeviceConnectionError(`Failed to connect after ${strategy.maxAttempts} attempts`, this.device.info.id, lastError);
        this.monitor.onError(finalError, {
            operation: 'connect',
            attempts: strategy.maxAttempts
        });
        throw finalError;
    }
    /**
     * Handle command execution with error recovery
     */
    async executeCommand(command) {
        const strategy = this.recoveryStrategies.get('command') || DEFAULT_RECOVERY;
        let lastError;
        // Safety checks if enabled
        if (this.options.safetyChecks) {
            this.performSafetyChecks(command);
        }
        for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
            try {
                if (attempt > 1) {
                    await new Promise(resolve => setTimeout(resolve, strategy.backoffMs));
                }
                const commandPromise = this.device.sendCommand(command);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new DeviceTimeoutError('Command execution timed out', this.device.info.id, command.type, strategy.timeout));
                    }, strategy.timeout);
                });
                await Promise.race([commandPromise, timeoutPromise]);
                return;
            }
            catch (error) {
                lastError = error;
                this.monitor.onError(error, {
                    operation: 'command',
                    command: command.type,
                    attempt
                });
                // Special handling for connection errors
                if (error instanceof DeviceConnectionError && this.options.autoReconnect) {
                    await this.handleConnectionError();
                }
            }
        }
        const finalError = new DeviceCommandError(`Command failed after ${strategy.maxAttempts} attempts`, this.device.info.id, command.type, lastError);
        this.monitor.onError(finalError, {
            operation: 'command',
            command: command.type,
            attempts: strategy.maxAttempts
        });
        throw finalError;
    }
    /**
     * Handle unexpected disconnections with automatic recovery
     */
    async handleDisconnect(error) {
        if (!this.options.autoReconnect) {
            this.monitor.onDisconnect();
            return;
        }
        // Prevent multiple simultaneous recovery attempts
        let recovery = this.activeRecoveries.get('connection');
        if (recovery) {
            return recovery;
        }
        recovery = (async () => {
            this.monitor.onDisconnect();
            this.logger.warn('Device disconnected unexpectedly', {
                deviceId: this.device.info.id,
                error
            });
            try {
                await this.connect();
            }
            finally {
                this.activeRecoveries.delete('connection');
            }
        })();
        this.activeRecoveries.set('connection', recovery);
        return recovery;
    }
    /**
     * Handle connection errors during command execution
     */
    async handleConnectionError() {
        if (!this.device.isConnected() && this.options.autoReconnect) {
            await this.connect();
        }
    }
    /**
     * Perform safety checks before executing commands
     */
    performSafetyChecks(command) {
        // Check intensity limits
        if (command.params?.intensity !== undefined &&
            command.params.intensity > 0.8 // 80% maximum for safety
        ) {
            throw new DeviceSafetyError('Command intensity exceeds safety limit', this.device.info.id, 'intensity_limit');
        }
        // Check rate limiting
        const now = Date.now();
        const recentCommands = this.monitor.getDeviceStats()?.totalCommandsSent || 0;
        if (recentCommands > 100) { // Max 100 commands per minute
            throw new DeviceSafetyError('Command rate limit exceeded', this.device.info.id, 'rate_limit');
        }
        // Device-specific safety checks
        switch (command.type) {
            case 'shock':
                if (command.params?.duration > 2000) { // Max 2 seconds
                    throw new DeviceSafetyError('Shock duration exceeds safety limit', this.device.info.id, 'shock_duration');
                }
                break;
            case 'rotate':
                if (command.params?.speed > 0.9) { // Max 90% speed
                    throw new DeviceSafetyError('Rotation speed exceeds safety limit', this.device.info.id, 'rotation_speed');
                }
                break;
        }
    }
    /**
     * Update recovery strategy for specific operations
     */
    setRecoveryStrategy(operation, strategy) {
        const current = this.recoveryStrategies.get(operation) || DEFAULT_RECOVERY;
        this.recoveryStrategies.set(operation, {
            ...current,
            ...strategy
        });
    }
    /**
     * Enable or disable auto-reconnect
     */
    setAutoReconnect(enabled) {
        this.options.autoReconnect = enabled;
    }
    /**
     * Enable or disable safety checks
     */
    setSafetyChecks(enabled) {
        this.options.safetyChecks = enabled;
    }
}
exports.DeviceErrorHandler = DeviceErrorHandler;
/**
 * Error handler factory for experimental devices
 */
function createErrorHandler(device, options) {
    return new DeviceErrorHandler(device, options);
}
//# sourceMappingURL=error-handling.js.map