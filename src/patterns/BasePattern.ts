import { ControlPattern, PatternConfig } from '../interfaces/patterns';

export abstract class BasePattern implements ControlPattern {
  protected config: PatternConfig;
  protected lastUpdate: number;

  constructor(config: PatternConfig) {
    this.config = config;
    this.lastUpdate = Date.now();
  }

  get name(): string {
    return this.config.name;
  }

  abstract getIntensity(time: number): number;

  setConfig(config: PatternConfig): void {
    this.config = config;
  }

  validate(intensity: number): boolean {
    return (
      intensity >= this.config.minIntensity && intensity <= this.config.maxIntensity
    );
  }

  getNextUpdate(): number {
    return this.lastUpdate;
  }

  protected updateTimestamp(): void {
    this.lastUpdate = Date.now();
  }

  protected clampIntensity(intensity: number): number {
    return Math.min(
      Math.max(intensity, this.config.minIntensity),
      this.config.maxIntensity
    );
  }
}
