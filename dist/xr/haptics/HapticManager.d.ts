import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
import { DeviceManager } from '../../core/DeviceManager';
import { PatternFactory } from '../../patterns/PatternFactory';
interface HapticOptions {
    defaultDuration: number;
    maxIntensity: number;
    minIntensity: number;
    maxLatency: number;
    bufferSize: number;
    priorityThreshold: number;
    smoothingEnabled: boolean;
    smoothingWindow: number;
    rampDuration: number;
    collisionMultiplier: number;
    velocityMultiplier: number;
    accelerationMultiplier: number;
}
interface HapticEffect {
    type: string;
    intensity: number;
    duration: number;
    pattern?: string;
    parameters?: {
        [key: string]: number;
    };
}
interface HapticEvent {
    type: string;
    timestamp: number;
    intensity: number;
    duration?: number;
    data?: any;
}
/**
 * Haptic Manager
 * Manages haptic feedback effects and patterns for XR/VR integration
 */
export declare class HapticManager extends EventEmitter {
    private deviceManager;
    private patternFactory;
    private telemetry;
    private options;
    private states;
    private effects;
    private eventBuffer;
    private updateTimer?;
    constructor(deviceManager: DeviceManager, patternFactory: PatternFactory, telemetry: TelemetryManager, options?: Partial<HapticOptions>);
    /**
     * Enable haptics for device
     */
    enableHaptics(deviceId: string): Promise<void>;
    /**
     * Disable haptics for device
     */
    disableHaptics(deviceId: string): Promise<void>;
    /**
     * Register haptic effect
     */
    registerEffect(name: string, effect: Omit<HapticEffect, 'type'>): void;
    /**
     * Play haptic effect
     */
    playEffect(deviceId: string, effectName: string, params?: any): Promise<void>;
    /**
     * Handle haptic event
     */
    handleEvent(event: HapticEvent): Promise<void>;
    private initializeOptions;
    private initializeDefaultEffects;
    private startUpdateTimer;
    private processHapticUpdate;
    private processQueuedEffects;
    private processRecentEvents;
    private smoothIntensity;
    private isSignificantEvent;
}
export {};
