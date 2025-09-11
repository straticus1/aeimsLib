import { EventEmitter } from 'events';
import { Device, DeviceInfo, DeviceCommand } from '../../interfaces/device';
/**
 * PiShock device support
 */
export declare class PiShockDevice extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    private serverUrl;
    private socket;
    private apiKey;
    private monitor;
    private logger;
    private connected;
    constructor(info: DeviceInfo, serverUrl: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    sendCommand(command: DeviceCommand): Promise<void>;
    private handleMessage;
    private handleError;
    private sendShockCommand;
}
/**
 * TCode-compatible device support
 */
export declare class TCodeDevice extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    private baudRate;
    private serial;
    private monitor;
    private logger;
    private connected;
    private axisPositions;
    constructor(info: DeviceInfo, baudRate?: number);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    sendCommand(command: DeviceCommand): Promise<void>;
    private startReading;
    private handleResponse;
    private convertToTCode;
    private sendTCode;
}
/**
 * Bluetooth TENS unit support
 */
export declare class TENSDevice extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    private btDevice;
    private service;
    private characteristic;
    private monitor;
    private logger;
    private connected;
    constructor(info: DeviceInfo);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    sendCommand(command: DeviceCommand): Promise<void>;
    private sendTENSCommand;
    private calculateChecksum;
}
/**
 * Vibease device support
 */
export declare class VibeaseDevice extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    private btDevice;
    private characteristic;
    private monitor;
    private logger;
    private connected;
    constructor(info: DeviceInfo);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    sendCommand(command: DeviceCommand): Promise<void>;
    private sendVibeaseCommand;
}
/**
 * Satisfyer Connect device support
 */
export declare class SatisfyerDevice extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    private btDevice;
    private characteristics;
    private monitor;
    private logger;
    private connected;
    private static readonly SERVICE_UUID;
    private static readonly VIBRATION_UUID;
    private static readonly AIR_UUID;
    private static readonly BATTERY_UUID;
    constructor(info: DeviceInfo);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    sendCommand(command: DeviceCommand): Promise<void>;
    private sendSatisfyerCommand;
    private handleBatteryChange;
}
/**
 * Hicoo/Hi-Link device support
 */
export declare class HicooDevice extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    private btDevice;
    private characteristic;
    private monitor;
    private logger;
    private connected;
    constructor(info: DeviceInfo);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    sendCommand(command: DeviceCommand): Promise<void>;
    private sendHicooCommand;
    private calculateChecksum;
}
/**
 * LoveLife Krush/Apex device support
 */
export declare class LoveLifeDevice extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    private btDevice;
    private characteristic;
    private monitor;
    private logger;
    private connected;
    constructor(info: DeviceInfo);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    sendCommand(command: DeviceCommand): Promise<void>;
    private sendLoveLifeCommand;
    private handlePressureReading;
}
export declare function createAdditionalDevice(type: string, info: DeviceInfo, options?: any): Device;
