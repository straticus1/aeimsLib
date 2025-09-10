import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
import { DeviceManager } from '../../core/DeviceManager';
import { PatternFactory } from '../../patterns/PatternFactory';

interface HapticOptions {
  // General settings
  defaultDuration: number;
  maxIntensity: number;
  minIntensity: number;
  
  // Latency settings
  maxLatency: number;
  bufferSize: number;
  priorityThreshold: number;
  
  // Pattern settings
  smoothingEnabled: boolean;
  smoothingWindow: number;
  rampDuration: number;
  
  // Effect settings
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

interface HapticState {
  enabled: boolean;
  activeEffect?: HapticEffect;
  queuedEffects: HapticEffect[];
  lastUpdate: number;
  intensity: number;
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
export class HapticManager extends EventEmitter {
  private options: Required<HapticOptions>;
  private states: Map<string, HapticState> = new Map();
  private effects: Map<string, HapticEffect> = new Map();
  private eventBuffer: HapticEvent[] = [];
  private updateTimer?: NodeJS.Timer;

  constructor(
    private deviceManager: DeviceManager,
    private patternFactory: PatternFactory,
    private telemetry: TelemetryManager,
    options: Partial<HapticOptions> = {}
  ) {
    super();
    this.options = this.initializeOptions(options);
    this.initializeDefaultEffects();
  }

  /**
   * Enable haptics for device
   */
  async enableHaptics(deviceId: string): Promise<void> {
    if (this.states.has(deviceId)) {
      throw new Error('Haptics already enabled for device');
    }

    // Initialize state
    const state: HapticState = {
      enabled: true,
      queuedEffects: [],
      lastUpdate: Date.now(),
      intensity: 0
    };
    this.states.set(deviceId, state);

    // Start update timer if not running
    if (!this.updateTimer) {
      this.startUpdateTimer();
    }

    // Track haptics enabled
    await this.telemetry.track({
      type: 'haptics_enabled',
      timestamp: Date.now(),
      data: {
        deviceId
      }
    });
  }

  /**
   * Disable haptics for device
   */
  async disableHaptics(deviceId: string): Promise<void> {
    const state = this.states.get(deviceId);
    if (!state) return;

    // Stop haptics
    state.enabled = false;
    state.queuedEffects = [];
    state.activeEffect = undefined;

    this.states.delete(deviceId);

    // Stop timer if no enabled devices
    if (this.states.size === 0 && this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }

    // Track haptics disabled
    await this.telemetry.track({
      type: 'haptics_disabled',
      timestamp: Date.now(),
      data: {
        deviceId
      }
    });
  }

  /**
   * Register haptic effect
   */
  registerEffect(
    name: string,
    effect: Omit<HapticEffect, 'type'>
  ): void {
    this.effects.set(name, {
      type: name,
      ...effect
    });
  }

  /**
   * Play haptic effect
   */
  async playEffect(
    deviceId: string,
    effectName: string,
    params: any = {}
  ): Promise<void> {
    const state = this.states.get(deviceId);
    if (!state || !state.enabled) {
      throw new Error('Haptics not enabled for device');
    }

    const effect = this.effects.get(effectName);
    if (!effect) {
      throw new Error(`Effect '${effectName}' not found`);
    }

    // Apply parameters
    const fullEffect: HapticEffect = {
      ...effect,
      parameters: {
        ...effect.parameters,
        ...params
      }
    };

    // Queue effect
    state.queuedEffects.push(fullEffect);

    // Track effect queued
    await this.telemetry.track({
      type: 'haptic_effect_queued',
      timestamp: Date.now(),
      data: {
        deviceId,
        effect: effectName,
        params
      }
    });
  }

  /**
   * Handle haptic event
   */
  async handleEvent(event: HapticEvent): Promise<void> {
    // Add to buffer
    this.eventBuffer.push(event);

    // Trim buffer if needed
    while (this.eventBuffer.length > this.options.bufferSize) {
      this.eventBuffer.shift();
    }

    // Track significant events
    if (this.isSignificantEvent(event)) {
      await this.telemetry.track({
        type: 'haptic_significant_event',
        timestamp: event.timestamp,
        data: {
          eventType: event.type,
          intensity: event.intensity
        }
      });
    }
  }

