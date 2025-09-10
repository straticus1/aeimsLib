import {
  PatternFactory,
  PatternConfig,
  WaveConfig,
  PulseConfig,
  EscalationConfig,
  ControlPattern
} from '../interfaces/patterns';

import { ConstantPattern } from './ConstantPattern';
import { WavePattern } from './WavePattern';
import { PulsePattern } from './PulsePattern';
import { EscalationPattern } from './EscalationPattern';

export class DefaultPatternFactory implements PatternFactory {
  private static instance: DefaultPatternFactory;
  private patterns: Map<string, typeof BasePattern>;

  private constructor() {
    this.patterns = new Map();
    this.registerDefaultPatterns();
  }

  static getInstance(): DefaultPatternFactory {
    if (!DefaultPatternFactory.instance) {
      DefaultPatternFactory.instance = new DefaultPatternFactory();
    }
    return DefaultPatternFactory.instance;
  }

  private registerDefaultPatterns(): void {
    this.patterns.set('constant', ConstantPattern);
    this.patterns.set('wave', WavePattern);
    this.patterns.set('pulse', PulsePattern);
    this.patterns.set('escalation', EscalationPattern);
  }

  createPattern(type: string, config: PatternConfig): ControlPattern {
    const PatternClass = this.patterns.get(type.toLowerCase());
    
    if (!PatternClass) {
      throw new Error(`Unknown pattern type: ${type}`);
    }

    return new PatternClass(this.validateConfig(type, config));
  }

  getAvailablePatterns(): string[] {
    return Array.from(this.patterns.keys());
  }

  validatePattern(type: string, config: PatternConfig): boolean {
    try {
      this.validateConfig(type, config);
      return true;
    } catch (error) {
      return false;
    }
  }

  private validateConfig(type: string, config: PatternConfig): PatternConfig {
    const baseValidation = this.validateBaseConfig(config);
    
    switch (type.toLowerCase()) {
      case 'constant':
        return this.validateConstantConfig(baseValidation);
      case 'wave':
        return this.validateWaveConfig(baseValidation as WaveConfig);
      case 'pulse':
        return this.validatePulseConfig(baseValidation as PulseConfig);
      case 'escalation':
        return this.validateEscalationConfig(baseValidation as EscalationConfig);
      default:
        throw new Error(`Unknown pattern type: ${type}`);
    }
  }

  private validateBaseConfig(config: PatternConfig): PatternConfig {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Invalid pattern name');
    }

    if (typeof config.minIntensity !== 'number' || config.minIntensity < 0) {
      throw new Error('Invalid minimum intensity');
    }

    if (typeof config.maxIntensity !== 'number' || config.maxIntensity > 100) {
      throw new Error('Invalid maximum intensity');
    }

    if (config.minIntensity >= config.maxIntensity) {
      throw new Error('Minimum intensity must be less than maximum intensity');
    }

    if (typeof config.defaultIntensity !== 'number' ||
        config.defaultIntensity < config.minIntensity ||
        config.defaultIntensity > config.maxIntensity) {
      throw new Error('Invalid default intensity');
    }

    return config;
  }

  private validateConstantConfig(config: PatternConfig): PatternConfig {
    return config;
  }

  private validateWaveConfig(config: WaveConfig): WaveConfig {
    if (!config.frequency || 
        typeof config.frequency.min !== 'number' ||
        typeof config.frequency.max !== 'number' ||
        typeof config.frequency.default !== 'number') {
      throw new Error('Invalid wave frequency configuration');
    }

    if (config.frequency.min <= 0 || config.frequency.max <= config.frequency.min) {
      throw new Error('Invalid frequency range');
    }

    if (!['sine', 'square', 'triangle', 'sawtooth'].includes(config.waveform)) {
      throw new Error('Invalid waveform type');
    }

    return config;
  }

  private validatePulseConfig(config: PulseConfig): PulseConfig {
    if (!config.pulseWidth || 
        typeof config.pulseWidth.min !== 'number' ||
        typeof config.pulseWidth.max !== 'number' ||
        typeof config.pulseWidth.default !== 'number') {
      throw new Error('Invalid pulse width configuration');
    }

    if (!config.interval || 
        typeof config.interval.min !== 'number' ||
        typeof config.interval.max !== 'number' ||
        typeof config.interval.default !== 'number') {
      throw new Error('Invalid interval configuration');
    }

    if (config.pulseWidth.min <= 0 || config.pulseWidth.max <= config.pulseWidth.min) {
      throw new Error('Invalid pulse width range');
    }

    if (config.interval.min <= 0 || config.interval.max <= config.interval.min) {
      throw new Error('Invalid interval range');
    }

    return config;
  }

  private validateEscalationConfig(config: EscalationConfig): EscalationConfig {
    if (!config.step || 
        typeof config.step.size !== 'number' ||
        typeof config.step.interval !== 'number') {
      throw new Error('Invalid step configuration');
    }

    if (config.step.size <= 0) {
      throw new Error('Step size must be greater than 0');
    }

    if (config.step.interval <= 0) {
      throw new Error('Step interval must be greater than 0');
    }

    if (!config.reset || 
        typeof config.reset.enabled !== 'boolean' ||
        typeof config.reset.threshold !== 'number') {
      throw new Error('Invalid reset configuration');
    }

    if (config.reset.threshold <= config.minIntensity || 
        config.reset.threshold > config.maxIntensity) {
      throw new Error('Invalid reset threshold');
    }

    return config;
  }
}
