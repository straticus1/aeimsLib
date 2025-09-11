import { BLEProtocol } from './BLEProtocol';
import { DeviceInfo, DeviceStatus, DeviceCommand } from '../interfaces/device';
export interface HandyDeviceInfo extends DeviceInfo {
    firmwareVersion: string;
    serverTimeOffset: number;
    slideMin: number;
    slideMax: number;
    encoderResolution: number;
}
export interface HandyStatus extends DeviceStatus {
    mode: 'automatic' | 'manual' | 'sync';
    position: number;
    velocity: number;
    slideMin: number;
    slideMax: number;
}
export interface HandyCommand extends DeviceCommand {
    position?: number;
    velocity?: number;
    slideMin?: number;
    slideMax?: number;
    mode?: 'automatic' | 'manual' | 'sync';
}
export declare class HandyProtocol extends BLEProtocol {
    private static readonly SERVICE_UUID;
    private static readonly CONTROL_UUID;
    private static readonly STATUS_UUID;
    private static readonly SETTINGS_UUID;
    private info;
    private status;
    private serverTimeOffset;
    constructor(deviceId: string);
    connect(): Promise<void>;
    sendCommand(command: HandyCommand): Promise<void>;
    /**
     * Set device mode (automatic, manual, or sync)
     */
    setMode(mode: 'automatic' | 'manual' | 'sync'): Promise<void>;
    /**
     * Set absolute position (0-100)
     */
    setPosition(position: number): Promise<void>;
    /**
     * Set movement velocity (0-100)
     */
    setVelocity(velocity: number): Promise<void>;
    /**
     * Set stroke length range
     */
    setStrokeRange(min: number, max: number): Promise<void>;
    /**
     * Send timed movement command for synchronization
     */
    sendTimedCommand(position: number, velocity: number, timestamp: number): Promise<void>;
    getInfo(): HandyDeviceInfo;
    getStatus(): HandyStatus;
    private updateDeviceInfo;
    private synchronizeTime;
    private encodeCommand;
    private encodeTimedCommand;
    private decodeDeviceInfo;
    private decodeDeviceTime;
    protected handleNotification(uuid: string, data: Buffer): void;
    private handleStatusNotification;
}
