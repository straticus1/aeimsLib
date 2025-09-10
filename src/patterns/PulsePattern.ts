import { BasePattern } from './BasePattern';
import { PulseConfig } from '../interfaces/patterns';

export class PulsePattern extends BasePattern {
  private config: PulseConfig;
  private pulseWidth: number;
  private interval: number;
  private lastPulseTime: number;
  private isInPulse: boolean;

  constructor(config: PulseConfig) {
    super(config);
    this.config = config;
    this.pulseWidth = config.pulseWidth.default;
    this.interval = config.interval.default;
    this.lastPulseTime = 0;
    this.isInPulse = false;
  }

  getIntensity(time: number): number {
    // Calculate time since the last pulse started
    const timeSinceLastPulse = time - this.lastPulseTime;

    // Check if we need to start a new pulse cycle
    if (timeSinceLastPulse >= this.interval) {
      this.lastPulseTime = time - (timeSinceLastPulse % this.interval);
      this.isInPulse = true;
    }

    // Check if we're still in the pulse width duration
    if (this.isInPulse && (time - this.lastPulseTime) >= this.pulseWidth) {
      this.isInPulse = false;
    }

    // Return max intensity during pulse, min intensity otherwise
    return this.clampIntensity(
      this.isInPulse ? this.config.maxIntensity : this.config.minIntensity
    );
  }

  setPulseWidth(width: number): void {
    if (width >= this.config.pulseWidth.min && width <= this.config.pulseWidth.max) {
      this.pulseWidth = width;
      this.updateTimestamp();
    }
  }

  setInterval(interval: number): void {
    if (interval >= this.config.interval.min && interval <= this.config.interval.max) {
      this.interval = interval;
      this.updateTimestamp();
    }
  }

  getNextUpdate(): number {
    const now = Date.now();
    const timeInCycle = (now - this.lastPulseTime) % this.interval;
    
    if (this.isInPulse) {
      // Next update when pulse ends
      return this.lastPulseTime + this.pulseWidth;
    } else {
      // Next update at start of next pulse
      return this.lastPulseTime + this.interval;
    }
  }
}
