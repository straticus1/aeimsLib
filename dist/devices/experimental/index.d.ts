import { EventEmitter } from 'events';
import { Device, DeviceInfo, DeviceCommand } from '../../interfaces/device';
import { Logger } from '../../utils/Logger';
import { DeviceMonitoring } from '../../monitoring';
/**
 * Base class for experimental device support
 */
declare abstract class ExperimentalDevice extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    protected logger: Logger;
    protected monitor: DeviceMonitoring;
    protected connected: boolean;
    constructor(info: DeviceInfo);
    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract sendCommand(command: DeviceCommand): Promise<void>;
    isConnected(): boolean;
}
/**
 * Svakom device support
 */
export declare class SvakomDevice extends ExperimentalDevice {
    private btDevice;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: DeviceCommand): Promise<void>;
    private _sendRawCommand;
}
/**
 * Vorze device support
 */
export declare class VorzeDevice extends ExperimentalDevice {
    private socket;
    private readonly serverUrl;
    constructor(info: DeviceInfo, serverUrl: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: DeviceCommand): Promise<void>;
}
/**
 * XInput/DirectInput device support
 */
export declare class GamepadDevice extends ExperimentalDevice {
    private gamepad;
    private updateInterval;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: DeviceCommand): Promise<void>;
    private handleGamepadConnect;
    private handleGamepadDisconnect;
    private isCompatibleGamepad;
    private updateState;
}
/**
 * OSR/OpenSexRouter device support
 */
export declare class OSRDevice extends ExperimentalDevice {
    private socket;
    private readonly serverUrl;
    constructor(info: DeviceInfo, serverUrl: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: DeviceCommand): Promise<void>;
    private handleMessage;
    private handleError;
    private convertToOSRCommand;
    private sendOSRCommand;
}
/**
 * MaxPro/Max2 device support
 */
export declare class MaxDevice extends ExperimentalDevice {
    private btDevice;
    private characteristic;
    private notifyCharacteristic;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: DeviceCommand): Promise<void>;
    private handleNotification;
    private convertToMaxCommand;
}
/**
 * Handy/Stroker device support
 */
export declare class HandyDevice extends ExperimentalDevice {
    private socket;
    private readonly serverUrl;
    private connectionToken;
    constructor(info: DeviceInfo, serverUrl: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: DeviceCommand): Promise<void>;
    private handleMessage;
    private handleError;
    private convertToHandyCommand;
    private sendHandyCommand;
}
export * from './additional';
export declare function createExperimentalDevice(type: string, info: DeviceInfo, options?: any): Promise<Device>;
