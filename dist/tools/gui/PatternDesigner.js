"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternDesigner = void 0;
const Pattern_1 = require("../../patterns/Pattern");
const events_1 = require("events");
const patterns_1 = require("../../devices/experimental/patterns");
class PatternDesigner extends events_1.EventEmitter {
    constructor() {
        super();
        this.steps = new Map();
        this.activeStep = null;
        this.presetPatterns = patterns_1.DevicePatterns;
    }
    /**
     * Create a new pattern step
     */
    createStep(type, params = {}) {
        const id = `step_${Date.now()}`;
        const step = {
            id,
            type,
            params,
            duration: params.duration || 1000
        };
        this.steps.set(id, step);
        this.emit('stepCreated', step);
        return id;
    }
    /**
     * Load a preset pattern
     */
    loadPreset(deviceType, patternName) {
        const preset = this.presetPatterns[deviceType]?.[patternName];
        if (!preset) {
            throw new Error(`Preset not found: ${deviceType}/${patternName}`);
        }
        this.clearPattern();
        // Convert preset to steps
        if (preset.type === Pattern_1.PatternType.SEQUENCE) {
            preset.params.steps.forEach((stepParams, index) => {
                const id = this.createStep(Pattern_1.PatternType.CONSTANT, stepParams);
                if (index > 0) {
                    const prevId = `step_${Date.now() - (index + 1)}`;
                    this.linkSteps(prevId, id);
                }
            });
        }
        else {
            this.createStep(preset.type, preset.params);
        }
        this.emit('presetLoaded', { deviceType, patternName });
    }
    /**
     * Update a step's parameters
     */
    updateStep(stepId, params) {
        const step = this.steps.get(stepId);
        if (!step) {
            throw new Error(`Step not found: ${stepId}`);
        }
        Object.assign(step, params);
        this.emit('stepUpdated', step);
    }
    /**
     * Link two steps in sequence
     */
    linkSteps(fromId, toId) {
        const fromStep = this.steps.get(fromId);
        if (!fromStep) {
            throw new Error(`Source step not found: ${fromId}`);
        }
        const toStep = this.steps.get(toId);
        if (!toStep) {
            throw new Error(`Target step not found: ${toId}`);
        }
        fromStep.next = toId;
        this.emit('stepsLinked', { from: fromStep, to: toStep });
    }
    /**
     * Delete a step
     */
    deleteStep(stepId) {
        const step = this.steps.get(stepId);
        if (!step) {
            throw new Error(`Step not found: ${stepId}`);
        }
        // Remove references to this step
        for (const [_, otherStep] of this.steps) {
            if (otherStep.next === stepId) {
                delete otherStep.next;
            }
        }
        this.steps.delete(stepId);
        if (this.activeStep === stepId) {
            this.activeStep = null;
        }
        this.emit('stepDeleted', step);
    }
    /**
     * Clear the entire pattern
     */
    clearPattern() {
        this.steps.clear();
        this.activeStep = null;
        this.emit('patternCleared');
    }
    /**
     * Set the active step for editing
     */
    setActiveStep(stepId) {
        if (stepId && !this.steps.has(stepId)) {
            throw new Error(`Step not found: ${stepId}`);
        }
        this.activeStep = stepId;
        this.emit('activeStepChanged', stepId);
    }
    /**
     * Generate a preview of the pattern
     */
    generatePreview(duration = 5000) {
        const timestamps = [];
        const values = [];
        let time = 0;
        while (time <= duration) {
            // Find the active steps for this time
            const intensity = this.calculateIntensityAtTime(time);
            timestamps.push(time);
            values.push(intensity);
            time += 50; // 20Hz sampling rate
        }
        return { timestamps, values };
    }
    /**
     * Export the pattern
     */
    exportPattern() {
        // Validate first
        const validation = this.validatePattern();
        if (!validation.valid) {
            throw new Error(`Invalid pattern: ${validation.errors.join(', ')}`);
        }
        // Convert steps to pattern format
        const rootStep = this.findRootStep();
        if (!rootStep) {
            throw new Error('No root step found');
        }
        return this.convertStepToPattern(rootStep);
    }
    /**
     * Import a pattern
     */
    importPattern(pattern) {
        this.clearPattern();
        // Convert pattern to steps
        if (pattern.type === Pattern_1.PatternType.SEQUENCE) {
            pattern.params.steps.forEach((stepParams, index) => {
                const id = this.createStep(Pattern_1.PatternType.CONSTANT, stepParams);
                if (index > 0) {
                    const prevId = `step_${Date.now() - (index + 1)}`;
                    this.linkSteps(prevId, id);
                }
            });
        }
        else {
            this.createStep(pattern.type, pattern.params);
        }
        this.emit('patternImported', pattern);
    }
    /**
     * Validate the pattern
     */
    validatePattern() {
        const errors = [];
        const warnings = [];
        // Check for empty pattern
        if (this.steps.size === 0) {
            errors.push('Pattern is empty');
            return { valid: false, errors, warnings };
        }
        // Check for disconnected steps
        const rootStep = this.findRootStep();
        if (!rootStep) {
            errors.push('No root step found');
            return { valid: false, errors, warnings };
        }
        // Check for cycles
        const visited = new Set();
        const checkCycles = (stepId) => {
            if (visited.has(stepId)) {
                errors.push('Cycle detected in pattern');
                return false;
            }
            visited.add(stepId);
            const step = this.steps.get(stepId);
            if (step?.next) {
                return checkCycles(step.next);
            }
            return true;
        };
        checkCycles(rootStep.id);
        // Check for invalid parameters
        for (const [_, step] of this.steps) {
            if (!this.validateStepParams(step)) {
                errors.push(`Invalid parameters in step ${step.id}`);
            }
        }
        // Check for performance issues
        if (this.steps.size > 100) {
            warnings.push('Large number of steps may impact performance');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    calculateIntensityAtTime(time) {
        // Find the active step for this time
        let currentStep = this.findRootStep();
        let currentTime = 0;
        while (currentStep) {
            const duration = currentStep.duration || 1000;
            if (time >= currentTime && time < currentTime + duration) {
                // Time falls within this step
                return this.calculateStepIntensity(currentStep, time - currentTime);
            }
            currentTime += duration;
            currentStep = currentStep.next ? this.steps.get(currentStep.next) : null;
        }
        return 0;
    }
    calculateStepIntensity(step, timeInStep) {
        switch (step.type) {
            case Pattern_1.PatternType.CONSTANT:
                return step.params.intensity || 0;
            case Pattern_1.PatternType.WAVE:
                const { minIntensity, maxIntensity, period } = step.params;
                const phase = (2 * Math.PI * timeInStep) / period;
                return minIntensity + (maxIntensity - minIntensity) *
                    (Math.sin(phase) + 1) / 2;
            case Pattern_1.PatternType.RAMP:
                const { startIntensity, endIntensity } = step.params;
                const progress = timeInStep / step.duration;
                return startIntensity + (endIntensity - startIntensity) * progress;
            default:
                return 0;
        }
    }
    findRootStep() {
        // Find step that isn't referenced by any other step
        const referenced = new Set();
        for (const [_, step] of this.steps) {
            if (step.next) {
                referenced.add(step.next);
            }
        }
        for (const [_, step] of this.steps) {
            if (!referenced.has(step.id)) {
                return step;
            }
        }
        return null;
    }
    convertStepToPattern(step) {
        if (step.next) {
            // Convert to sequence
            const steps = [];
            let currentStep = step;
            while (currentStep) {
                steps.push({
                    type: currentStep.type,
                    params: currentStep.params,
                    duration: currentStep.duration
                });
                currentStep = currentStep.next ? this.steps.get(currentStep.next) : undefined;
            }
            return {
                type: Pattern_1.PatternType.SEQUENCE,
                params: { steps }
            };
        }
        else {
            // Single step pattern
            return {
                type: step.type,
                params: step.params
            };
        }
    }
    validateStepParams(step) {
        switch (step.type) {
            case Pattern_1.PatternType.CONSTANT:
                return typeof step.params.intensity === 'number' &&
                    step.params.intensity >= 0 &&
                    step.params.intensity <= 1;
            case Pattern_1.PatternType.WAVE:
                return typeof step.params.minIntensity === 'number' &&
                    typeof step.params.maxIntensity === 'number' &&
                    typeof step.params.period === 'number' &&
                    step.params.minIntensity >= 0 &&
                    step.params.maxIntensity <= 1 &&
                    step.params.period > 0;
            case Pattern_1.PatternType.RAMP:
                return typeof step.params.startIntensity === 'number' &&
                    typeof step.params.endIntensity === 'number' &&
                    typeof step.duration === 'number' &&
                    step.params.startIntensity >= 0 &&
                    step.params.endIntensity <= 1 &&
                    step.duration > 0;
            default:
                return false;
        }
    }
}
exports.PatternDesigner = PatternDesigner;
//# sourceMappingURL=PatternDesigner.js.map