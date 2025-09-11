import { EventEmitter } from 'events';
import { DeviceManager } from '../DeviceManager';
import { AuditLogger } from '../logging/AuditLogger';
interface ConsentRecord {
    userId: string;
    deviceId: string;
    grantedAt: number;
    expiresAt: number;
    scope: string[];
    revocable: boolean;
    restrictions?: {
        maxIntensity?: number;
        maxDuration?: number;
        allowedPatterns?: string[];
        blockedPatterns?: string[];
        timeRestrictions?: {
            allowedHours?: number[];
            blockedDays?: string[];
        };
    };
}
interface SafetyZone {
    id: string;
    name: string;
    type: 'intensity' | 'duration' | 'pattern' | 'time';
    conditions: {
        maxIntensity?: number;
        maxDuration?: number;
        allowedPatterns?: string[];
        allowedTimeRanges?: {
            start: number;
            end: number;
        }[];
    };
    actions: {
        reduceIntensity?: number;
        pauseDuration?: number;
        stopPattern?: boolean;
        notifyUser?: boolean;
        requireReauthorization?: boolean;
    };
}
/**
 * Safety and Consent Manager
 *
 * Handles comprehensive safety features including:
 * - Device safety thresholds
 * - User consent management
 * - Safety zones and boundaries
 * - Emergency stops and cooldowns
 * - Usage limits and restrictions
 */
export declare class SafetyManager extends EventEmitter {
    private deviceManager;
    private logger;
    private activeConsent;
    private safetyZones;
    private deviceUsage;
    private defaultThresholds;
    constructor(deviceManager: DeviceManager, logger: AuditLogger);
    /**
     * Grant consent for device usage
     */
    grantConsent(userId: string, deviceId: string, scope: string[], duration?: number, // 1 hour default
    restrictions?: ConsentRecord['restrictions']): Promise<void>;
    /**
     * Revoke consent
     */
    revokeConsent(userId: string, deviceId: string, reason: string): Promise<void>;
    /**
     * Add safety zone
     */
    addSafetyZone(zone: SafetyZone): void;
    /**
     * Remove safety zone
     */
    removeSafetyZone(zoneId: string): void;
    /**
     * Check if operation is safe
     */
    validateOperation(userId: string, deviceId: string, operation: {
        type: string;
        intensity?: number;
        duration?: number;
        pattern?: string;
    }): Promise<boolean>;
    /**
     * Emergency stop for device
     */
    emergencyStop(deviceId: string, reason: string): Promise<void>;
    /**
     * Get safety status
     */
    getSafetyStatus(deviceId: string): {
        deviceId: string;
        usage: {
            sessionCount: number;
            totalDuration: number;
            lastSessionEnd: number | undefined;
        };
        activeConsents: ConsentRecord[];
        safetyZones: SafetyZone[];
    };
    private initializeDefaultSafetyZones;
    private initializeListeners;
    private validateSafetyZone;
    private checkSafetyZone;
}
export {};
