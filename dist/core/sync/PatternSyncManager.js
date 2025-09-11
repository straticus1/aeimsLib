"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternSyncManager = void 0;
const events_1 = require("events");
const MediaSync_1 = require("./MediaSync");
const BiometricSync_1 = require("./BiometricSync");
const VRSync_1 = require("./VRSync");
/**
 * Advanced Pattern Synchronization Manager
 *
 * Handles complex synchronization between devices, media content, biometric feedback,
 * and VR/AR systems. Provides real-time adjustment and safety monitoring.
 */
class PatternSyncManager extends events_1.EventEmitter {
    constructor(deviceManager) {
        super();
        this.syncOptions = {
            latencyCompensation: true,
            safetyThresholds: {
                maxIntensity: 100,
                maxDuration: 3600000, // 1 hour
                cooldownPeriod: 300000 // 5 minutes
            }
        };
        this.biometricBaselines = new Map();
        this.activePatterns = new Map();
        this.lastActivity = new Map();
        this.deviceManager = deviceManager;
        this.mediaSync = new MediaSync_1.MediaSync();
        this.biometricSync = new BiometricSync_1.BiometricSync();
        this.vrSync = new VRSync_1.VRSync();
        this.initializeListeners();
    }
    /**
     * Start synchronized pattern playback
     */
    async startSync(pattern, deviceIds, options = {}) {
        this.validateSafety(pattern, deviceIds);
        this.syncOptions = { ...this.syncOptions, ...options };
        // Initialize synchronization components
        if (options.mediaSync) {
            await this.mediaSync.initialize();
        }
        if (options.biometricSync) {
            await this.biometricSync.initialize();
        }
        if (options.vrSync) {
            await this.vrSync.initialize();
        }
        // Start pattern with timing coordination
        for (const deviceId of deviceIds) {
            const device = this.deviceManager.getDevice(deviceId);
            if (!device)
                continue;
            // Calculate device-specific latency compensation
            const latencyOffset = this.calculateLatencyOffset(device);
            // Apply initial modifiers
            const modifiedPattern = this.applyModifiers(pattern, deviceId);
            // Store active pattern
            this.activePatterns.set(deviceId, modifiedPattern);
            this.lastActivity.set(deviceId, Date.now());
            // Start pattern with timing coordination
            await this.deviceManager.startPattern(deviceId, modifiedPattern, { latencyOffset });
            this.emit('patternStarted', {
                deviceId,
                pattern: modifiedPattern,
                timestamp: Date.now()
            });
        }
    }
    /**
     * Stop synchronized patterns
     */
    async stopSync(deviceIds) {
        for (const deviceId of deviceIds) {
            await this.deviceManager.stopPattern(deviceId);
            this.activePatterns.delete(deviceId);
            this.lastActivity.delete(deviceId);
            this.emit('patternStopped', {
                deviceId,
                timestamp: Date.now()
            });
        }
    }
    /**
     * Update pattern synchronization with new data
     */
    async updateSync(deviceId, biometricData, vrData, mediaPosition) {
        const pattern = this.activePatterns.get(deviceId);
        if (!pattern)
            return;
        // Calculate pattern modifications based on inputs
        const intensityModifier = this.calculateIntensityModifier(deviceId, biometricData, vrData);
        const timingModifier = this.calculateTimingModifier(deviceId, mediaPosition);
        // Apply modifications
        const modifiedPattern = pattern.clone();
        modifiedPattern.intensity *= intensityModifier;
        modifiedPattern.timing = this.adjustTiming(pattern.timing, timingModifier);
        // Validate safety thresholds
        this.validateSafety(modifiedPattern, [deviceId]);
        // Update pattern
        await this.deviceManager.updatePattern(deviceId, modifiedPattern);
        this.activePatterns.set(deviceId, modifiedPattern);
        this.lastActivity.set(deviceId, Date.now());
        this.emit('patternUpdated', {
            deviceId,
            pattern: modifiedPattern,
            modifiers: {
                intensity: intensityModifier,
                timing: timingModifier
            },
            timestamp: Date.now()
        });
    }
    /**
     * Set synchronization options
     */
    setSyncOptions(options) {
        this.syncOptions = { ...this.syncOptions, ...options };
    }
    /**
     * Get pattern statistics
     */
    getPatternStats(deviceId) {
        const pattern = this.activePatterns.get(deviceId);
        if (!pattern)
            return null;
        return {
            deviceId,
            pattern: pattern.toJSON(),
            duration: Date.now() - (this.lastActivity.get(deviceId) || 0),
            biometrics: this.biometricSync.getStats(deviceId),
            vrStats: this.vrSync.getStats(deviceId),
            mediaSync: this.mediaSync.getStats(deviceId)
        };
    }
    initializeListeners() {
        // Listen for biometric changes
        this.biometricSync.on('biometricUpdate', async (data) => {
            const { deviceId, biometrics } = data;
            await this.updateSync(deviceId, biometrics);
        });
        // Listen for VR updates
        this.vrSync.on('vrUpdate', async (data) => {
            const { deviceId, vrData } = data;
            await this.updateSync(deviceId, undefined, vrData);
        });
        // Listen for media position updates
        this.mediaSync.on('mediaUpdate', async (data) => {
            const { deviceId, position } = data;
            await this.updateSync(deviceId, undefined, undefined, position);
        });
        // Listen for safety events
        this.deviceManager.on('safetyEvent', async (data) => {
            const { deviceId, type } = data;
            if (type === 'threshold_exceeded') {
                await this.stopSync([deviceId]);
            }
        });
    }
    validateSafety(pattern, deviceIds) {
        const { safetyThresholds } = this.syncOptions;
        if (!safetyThresholds)
            return;
        // Check intensity thresholds
        if (safetyThresholds.maxIntensity &&
            pattern.getMaxIntensity() > safetyThresholds.maxIntensity) {
            throw new Error(`Pattern intensity exceeds safety threshold`);
        }
        // Check duration thresholds
        if (safetyThresholds.maxDuration &&
            pattern.getDuration() > safetyThresholds.maxDuration) {
            throw new Error(`Pattern duration exceeds safety threshold`);
        }
        // Check cooldown periods
        for (const deviceId of deviceIds) {
            const lastActive = this.lastActivity.get(deviceId);
            if (lastActive && safetyThresholds.cooldownPeriod) {
                const timeSinceLastUse = Date.now() - lastActive;
                if (timeSinceLastUse < safetyThresholds.cooldownPeriod) {
                    throw new Error(`Device ${deviceId} is still in cooldown period`);
                }
            }
        }
    }
    calculateLatencyOffset(device) {
        if (!this.syncOptions.latencyCompensation)
            return 0;
        // Calculate network latency
        const networkLatency = device.getLatency?.() || 0;
        // Calculate processing overhead
        const processingLatency = device.getProcessingTime?.() || 0;
        // Add safety margin
        const safetyMargin = 50; // 50ms safety margin
        return networkLatency + processingLatency + safetyMargin;
    }
    calculateIntensityModifier(deviceId, biometricData, vrData) {
        let modifier = 1.0;
        // Biometric modification
        if (biometricData) {
            const baseline = this.biometricBaselines.get(deviceId);
            if (baseline) {
                // Adjust based on arousal level changes
                if (biometricData.arousalLevel && baseline.arousalLevel) {
                    modifier *= (biometricData.arousalLevel / baseline.arousalLevel);
                }
                // Adjust based on heart rate
                if (biometricData.heartRate && baseline.heartRate) {
                    const hrRatio = biometricData.heartRate / baseline.heartRate;
                    modifier *= Math.min(hrRatio, 1.5); // Cap at 50% increase
                }
            }
        }
        // VR modification
        if (vrData) {
            // Modify based on proximity
            if (vrData.proximity !== undefined) {
                modifier *= Math.max(0.1, Math.min(1.5, vrData.proximity));
            }
            // Modify based on velocity
            if (vrData.velocity) {
                const speed = Math.sqrt(vrData.velocity[0] ** 2 +
                    vrData.velocity[1] ** 2 +
                    vrData.velocity[2] ** 2);
                modifier *= Math.max(0.1, Math.min(1.5, speed));
            }
        }
        // Ensure we stay within safe bounds
        const { maxIntensity } = this.syncOptions.safetyThresholds || {};
        if (maxIntensity) {
            modifier = Math.min(modifier, maxIntensity);
        }
        return modifier;
    }
    calculateTimingModifier(deviceId, mediaPosition) {
        let modifier = 1.0;
        if (mediaPosition !== undefined) {
            const pattern = this.activePatterns.get(deviceId);
            if (pattern) {
                // Synchronize pattern timing with media position
                const patternPosition = pattern.getCurrentPosition();
                const drift = mediaPosition - patternPosition;
                // Adjust timing to catch up or slow down
                if (Math.abs(drift) > 100) { // More than 100ms drift
                    modifier = 1.0 + (drift / 1000); // Adjust by drift amount
                    modifier = Math.max(0.5, Math.min(1.5, modifier)); // Limit adjustment
                }
            }
        }
        return modifier;
    }
    adjustTiming(timing, modifier) {
        // Clone timing to avoid modifying original
        const adjustedTiming = { ...timing };
        // Adjust all timing values
        Object.keys(adjustedTiming).forEach(key => {
            if (typeof adjustedTiming[key] === 'number') {
                adjustedTiming[key] *= modifier;
            }
        });
        return adjustedTiming;
    }
}
exports.PatternSyncManager = PatternSyncManager;
//# sourceMappingURL=PatternSyncManager.js.map