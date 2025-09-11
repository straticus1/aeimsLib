import { Pattern, PatternType } from '../../patterns/Pattern';
import { EventEmitter } from 'events';
/**
 * Pattern Designer GUI Framework
 * This provides the core functionality for the pattern designer GUI.
 * It can be used with any UI framework (React, Vue, etc.).
 */
export interface PatternStep {
    id: string;
    type: PatternType;
    params: any;
    duration?: number;
    next?: string;
}
export interface PatternPreview {
    values: number[];
    timestamps: number[];
    channels?: string[];
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export declare class PatternDesigner extends EventEmitter {
    private steps;
    private presetPatterns;
    private activeStep;
    constructor();
    /**
     * Create a new pattern step
     */
    createStep(type: PatternType, params?: any): string;
    /**
     * Load a preset pattern
     */
    loadPreset(deviceType: string, patternName: string): void;
    /**
     * Update a step's parameters
     */
    updateStep(stepId: string, params: Partial<PatternStep>): void;
    /**
     * Link two steps in sequence
     */
    linkSteps(fromId: string, toId: string): void;
    /**
     * Delete a step
     */
    deleteStep(stepId: string): void;
    /**
     * Clear the entire pattern
     */
    clearPattern(): void;
    /**
     * Set the active step for editing
     */
    setActiveStep(stepId: string | null): void;
    /**
     * Generate a preview of the pattern
     */
    generatePreview(duration?: number): PatternPreview;
    /**
     * Export the pattern
     */
    exportPattern(): Pattern;
    /**
     * Import a pattern
     */
    importPattern(pattern: Pattern): void;
    /**
     * Validate the pattern
     */
    validatePattern(): ValidationResult;
    private calculateIntensityAtTime;
    private calculateStepIntensity;
    private findRootStep;
    private convertStepToPattern;
    private validateStepParams;
}
