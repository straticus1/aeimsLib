import { EventEmitter } from 'events';
import { DeviceManager } from '../DeviceManager';
import { Pattern } from '../patterns/Pattern';
interface SyncOptions {
    mediaSync?: boolean;
    biometricSync?: boolean;
    vrSync?: boolean;
    latencyCompensation?: boolean;
    safetyThresholds?: {
        maxIntensity?: number;
        maxDuration?: number;
        cooldownPeriod?: number;
    };
}
interface BiometricData {
    heartRate?: number;
    gsr?: number;
    muscleActivity?: number;
    arousalLevel?: number;
}
interface VRData {
    position?: [number, number, number];
    rotation?: [number, number, number];
    velocity?: [number, number, number];
    proximity?: number;
}
/**
 * Advanced Pattern Synchronization Manager
 *
 * Handles complex synchronization between devices, media content, biometric feedback,
 * and VR/AR systems. Provides real-time adjustment and safety monitoring.
 */
export declare class PatternSyncManager extends EventEmitter {
    private deviceManager;
    private mediaSync;
    private biometricSync;
    private vrSync;
    private syncOptions;
    private biometricBaselines;
    private activePatterns;
    private lastActivity;
    constructor(deviceManager: DeviceManager);
    /**
     * Start synchronized pattern playback
     */
    startSync(pattern: Pattern, deviceIds: string[], options?: SyncOptions): Promise<void>;
    /**
     * Stop synchronized patterns
     */
    stopSync(deviceIds: string[]): Promise<void>;
    /**
     * Update pattern synchronization with new data
     */
    updateSync(deviceId: string, biometricData?: BiometricData, vrData?: VRData, mediaPosition?: number): Promise<void>;
    /**
     * Set synchronization options
     */
    setSyncOptions(options: SyncOptions): void;
    /**
     * Get pattern statistics
     */
    getPatternStats(deviceId: string): {
        deviceId: string;
        pattern: any;
        duration: number;
        biometrics: any;
        vrStats: any;
        mediaSync: any;
    } | null;
    private initializeListeners;
    private validateSafety;
    private calculateLatencyOffset;
    private calculateIntensityModifier;
    private calculateTimingModifier;
    private adjustTiming;
}
export {};
