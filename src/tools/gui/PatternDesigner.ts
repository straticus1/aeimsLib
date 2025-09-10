import { Pattern, PatternType } from '../../patterns/Pattern';
import { EventEmitter } from 'events';
import { DevicePatterns } from '../../devices/experimental/patterns';

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

export class PatternDesigner extends EventEmitter {
  private steps: Map<string, PatternStep> = new Map();
  private presetPatterns: typeof DevicePatterns;
  private activeStep: string | null = null;

  constructor() {
    super();
    this.presetPatterns = DevicePatterns;
  }

  /**
   * Create a new pattern step
   */
  createStep(type: PatternType, params: any = {}): string {
    const id = `step_${Date.now()}`;
    const step: PatternStep = {
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
  loadPreset(deviceType: string, patternName: string): void {
    const preset = this.presetPatterns[deviceType]?.[patternName];
    if (!preset) {
      throw new Error(`Preset not found: ${deviceType}/${patternName}`);
    }

    this.clearPattern();
    
    // Convert preset to steps
    if (preset.type === PatternType.SEQUENCE) {
      preset.params.steps.forEach((stepParams: any, index: number) => {
        const id = this.createStep(PatternType.CONSTANT, stepParams);
        if (index > 0) {
          const prevId = `step_${Date.now() - (index + 1)}`;
          this.linkSteps(prevId, id);
        }
      });
    } else {
      this.createStep(preset.type, preset.params);
    }

    this.emit('presetLoaded', { deviceType, patternName });
  }

  /**
   * Update a step's parameters
   */
  updateStep(stepId: string, params: Partial<PatternStep>): void {
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
  linkSteps(fromId: string, toId: string): void {
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
  deleteStep(stepId: string): void {
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
  clearPattern(): void {
    this.steps.clear();
    this.activeStep = null;
    this.emit('patternCleared');
  }

  /**
   * Set the active step for editing
   */
  setActiveStep(stepId: string | null): void {
    if (stepId && !this.steps.has(stepId)) {
      throw new Error(`Step not found: ${stepId}`);
    }

    this.activeStep = stepId;
    this.emit('activeStepChanged', stepId);
  }

  /**
   * Generate a preview of the pattern
   */
  generatePreview(duration: number = 5000): PatternPreview {
    const timestamps: number[] = [];
    const values: number[] = [];
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
  exportPattern(): Pattern {
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
  importPattern(pattern: Pattern): void {
    this.clearPattern();
    
    // Convert pattern to steps
    if (pattern.type === PatternType.SEQUENCE) {
      pattern.params.steps.forEach((stepParams: any, index: number) => {
        const id = this.createStep(PatternType.CONSTANT, stepParams);
        if (index > 0) {
          const prevId = `step_${Date.now() - (index + 1)}`;
          this.linkSteps(prevId, id);
        }
      });
    } else {
      this.createStep(pattern.type, pattern.params);
    }

    this.emit('patternImported', pattern);
  }

  /**
   * Validate the pattern
   */
  validatePattern(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

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
    const visited = new Set<string>();
    const checkCycles = (stepId: string): boolean => {
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

  private calculateIntensityAtTime(time: number): number {
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

  private calculateStepIntensity(step: PatternStep, timeInStep: number): number {
    switch (step.type) {
      case PatternType.CONSTANT:
        return step.params.intensity || 0;

      case PatternType.WAVE:
        const { minIntensity, maxIntensity, period } = step.params;
        const phase = (2 * Math.PI * timeInStep) / period;
        return minIntensity + (maxIntensity - minIntensity) * 
          (Math.sin(phase) + 1) / 2;

      case PatternType.RAMP:
        const { startIntensity, endIntensity } = step.params;
        const progress = timeInStep / step.duration!;
        return startIntensity + (endIntensity - startIntensity) * progress;

      default:
        return 0;
    }
  }

  private findRootStep(): PatternStep | null {
    // Find step that isn't referenced by any other step
    const referenced = new Set<string>();
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

  private convertStepToPattern(step: PatternStep): Pattern {
    if (step.next) {
      // Convert to sequence
      const steps = [];
      let currentStep: PatternStep | undefined = step;
      while (currentStep) {
        steps.push({
          type: currentStep.type,
          params: currentStep.params,
          duration: currentStep.duration
        });
        currentStep = currentStep.next ? this.steps.get(currentStep.next) : undefined;
      }

      return {
        type: PatternType.SEQUENCE,
        params: { steps }
      } as Pattern;
    } else {
      // Single step pattern
      return {
        type: step.type,
        params: step.params
      } as Pattern;
    }
  }

  private validateStepParams(step: PatternStep): boolean {
    switch (step.type) {
      case PatternType.CONSTANT:
        return typeof step.params.intensity === 'number' &&
          step.params.intensity >= 0 &&
          step.params.intensity <= 1;

      case PatternType.WAVE:
        return typeof step.params.minIntensity === 'number' &&
          typeof step.params.maxIntensity === 'number' &&
          typeof step.params.period === 'number' &&
          step.params.minIntensity >= 0 &&
          step.params.maxIntensity <= 1 &&
          step.params.period > 0;

      case PatternType.RAMP:
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
