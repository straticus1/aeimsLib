import { BasePattern } from './BasePattern';
import { PatternConfig } from '../interfaces/patterns';
export declare class ConstantPattern extends BasePattern {
    private intensity;
    constructor(config: PatternConfig);
    getIntensity(time: number): number;
    setIntensity(intensity: number): void;
}
