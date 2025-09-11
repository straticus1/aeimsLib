import { EventEmitter } from 'events';
import { Device, DeviceCommand, DeviceStatus } from '../interfaces/device';
export interface DeviceState {
    status: DeviceStatus;
    lastCommand?: DeviceCommand;
    lastCommandTime?: number;
    recoveryAttempts: number;
    lastRecoveryTime?: number;
    customState?: Record<string, any>;
}
export interface StateRecoveryConfig {
    maxAttempts: number;
    retryDelay: number;
    maxRetryDelay: number;
    recoveryTimeout: number;
    validateState: boolean;
}
export declare enum DeviceStateEvent {
    STATE_CHANGED = "stateChanged",
    RECOVERY_STARTED = "recoveryStarted",
    RECOVERY_COMPLETED = "recoveryCompleted",
    RECOVERY_FAILED = "recoveryFailed"
}
export declare class DeviceStateManager extends EventEmitter {
    private static instance;
    private readonly deviceStates;
    private readonly recoveryTimeouts;
    private readonly commandProcessor;
    private readonly logger;
    private readonly config;
    private constructor();
    static getInstance(config?: Partial<StateRecoveryConfig>): DeviceStateManager;
    registerDevice(device: Device): void;
    unregisterDevice(deviceId: string): void;
    updateDeviceState(deviceId: string, status: Partial<DeviceStatus>, customState?: Record<string, any>): Promise<void>;
    getDeviceState(deviceId: string): DeviceState | undefined;
    saveCommand(deviceId: string, command: DeviceCommand): Promise<void>;
    private monitorDeviceState;
    private shouldAttemptRecovery;
    private initiateStateRecovery;
    private performStateRecovery;
    private executeRecoverySteps;
    private validateDeviceState;
    private validateCustomState;
    private getDevice;
    getConfig(): StateRecoveryConfig;
    updateConfig(config: Partial<StateRecoveryConfig>): void;
}
