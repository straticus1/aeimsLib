import { Device, DeviceInfo, DeviceCommand } from '../../interfaces/device';
import { EventEmitter } from 'events';
/**
 * Device Simulator Configuration
 */
export interface SimulatorConfig {
    connectionDelay?: number;
    randomDisconnects?: boolean;
    disconnectProbability?: number;
    commandDelay?: number;
    commandFailureRate?: number;
    errorTypes?: string[];
    batteryLevel?: number;
    batteryDrainRate?: number;
    supportedCommands?: string[];
    featureFlags?: Record<string, boolean>;
    latencyRange?: [number, number];
    packetLossRate?: number;
    jitterRange?: [number, number];
}
/**
 * Device State
 */
export interface DeviceState {
    connected: boolean;
    batteryLevel: number;
    lastCommand?: DeviceCommand;
    commandHistory: DeviceCommand[];
    errors: Error[];
    metrics: {
        commandsReceived: number;
        commandsSucceeded: number;
        commandsFailed: number;
        totalLatency: number;
        disconnections: number;
    };
}
/**
 * Simulated Device Implementation
 */
export declare class DeviceSimulator extends EventEmitter implements Device {
    readonly info: DeviceInfo;
    private state;
    private config;
    private monitor;
    private updateInterval;
    private networkConditions;
    constructor(info: DeviceInfo, config?: SimulatorConfig);
    /**
     * Connect to the simulated device
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the simulated device
     */
    disconnect(): Promise<void>;
    /**
     * Check connection status
     */
    isConnected(): boolean;
    /**
     * Send command to the simulated device
     */
    sendCommand(command: DeviceCommand): Promise<void>;
    /**
     * Get current device state
     */
    getDeviceState(): DeviceState;
    /**
     * Update simulator configuration
     */
    updateConfig(config: Partial<SimulatorConfig>): void;
    /**
     * Reset simulator state
     */
    reset(): void;
    private startStateUpdates;
    private stopStateUpdates;
    private simulateCommandExecution;
    private simulateNetworkDelay;
    private shouldSimulatePacketLoss;
    private handleCommandError;
    private getRandomError;
    private getRandomInRange;
}
/**
 * Create a simulated device
 */
export declare function createSimulatedDevice(info: DeviceInfo, config?: SimulatorConfig): Device;
