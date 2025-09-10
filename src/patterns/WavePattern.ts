import { BasePattern } from './BasePattern';
import { WaveConfig } from '../interfaces/patterns';

export class WavePattern extends BasePattern {
  private config: WaveConfig;
  private amplitude: number;
  private frequency: number;

  constructor(config: WaveConfig) {
    super(config);
    this.config = config;
    this.amplitude = (config.maxIntensity - config.minIntensity) / 2;
    this.frequency = config.frequency.default;
  }

  getIntensity(time: number): number {
    const center = (this.config.maxIntensity + this.config.minIntensity) / 2;
    let intensity: number;

    switch (this.config.waveform) {
      case 'sine':
        intensity = this.getSineWave(time, center);
        break;
      case 'square':
        intensity = this.getSquareWave(time, center);
        break;
      case 'triangle':
        intensity = this.getTriangleWave(time, center);
        break;
      case 'sawtooth':
        intensity = this.getSawtoothWave(time, center);
        break;
      default:
        intensity = this.getSineWave(time, center);
    }

    return this.clampIntensity(intensity);
  }

  setFrequency(frequency: number): void {
    if (frequency >= this.config.frequency.min && frequency <= this.config.frequency.max) {
      this.frequency = frequency;
      this.updateTimestamp();
    }
  }

  private getSineWave(time: number, center: number): number {
    return center + this.amplitude * Math.sin(2 * Math.PI * this.frequency * time / 1000);
  }

  private getSquareWave(time: number, center: number): number {
    const t = (time * this.frequency) % 1000;
    return center + this.amplitude * (t < 500 ? 1 : -1);
  }

  private getTriangleWave(time: number, center: number): number {
    const t = (time * this.frequency) % 1000;
    const normalizedTime = t / 1000;
    return center + this.amplitude * (Math.abs(2 * normalizedTime - 1) * 2 - 1);
  }

  private getSawtoothWave(time: number, center: number): number {
    const t = (time * this.frequency) % 1000;
    const normalizedTime = t / 1000;
    return center + this.amplitude * (2 * normalizedTime - 1);
  }
}
