import { BasePattern } from './BasePattern';
import { PatternConfig } from '../interfaces/patterns';

export class ConstantPattern extends BasePattern {
  private intensity: number;

  constructor(config: PatternConfig) {
    super(config);
    this.intensity = config.defaultIntensity;
  }

  getIntensity(time: number): number {
    return this.clampIntensity(this.intensity);
  }

  setIntensity(intensity: number): void {
    if (this.validate(intensity)) {
      this.intensity = intensity;
      this.updateTimestamp();
    }
  }
}
