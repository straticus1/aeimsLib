import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
interface PlaygroundOptions {
    minDuration: number;
    maxDuration: number;
    minIntensity: number;
    maxIntensity: number;
    updateInterval: number;
    width: number;
    height: number;
    backgroundColor: string;
    lineColor: string;
    gridColor: string;
}
interface PatternPoint {
    time: number;
    intensity: number;
}
interface PatternPreview {
    name: string;
    type: string;
    duration: number;
    points: PatternPoint[];
    peaks: number;
    avgIntensity: number;
    transitions: number;
}
/**
 * Pattern Playground
 * Interactive GUI for designing, testing, and visualizing device patterns
 */
export declare class PatternPlayground extends EventEmitter {
    private telemetry;
    private options;
    private canvas;
    private ctx;
    private patternFactory;
    private currentPattern?;
    private isPlaying;
    private playbackTimer?;
    private currentTime;
    constructor(container: HTMLElement, telemetry: TelemetryManager, options?: Partial<PlaygroundOptions>);
    /**
     * Load a predefined pattern
     */
    loadPattern(name: string): void;
    /**
     * Create a custom pattern
     */
    createPattern(type: string, params: any): void;
    /**
     * Start pattern playback
     */
    play(): void;
    /**
     * Pause pattern playback
     */
    pause(): void;
    /**
     * Reset pattern to start
     */
    reset(): void;
    /**
     * Generate pattern preview
     */
    getPreview(): PatternPreview | null;
    /**
     * Export pattern to JSON
     */
    exportPattern(): string;
    private initializeOptions;
    private setupEventHandlers;
    private updatePlayback;
    private render;
    private drawGrid;
    private drawPattern;
    private drawPlaybackIndicator;
    private handleMouseDown;
    private handleMouseMove;
    private handleMouseUp;
}
export {};
