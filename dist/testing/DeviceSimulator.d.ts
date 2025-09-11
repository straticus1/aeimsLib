import { Device, DeviceInfo, DeviceStatus, DeviceCommand } from '../interfaces/device';
import { EventEmitter } from 'events';
export interface SimulationConfig {
    latency: number;
    packetLoss: number;
    disconnectProbability: number;
    batteryDrainRate: number;
    errorProbability: number;
}
export declare class DeviceSimulator extends EventEmitter implements Device {
    private info;
    private status;
    private config;
    private batteryLevel;
    private batteryInterval;
    constructor(info: DeviceInfo, config?: Partial<SimulationConfig>);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendCommand(command: DeviceCommand): Promise<void>;
    getStatus(): Promise<DeviceStatus>;
    getInfo(): DeviceInfo;
    private simulateLatency;
    private startBatterySimulation;
    simulateError(error: string): void;
    setBatteryLevel(level: number): void;
    setConnected(connected: boolean): void;
}
export declare function createSimulatedDevice(protocol: string, options?: Partial<SimulationConfig>): DeviceSimulator;
