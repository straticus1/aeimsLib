/**
 * Base pattern configuration interface
 */
export interface PatternConfig {
    name: string;
    minIntensity: number;
    maxIntensity: number;
    defaultIntensity: number;
}
/**
 * Wave pattern configuration
 */
export interface WaveConfig extends PatternConfig {
    frequency: {
        min: number;
        max: number;
        default: number;
    };
    waveform: 'sine' | 'square' | 'triangle' | 'sawtooth';
}
/**
 * Pulse pattern configuration
 */
export interface PulseConfig extends PatternConfig {
    pulseWidth: {
        min: number;
        max: number;
        default: number;
    };
    interval: {
        min: number;
        max: number;
        default: number;
    };
}
/**
 * Escalation pattern configuration
 */
export interface EscalationConfig extends PatternConfig {
    step: {
        size: number;
        interval: number;
    };
    reset: {
        enabled: boolean;
        threshold: number;
    };
}
/**
 * Control pattern interface
 */
export interface ControlPattern {
    name: string;
    getIntensity(time: number): number;
    setConfig(config: PatternConfig): void;
    validate(intensity: number): boolean;
    getNextUpdate(): number;
}
/**
 * Pattern generator function type
 */
export type PatternGenerator = (time: number) => number;
/**
 * Pattern factory interface
 */
export interface PatternFactory {
    createPattern(type: string, config: PatternConfig): ControlPattern;
    getAvailablePatterns(): string[];
    validatePattern(type: string, config: PatternConfig): boolean;
}
/**
 * Pattern state interface
 */
export interface PatternState {
    type: string;
    intensity: number;
    speed?: number;
    config: PatternConfig;
    startTime: number;
    lastUpdate: number;
}
/**
 * Pattern transition interface
 */
export interface PatternTransition {
    fromPattern: string;
    toPattern: string;
    duration: number;
    easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}
/**
 * Pattern sequence interface
 */
export interface PatternSequence {
    patterns: {
        type: string;
        duration: number;
        config: PatternConfig;
    }[];
    transitions: PatternTransition[];
    loop: boolean;
}
