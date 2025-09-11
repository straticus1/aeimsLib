import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
import { DeviceManager } from '../../core/DeviceManager';
import { PatternFactory } from '../../patterns/PatternFactory';
interface VRSyncOptions {
    syncInterval: number;
    maxLatency: number;
    bufferSize: number;
    minIntensity: number;
    maxIntensity: number;
    rampDuration: number;
    prioritizeLatency: boolean;
    smoothingWindow: number;
}
interface SyncState {
    enabled: boolean;
    latency: number;
    jitter: number;
    drift: number;
    lastSync: number;
}
interface VREvent {
    type: string;
    timestamp: number;
    position: {
        x: number;
        y: number;
        z: number;
    };
    rotation: {
        x: number;
        y: number;
        z: number;
        w: number;
    };
    velocity?: {
        x: number;
        y: number;
        z: number;
    };
    force?: number;
    collisions?: Array<{
        point: {
            x: number;
            y: number;
            z: number;
        };
        normal: {
            x: number;
            y: number;
            z: number;
        };
        force: number;
    }>;
}
/**
 * VR Device Sync
 * Manages device synchronization with VR/XR events and haptic feedback
 */
export declare class VRDeviceSync extends EventEmitter {
    private deviceManager;
    private patternFactory;
    private telemetry;
    private options;
    private syncStates;
    private eventBuffer;
    private syncTimer?;
    private patternCache;
    constructor(deviceManager: DeviceManager, patternFactory: PatternFactory, telemetry: TelemetryManager, options?: Partial<VRSyncOptions>);
    /**
     * Enable VR sync for device
     */
    enableSync(deviceId: string): Promise<void>;
    /**
     * Disable VR sync for device
     */
    disableSync(deviceId: string): Promise<void>;
    /**
     * Handle VR event
     */
    handleEvent(event: VREvent): Promise<void>;
    /**
     * Get sync stats for device
     */
    getSyncStats(deviceId: string): SyncState | null;
    private initializeOptions;
    private startSyncTimer;
    private processSyncTick;
    private getRecentEvents;
    private calculateIntensity;
    private smoothIntensity;
    private getOrCreatePattern;
    private calculateLatency;
    private calculateJitter;
    private calculateDrift;
    private shouldDisableSync;
    private isSignificantEvent;
}
export {};