  private initializeOptions(options: Partial<HapticOptions>): Required<HapticOptions> {
    return {
      defaultDuration: options.defaultDuration || 100,
      maxIntensity: options.maxIntensity || 1,
      minIntensity: options.minIntensity || 0,
      maxLatency: options.maxLatency || 50,
      bufferSize: options.bufferSize || 1000,
      priorityThreshold: options.priorityThreshold || 0.8,
      smoothingEnabled: options.smoothingEnabled || true,
      smoothingWindow: options.smoothingWindow || 5,
      rampDuration: options.rampDuration || 50,
      collisionMultiplier: options.collisionMultiplier || 1,
      velocityMultiplier: options.velocityMultiplier || 0.5,
      accelerationMultiplier: options.accelerationMultiplier || 0.3
    };
  }

  private initializeDefaultEffects(): void {
    // Register default effects
    this.registerEffect('impact', {
      intensity: 1,
      duration: 100,
      pattern: 'pulse'
    });

    this.registerEffect('continuous', {
      intensity: 0.5,
      duration: -1, // Infinite
      pattern: 'constant'
    });

    this.registerEffect('ramp', {
      intensity: 0.8,
      duration: 500,
      pattern: 'ramp',
      parameters: {
        startIntensity: 0,
        endIntensity: 1
      }
    });
  }

  private startUpdateTimer(): void {
    this.updateTimer = setInterval(() => {
      this.processHapticUpdate();
    }, 16); // ~60fps
  }

  private async processHapticUpdate(): Promise<void> {
    const now = Date.now();

    for (const [deviceId, state] of this.states.entries()) {
      if (!state.enabled) continue;

      try {
        // Process queued effects
        if (state.queuedEffects.length > 0) {
          await this.processQueuedEffects(deviceId, state);
        }

        // Process recent events
        await this.processRecentEvents(deviceId, state, now);

        // Update state
        state.lastUpdate = now;

      } catch (error) {
        // Track error
        await this.telemetry.track({
          type: 'haptic_update_error',
          timestamp: now,
          data: {
            deviceId,
            error: error.message
          }
        });
      }
    }
  }

  private async processQueuedEffects(
    deviceId: string,
    state: HapticState
  ): Promise<void> {
    // Get next effect
    const effect = state.queuedEffects[0];

    // Check if current effect is done
    if (state.activeEffect) {
      const elapsed = Date.now() - state.lastUpdate;
      if (elapsed < state.activeEffect.duration) {
        return;
      }
      state.activeEffect = undefined;
    }

    // Start new effect
    state.activeEffect = effect;
    state.queuedEffects.shift();

    // Create pattern
    const pattern = this.patternFactory.create(effect.pattern || 'constant', {
      intensity: effect.intensity,
      duration: effect.duration >= 0 ? effect.duration : undefined,
      ...effect.parameters
    });

    // Start pattern
    await this.deviceManager.startPattern(deviceId, pattern);

    // Track effect start
    await this.telemetry.track({
      type: 'haptic_effect_started',
      timestamp: Date.now(),
      data: {
        deviceId,
        effect: effect.type
      }
    });
  }

  private async processRecentEvents(
    deviceId: string,
    state: HapticState,
    now: number
  ): Promise<void> {
    // Get recent events
    const cutoff = now - 100; // Look at last 100ms
    const events = this.eventBuffer.filter(e => e.timestamp >= cutoff);

    if (events.length === 0) return;

    // Calculate intensity from events
    let intensity = 0;
    for (const event of events) {
      switch (event.type) {
        case 'collision':
          intensity = Math.max(
            intensity,
            event.intensity * this.options.collisionMultiplier
          );
          break;

        case 'velocity':
          intensity = Math.max(
            intensity,
            event.intensity * this.options.velocityMultiplier
          );
          break;

        case 'acceleration':
          intensity = Math.max(
            intensity,
            event.intensity * this.options.accelerationMultiplier
          );
          break;

        default:
          intensity = Math.max(intensity, event.intensity);
      }
    }

    // Apply smoothing if enabled
    if (this.options.smoothingEnabled) {
      intensity = this.smoothIntensity(intensity, state.intensity);
    }

    // Update state
    state.intensity = intensity;

    // Create pattern if intensity changed significantly
    if (Math.abs(intensity - (state.activeEffect?.intensity || 0)) > 0.1) {
      const pattern = this.patternFactory.create('constant', {
        intensity,
        duration: this.options.defaultDuration,
        rampDuration: this.options.rampDuration
      });

      await this.deviceManager.startPattern(deviceId, pattern);
    }
  }

  private smoothIntensity(
    newIntensity: number,
    currentIntensity: number
  ): number {
    const delta = newIntensity - currentIntensity;
    const step = delta / this.options.smoothingWindow;
    return currentIntensity + step;
  }

  private isSignificantEvent(event: HapticEvent): boolean {
    return (
      event.intensity > this.options.priorityThreshold ||
      event.type === 'collision'
    );
  }
}
