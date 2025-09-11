import { PatternFactory, PatternConfig, ControlPattern } from '../interfaces/patterns';
export declare class DefaultPatternFactory implements PatternFactory {
    private static instance;
    private patterns;
    private constructor();
    static getInstance(): DefaultPatternFactory;
    private registerDefaultPatterns;
    createPattern(type: string, config: PatternConfig): ControlPattern;
    getAvailablePatterns(): string[];
    validatePattern(type: string, config: PatternConfig): boolean;
    private validateConfig;
    private validateBaseConfig;
    private validateConstantConfig;
    private validateWaveConfig;
    private validatePulseConfig;
    private validateEscalationConfig;
}
