import { ControlPattern, PatternConfig } from '../interfaces/patterns';
export declare abstract class BasePattern implements ControlPattern {
    protected config: PatternConfig;
    protected lastUpdate: number;
    constructor(config: PatternConfig);
    get name(): string;
    abstract getIntensity(time: number): number;
    setConfig(config: PatternConfig): void;
    validate(intensity: number): boolean;
    getNextUpdate(): number;
    protected updateTimestamp(): void;
    protected clampIntensity(intensity: number): number;
}
