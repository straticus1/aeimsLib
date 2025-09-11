"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VRDeviceSync = void 0;
const events_1 = require("events");
/**
 * VR Device Sync
 * Manages device synchronization with VR/XR events and haptic feedback
 */
class VRDeviceSync extends events_1.EventEmitter {
    constructor(deviceManager, patternFactory, telemetry, options = {}) {
        super();
        this.deviceManager = deviceManager;
        this.patternFactory = patternFactory;
        this.telemetry = telemetry;
        this.syncStates = new Map();
        this.eventBuffer = [];
        this.patternCache = new Map();
        this.options = this.initializeOptions(options);
    }
    /**
     * Enable VR sync for device
     */
    async enableSync(deviceId) {
        if (this.syncStates.has(deviceId)) {
            throw new Error('Sync already enabled for device');
        }
        // Initialize sync state
        const state = {
            enabled: true,
            latency: 0,
            jitter: 0,
            drift: 0,
            lastSync: Date.now()
        };
        this.syncStates.set(deviceId, state);
        // Start sync timer if not running
        if (!this.syncTimer) {
            this.startSyncTimer();
        }
        // Track sync enabled
        await this.telemetry.track({
            type: 'vr_sync_enabled',
            timestamp: Date.now(),
            data: {
                deviceId
            }
        });
    }
    /**
     * Disable VR sync for device
     */
    async disableSync(deviceId) {
        const state = this.syncStates.get(deviceId);
        if (!state)
            return;
        // Stop sync
        state.enabled = false;
        this.syncStates.delete(deviceId);
        // Stop timer if no synced devices
        if (this.syncStates.size === 0 && this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = undefined;
        }
        // Track sync disabled
        await this.telemetry.track({
            type: 'vr_sync_disabled',
            timestamp: Date.now(),
            data: {
                deviceId
            }
        });
    }
    /**
     * Handle VR event
     */
    async handleEvent(event) {
        // Add to buffer
        this.eventBuffer.push(event);
        // Trim buffer if needed
        while (this.eventBuffer.length > this.options.bufferSize) {
            this.eventBuffer.shift();
        }
        // Track significant events
        if (this.isSignificantEvent(event)) {
            await this.telemetry.track({
                type: 'vr_significant_event',
                timestamp: event.timestamp,
                data: {
                    eventType: event.type,
                    position: event.position,
                    force: event.force
                }
            });
        }
    }
    /**
     * Get sync stats for device
     */
    getSyncStats(deviceId) {
        return this.syncStates.get(deviceId) || null;
    }
    initializeOptions(options) {
        return {
            syncInterval: options.syncInterval || 16, // ~60fps
            maxLatency: options.maxLatency || 50, // 50ms
            bufferSize: options.bufferSize || 1000,
            minIntensity: options.minIntensity || 0,
            maxIntensity: options.maxIntensity || 1,
            rampDuration: options.rampDuration || 100,
            prioritizeLatency: options.prioritizeLatency || true,
            smoothingWindow: options.smoothingWindow || 5
        };
    }
    startSyncTimer() {
        this.syncTimer = setInterval(() => {
            this.processSyncTick();
        }, this.options.syncInterval);
    }
    async processSyncTick() {
        const now = Date.now();
        const recentEvents = this.getRecentEvents(now);
        for (const [deviceId, state] of this.syncStates.entries()) {
            if (!state.enabled)
                continue;
            try {
                // Calculate intensity from events
                const intensity = this.calculateIntensity(recentEvents);
                // Apply smoothing if enabled
                const smoothedIntensity = this.options.smoothingWindow > 1 ?
                    this.smoothIntensity(intensity, deviceId) :
                    intensity;
                // Create or update pattern
                const pattern = this.getOrCreatePattern(deviceId, smoothedIntensity);
                // Send pattern to device
                await this.deviceManager.startPattern(deviceId, pattern);
                // Update sync stats
                state.lastSync = now;
                state.latency = this.calculateLatency(recentEvents);
                state.jitter = this.calculateJitter(deviceId);
                state.drift = this.calculateDrift(deviceId);
                // Emit sync update
                this.emit('sync_update', {
                    deviceId,
                    stats: state,
                    pattern
                });
            }
            catch (error) {
                // Track error
                await this.telemetry.track({
                    type: 'vr_sync_error',
                    timestamp: now,
                    data: {
                        deviceId,
                        error: error.message
                    }
                });
                // Disable sync if too many errors
                if (this.shouldDisableSync(deviceId)) {
                    await this.disableSync(deviceId);
                    this.emit('sync_error', {
                        deviceId,
                        error
                    });
                }
            }
        }
    }
    getRecentEvents(now) {
        // Get events within sync window
        const cutoff = now - this.options.syncInterval;
        return this.eventBuffer.filter(e => e.timestamp >= cutoff);
    }
    calculateIntensity(events) {
        if (events.length === 0) {
            return 0;
        }
        // Calculate base intensity from velocity and collisions
        let intensity = 0;
        for (const event of events) {
            if (event.force) {
                intensity = Math.max(intensity, event.force);
            }
            if (event.velocity) {
                const speed = Math.sqrt(event.velocity.x ** 2 +
                    event.velocity.y ** 2 +
                    event.velocity.z ** 2);
                intensity = Math.max(intensity, speed);
            }
            if (event.collisions) {
                for (const collision of event.collisions) {
                    intensity = Math.max(intensity, collision.force);
                }
            }
        }
        // Normalize intensity
        intensity = Math.max(this.options.minIntensity, Math.min(this.options.maxIntensity, intensity));
        return intensity;
    }
    smoothIntensity(intensity, deviceId) {
        const pattern = this.patternCache.get(deviceId);
        if (!pattern || !pattern.lastIntensity) {
            return intensity;
        }
        // Apply smoothing
        const delta = intensity - pattern.lastIntensity;
        const step = delta / this.options.smoothingWindow;
        return pattern.lastIntensity + step;
    }
    getOrCreatePattern(deviceId, intensity) {
        let pattern = this.patternCache.get(deviceId);
        if (!pattern || pattern.intensity !== intensity) {
            // Create new pattern
            pattern = this.patternFactory.create('haptic', {
                intensity,
                duration: this.options.syncInterval,
                rampDuration: this.options.rampDuration
            });
            pattern.lastIntensity = intensity;
            this.patternCache.set(deviceId, pattern);
        }
        return pattern;
    }
    calculateLatency(events) {
        if (events.length === 0)
            return 0;
        // Calculate average event processing latency
        const latencies = events.map(e => Date.now() - e.timestamp);
        return latencies.reduce((a, b) => a + b, 0) / latencies.length;
    }
    calculateJitter(deviceId) {
        const state = this.syncStates.get(deviceId);
        if (!state || !state.latency)
            return 0;
        // Calculate latency variation
        const latencyDiff = Math.abs(state.latency - state.lastSync);
        return (latencyDiff + state.jitter) / 2;
    }
    calculateDrift(deviceId) {
        const state = this.syncStates.get(deviceId);
        if (!state)
            return 0;
        // Calculate time drift
        const expectedInterval = this.options.syncInterval;
        const actualInterval = Date.now() - state.lastSync;
        return Math.abs(actualInterval - expectedInterval);
    }
    shouldDisableSync(deviceId) {
        const state = this.syncStates.get(deviceId);
        if (!state)
            return false;
        // Check sync quality
        return (state.latency > this.options.maxLatency * 2 ||
            state.jitter > this.options.maxLatency ||
            state.drift > this.options.syncInterval);
    }
    isSignificantEvent(event) {
        return (event.force !== undefined && event.force > 0.5 ||
            event.collisions !== undefined && event.collisions.length > 0);
    }
}
exports.VRDeviceSync = VRDeviceSync;
//# sourceMappingURL=VRDeviceSync.js.map