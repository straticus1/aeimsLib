"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorType = exports.DuplicateDeviceError = exports.DeviceNotFoundError = exports.DeviceOperationError = exports.DeviceStateError = exports.DeviceConfigError = exports.DevicePersistenceError = exports.DeviceQuotaError = exports.DeviceAuthError = exports.DeviceConnectionError = exports.DeviceValidationError = exports.DeviceError = void 0;
const DeviceTypes_1 = require("../types/DeviceTypes");
Object.defineProperty(exports, "ErrorType", { enumerable: true, get: function () { return DeviceTypes_1.ErrorType; } });
/**
 * Device-specific error class
 */
class DeviceError extends Error {
    constructor(code, message, deviceId, context = {}) {
        super(message);
        this.name = 'DeviceError';
        this.code = code;
        this.deviceId = deviceId;
        this.context = context;
        this.timestamp = new Date();
        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, DeviceError);
        }
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            deviceId: this.deviceId,
            context: this.context,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}
exports.DeviceError = DeviceError;
/**
 * Device validation error
 */
class DeviceValidationError extends DeviceError {
    constructor(message, field, value, deviceId) {
        super(DeviceTypes_1.ErrorType.VALIDATION_ERROR, message, deviceId, { field, value });
        this.name = 'DeviceValidationError';
    }
}
exports.DeviceValidationError = DeviceValidationError;
/**
 * Device connection error
 */
class DeviceConnectionError extends DeviceError {
    constructor(message, deviceId, endpoint) {
        super(DeviceTypes_1.ErrorType.CONNECTION_ERROR, message, deviceId, { endpoint });
        this.name = 'DeviceConnectionError';
    }
}
exports.DeviceConnectionError = DeviceConnectionError;
/**
 * Device authentication error
 */
class DeviceAuthError extends DeviceError {
    constructor(message, deviceId, userId) {
        super(DeviceTypes_1.ErrorType.AUTH_ERROR, message, deviceId, { userId });
        this.name = 'DeviceAuthError';
    }
}
exports.DeviceAuthError = DeviceAuthError;
/**
 * Device quota exceeded error
 */
class DeviceQuotaError extends DeviceError {
    constructor(message, deviceId, quota, current) {
        super(DeviceTypes_1.ErrorType.QUOTA_EXCEEDED, message, deviceId, { quota, current });
        this.name = 'DeviceQuotaError';
    }
}
exports.DeviceQuotaError = DeviceQuotaError;
/**
 * Device persistence error
 */
class DevicePersistenceError extends DeviceError {
    constructor(message, deviceId, operation) {
        super(DeviceTypes_1.ErrorType.PERSISTENCE_ERROR, message, deviceId, { operation });
        this.name = 'DevicePersistenceError';
    }
}
exports.DevicePersistenceError = DevicePersistenceError;
/**
 * Device configuration error
 */
class DeviceConfigError extends DeviceError {
    constructor(message, deviceId, configKey) {
        super(DeviceTypes_1.ErrorType.CONFIGURATION_ERROR, message, deviceId, { configKey });
        this.name = 'DeviceConfigError';
    }
}
exports.DeviceConfigError = DeviceConfigError;
/**
 * Device state error
 */
class DeviceStateError extends DeviceError {
    constructor(message, deviceId, currentState, expectedState) {
        super(DeviceTypes_1.ErrorType.STATE_LOAD_ERROR, message, deviceId, { currentState, expectedState });
        this.name = 'DeviceStateError';
    }
}
exports.DeviceStateError = DeviceStateError;
/**
 * Device operation error
 */
class DeviceOperationError extends DeviceError {
    constructor(message, deviceId, operation) {
        super(DeviceTypes_1.ErrorType.INVALID_OPERATION, message, deviceId, { operation });
        this.name = 'DeviceOperationError';
    }
}
exports.DeviceOperationError = DeviceOperationError;
/**
 * Device not found error
 */
class DeviceNotFoundError extends DeviceError {
    constructor(deviceId, message) {
        super(DeviceTypes_1.ErrorType.DEVICE_NOT_FOUND, message || `Device ${deviceId} not found`, deviceId);
        this.name = 'DeviceNotFoundError';
    }
}
exports.DeviceNotFoundError = DeviceNotFoundError;
/**
 * Duplicate device error
 */
class DuplicateDeviceError extends DeviceError {
    constructor(deviceId, message) {
        super(DeviceTypes_1.ErrorType.DUPLICATE_DEVICE, message || `Device ${deviceId} already exists`, deviceId);
        this.name = 'DuplicateDeviceError';
    }
}
exports.DuplicateDeviceError = DuplicateDeviceError;
//# sourceMappingURL=DeviceError.js.map