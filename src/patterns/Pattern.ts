/**
 * Base pattern interface
 */
export interface Pattern {
  id: string;
  name: string;
  type: PatternType;
  duration: number;
  intensity: number;
  parameters: Record<string, any>;
  metadata?: PatternMetadata;
  getFeatures?(): string[];
}

/**
 * Pattern types
 */
export enum PatternType {
  CONSTANT = 'constant',
  WAVE = 'wave',
  PULSE = 'pulse',
  ESCALATION = 'escalation',
  RANDOM = 'random',
  CUSTOM = 'custom'
}

/**
 * Pattern metadata
 */
export interface PatternMetadata {
  description?: string;
  tags?: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  category?: string;
  createdBy?: string;
  createdAt?: Date;
  rating?: number;
}

/**
 * Pattern execution result
 */
export interface PatternResult {
  success: boolean;
  duration: number;
  error?: string;
  metrics?: PatternMetrics;
}

/**
 * Pattern execution metrics
 */
export interface PatternMetrics {
  averageIntensity: number;
  peakIntensity: number;
  totalDuration: number;
  commandCount: number;
}

export default Pattern;