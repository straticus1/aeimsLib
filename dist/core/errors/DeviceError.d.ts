import { ErrorType } from '../types/DeviceTypes';
/**
 * Device-specific error class
 */
export declare class DeviceError extends Error {
    readonly code: ErrorType;
    readonly deviceId?: string;
    readonly context: Record<string, any>;
    readonly timestamp: Date;
    constructor(code: ErrorType, message: string, deviceId?: string, context?: Record<string, any>);
    toJSON(): {
        name: string;
        message: string;
        code: ErrorType;
        deviceId: string | undefined;
        context: Record<string, any>;
        timestamp: Date;
        stack: string | undefined;
    };
}
/**
 * Device validation error
 */
export declare class DeviceValidationError extends DeviceError {
    constructor(message: string, field?: string, value?: any, deviceId?: string);
}
/**
 * Device connection error
 */
export declare class DeviceConnectionError extends DeviceError {
    constructor(message: string, deviceId?: string, endpoint?: string);
}
/**
 * Device authentication error
 */
export declare class DeviceAuthError extends DeviceError {
    constructor(message: string, deviceId?: string, userId?: string);
}
/**
 * Device quota exceeded error
 */
export declare class DeviceQuotaError extends DeviceError {
    constructor(message: string, deviceId?: string, quota?: number, current?: number);
}
/**
 * Device persistence error
 */
export declare class DevicePersistenceError extends DeviceError {
    constructor(message: string, deviceId?: string, operation?: string);
}
/**
 * Device configuration error
 */
export declare class DeviceConfigError extends DeviceError {
    constructor(message: string, deviceId?: string, configKey?: string);
}
/**
 * Device state error
 */
export declare class DeviceStateError extends DeviceError {
    constructor(message: string, deviceId?: string, currentState?: string, expectedState?: string);
}
/**
 * Device operation error
 */
export declare class DeviceOperationError extends DeviceError {
    constructor(message: string, deviceId?: string, operation?: string);
}
/**
 * Device not found error
 */
export declare class DeviceNotFoundError extends DeviceError {
    constructor(deviceId: string, message?: string);
}
/**
 * Duplicate device error
 */
export declare class DuplicateDeviceError extends DeviceError {
    constructor(deviceId: string, message?: string);
}
export { ErrorType };
