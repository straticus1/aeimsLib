import { BasePattern } from './BasePattern';
import { EscalationConfig } from '../interfaces/patterns';

export class EscalationPattern extends BasePattern {
  private config: EscalationConfig;
  private currentIntensity: number;
  private startTime: number;
  private lastStepTime: number;

  constructor(config: EscalationConfig) {
    super(config);
    this.config = config;
    this.currentIntensity = config.minIntensity;
    this.startTime = Date.now();
    this.lastStepTime = this.startTime;
  }

  getIntensity(time: number): number {
    // Check if it's time for next step
    if (time - this.lastStepTime >= this.config.step.interval) {
      this.incrementIntensity(time);
    }

    // Check if we need to reset
    if (this.config.reset.enabled && 
        this.currentIntensity >= this.config.reset.threshold) {
      this.resetIntensity(time);
    }

    return this.clampIntensity(this.currentIntensity);
  }

  private incrementIntensity(time: number): void {
    this.currentIntensity += this.config.step.size;
    this.lastStepTime = time;
    this.updateTimestamp();
  }

  private resetIntensity(time: number): void {
    this.currentIntensity = this.config.minIntensity;
    this.startTime = time;
    this.lastStepTime = time;
    this.updateTimestamp();
  }

  getNextUpdate(): number {
    return this.lastStepTime + this.config.step.interval;
  }

  setStepSize(size: number): void {
    if (size > 0 && this.validate(this.currentIntensity + size)) {
      this.config.step.size = size;
      this.updateTimestamp();
    }
  }

  setStepInterval(interval: number): void {
    if (interval > 0) {
      this.config.step.interval = interval;
      this.updateTimestamp();
    }
  }

  setResetThreshold(threshold: number): void {
    if (this.validate(threshold)) {
      this.config.reset.threshold = threshold;
      this.updateTimestamp();
    }
  }

  enableReset(enabled: boolean): void {
    this.config.reset.enabled = enabled;
    this.updateTimestamp();
  }

  resetPattern(): void {
    this.resetIntensity(Date.now());
  }
}
