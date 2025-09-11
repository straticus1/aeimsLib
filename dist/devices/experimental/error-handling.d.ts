import { Device } from '../../interfaces/device';
/**
 * Custom error types for experimental devices
 */
export declare class DeviceConnectionError extends Error {
    deviceId: string;
    cause?: Error | undefined;
    constructor(message: string, deviceId: string, cause?: Error | undefined);
}
export declare class DeviceCommandError extends Error {
    deviceId: string;
    commandType: string;
    cause?: Error | undefined;
    constructor(message: string, deviceId: string, commandType: string, cause?: Error | undefined);
}
export declare class DeviceTimeoutError extends Error {
    deviceId: string;
    operation: string;
    timeoutMs: number;
    constructor(message: string, deviceId: string, operation: string, timeoutMs: number);
}
export declare class DeviceProtocolError extends Error {
    deviceId: string;
    protocolError: any;
    constructor(message: string, deviceId: string, protocolError: any);
}
export declare class DeviceSafetyError extends Error {
    deviceId: string;
    safetyCheck: string;
    constructor(message: string, deviceId: string, safetyCheck: string);
}
/**
 * Error recovery strategies
 */
export interface RecoveryStrategy {
    maxAttempts: number;
    backoffMs: number;
    timeout: number;
    onAttempt?: (attempt: number, error: Error) => void;
}
/**
 * Enhanced error handling and recovery for experimental devices
 */
export declare class DeviceErrorHandler {
    private device;
    private options;
    private logger;
    private monitor;
    private recoveryStrategies;
    private activeRecoveries;
    constructor(device: Device, options?: {
        autoReconnect?: boolean;
        maxReconnectAttempts?: number;
        safetyChecks?: boolean;
    });
    /**
     * Handle device connection with error recovery
     */
    connect(): Promise<void>;
    /**
     * Handle command execution with error recovery
     */
    executeCommand(command: any): Promise<void>;
    /**
     * Handle unexpected disconnections with automatic recovery
     */
    handleDisconnect(error?: Error): Promise<void>;
    /**
     * Handle connection errors during command execution
     */
    private handleConnectionError;
    /**
     * Perform safety checks before executing commands
     */
    private performSafetyChecks;
    /**
     * Update recovery strategy for specific operations
     */
    setRecoveryStrategy(operation: 'connection' | 'command', strategy: Partial<RecoveryStrategy>): void;
    /**
     * Enable or disable auto-reconnect
     */
    setAutoReconnect(enabled: boolean): void;
    /**
     * Enable or disable safety checks
     */
    setSafetyChecks(enabled: boolean): void;
}
/**
 * Error handler factory for experimental devices
 */
export declare function createErrorHandler(device: Device, options?: {
    autoReconnect?: boolean;
    maxReconnectAttempts?: number;
    safetyChecks?: boolean;
}): DeviceErrorHandler;
