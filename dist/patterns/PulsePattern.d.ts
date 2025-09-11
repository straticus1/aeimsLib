import { BasePattern } from './BasePattern';
import { PulseConfig } from '../interfaces/patterns';
export declare class PulsePattern extends BasePattern {
    private config;
    private pulseWidth;
    private interval;
    private lastPulseTime;
    private isInPulse;
    constructor(config: PulseConfig);
    getIntensity(time: number): number;
    setPulseWidth(width: number): void;
    setInterval(interval: number): void;
    getNextUpdate(): number;
}
