import { BasePattern } from './BasePattern';
import { WaveConfig } from '../interfaces/patterns';
export declare class WavePattern extends BasePattern {
    private config;
    private amplitude;
    private frequency;
    constructor(config: WaveConfig);
    getIntensity(time: number): number;
    setFrequency(frequency: number): void;
    private getSineWave;
    private getSquareWave;
    private getTriangleWave;
    private getSawtoothWave;
}
