import { BLEProtocol } from './BLEProtocol';
import { DeviceInfo, DeviceStatus, DeviceCommand } from '../interfaces/device';
export interface XRControllerInfo extends DeviceInfo {
    controllerType: 'index' | 'oculus' | 'vive' | 'wmr';
    trackingType: 'inside-out' | 'outside-in';
    degreesOfFreedom: 3 | 6;
    hapticCapabilities: {
        frequency: {
            min: number;
            max: number;
        };
        amplitude: {
            min: number;
            max: number;
        };
        patterns: boolean;
        continuous: boolean;
    };
}
export interface XRControllerStatus extends DeviceStatus {
    hapticState: {
        active: boolean;
        frequency: number;
        amplitude: number;
        pattern?: string;
    };
    batteryLevel: number;
    trackingState: 'tracked' | 'limited' | 'not-tracked';
}
export interface XRControllerCommand extends DeviceCommand {
    type: 'vibrate' | 'pattern' | 'stop';
    frequency?: number;
    amplitude?: number;
    duration?: number;
    pattern?: {
        points: Array<{
            frequency: number;
            amplitude: number;
            duration: number;
        }>;
        repeat?: number;
    };
}
export declare class XRControllerProtocol extends BLEProtocol {
    private static readonly SERVICE_UUIDS;
    private static readonly HAPTIC_UUID;
    private static readonly BATTERY_UUID;
    private static readonly TRACKING_UUID;
    private info;
    private status;
    private activePattern?;
    constructor(deviceId: string, controllerType: 'index' | 'oculus' | 'vive' | 'wmr');
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: XRControllerCommand): Promise<void>;
    private vibrate;
    private playPattern;
    private stop;
    private stopActivePattern;
    private validateHapticParameters;
    private encodeHapticCommand;
    private updateStatus;
    private decodeTrackingState;
    getInfo(): XRControllerInfo;
    getStatus(): XRControllerStatus;
    private getManufacturer;
    private getTrackingType;
    private getDoF;
    private getHapticCapabilities;
    protected handleNotification(uuid: string, data: Buffer): void;
}
