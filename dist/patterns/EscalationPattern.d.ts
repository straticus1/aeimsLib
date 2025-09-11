import { BasePattern } from './BasePattern';
import { EscalationConfig } from '../interfaces/patterns';
export declare class EscalationPattern extends BasePattern {
    private config;
    private currentIntensity;
    private startTime;
    private lastStepTime;
    constructor(config: EscalationConfig);
    getIntensity(time: number): number;
    private incrementIntensity;
    private resetIntensity;
    getNextUpdate(): number;
    setStepSize(size: number): void;
    setStepInterval(interval: number): void;
    setResetThreshold(threshold: number): void;
    enableReset(enabled: boolean): void;
    resetPattern(): void;
}
