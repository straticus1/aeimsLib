import { EventEmitter } from 'events';
import { Device, DeviceInfo, DeviceCommand, DeviceProtocol } from '../interfaces/device';
import { MonitoringService } from '../interfaces/monitoring';
export declare class DeviceManager extends EventEmitter {
    private static instance;
    private devices;
    private protocols;
    private patterns;
    private monitoring?;
    private logger;
    private constructor();
    static getInstance(): DeviceManager;
    setMonitoringService(service: MonitoringService): void;
    registerProtocol(protocol: string, handler: DeviceProtocol): void;
    addDevice(deviceInfo: DeviceInfo): Promise<Device>;
    removeDevice(deviceId: string): Promise<void>;
    getDevice(deviceId: string): Device;
    getAllDevices(): Device[];
    sendCommand(deviceId: string, command: DeviceCommand): Promise<void>;
    private validateCommand;
    private updateDeviceStatus;
    private handleDeviceEvent;
}
