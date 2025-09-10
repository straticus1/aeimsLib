import { EventEmitter } from 'events';
import { Logger } from '../logging/Logger';
import { MetricsCollector } from '../metrics/MetricsCollector';

/**
 * Error Types
 */
export enum ErrorType {
  // Communication errors
  CONNECTION_ERROR = 'connection_error',
  TIMEOUT_ERROR = 'timeout_error',
  PROTOCOL_ERROR = 'protocol_error',
  
  // Device errors
  DEVICE_ERROR = 'device_error',
  DEVICE_BUSY = 'device_busy',
  DEVICE_NOT_READY = 'device_not_ready',
  
  // Command errors
  COMMAND_ERROR = 'command_error',
  INVALID_COMMAND = 'invalid_command',
  INVALID_RESPONSE = 'invalid_response',
  
  // System errors
  SYSTEM_ERROR = 'system_error',
  RESOURCE_ERROR = 'resource_error',
  CONFIGURATION_ERROR = 'configuration_error',
  
  // Other
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Error Severity Levels
 */
export enum ErrorSeverity {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
  CRITICAL = 4
}

/**
 * Error Categories
 */
export enum ErrorCategory {
  TRANSIENT = 'transient',  // Temporary errors that may resolve themselves
  PERSISTENT = 'persistent', // Errors that require intervention
  FATAL = 'fatal'           // Unrecoverable errors
}

/**
 * Error Context
 */
export interface ErrorContext {
  // Error identification
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  category: ErrorCategory;

  // Error details
  message: string;
  error?: Error;
  stack?: string;
  code?: string | number;

  // Context information
  source?: string;
  component?: string;
  operation?: string;
  timestamp: number;

  // Additional data
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Recovery Strategy
 */
export interface RecoveryStrategy {
  // Strategy configuration
  maxAttempts: number;
  backoffType: 'fixed' | 'linear' | 'exponential';
  initialDelay: number;
  maxDelay: number;
  jitter?: boolean;

  // Custom recovery logic
  shouldRecover?: (context: ErrorContext) => Promise<boolean>;
  beforeRetry?: (context: ErrorContext, attempt: number) => Promise<void>;
  afterRetry?: (context: ErrorContext, success: boolean) => Promise<void>;
}

/**
 * Error Handler Options
 */
export interface ErrorHandlerOptions {
  // Error classification
  errorMap?: Map<string | RegExp, Partial<ErrorContext>>;
  severityThresholds?: Map<ErrorType, ErrorSeverity>;
  
  // Recovery configuration
  defaultStrategy?: RecoveryStrategy;
  strategies?: Map<ErrorType, RecoveryStrategy>;
  
  // Error handling
  errorLimit?: number;
  errorWindow?: number;
  suppressSimilar?: boolean;
  
  // Notifications
  notifyOnError?: boolean;
  notificationThreshold?: ErrorSeverity;
}

/**
 * Error Handler Events
 */
interface ErrorHandlerEvents {
  'error': (context: ErrorContext) => void;
  'recovery': (context: ErrorContext, attempt: number) => void;
  'recoverySuccess': (context: ErrorContext) => void;
  'recoveryFailure': (context: ErrorContext) => void;
}

/**
 * Error Handler Implementation
 * Provides error classification, recovery strategies, and error tracking
 */
export class ErrorHandler extends EventEmitter {
  private options: Required<ErrorHandlerOptions>;
  private errors = new Map<string, ErrorContext>();
  private recoveryAttempts = new Map<string, number>();
  private errorCounts = new Map<string, number>();
  private lastErrors = new Map<string, number>();

  constructor(
    private logger: Logger,
    private metrics: MetricsCollector,
    options: ErrorHandlerOptions = {}
  ) {
    super();
    this.options = this.initializeOptions(options);
  }

  /**
   * Handle error
   */
  async handleError(
    error: Error | string,
    context?: Partial<ErrorContext>
  ): Promise<void> {
    try {
      // Create error context
      const errorContext = await this.createErrorContext(error, context);

      // Check error limits
      if (this.shouldSuppressError(errorContext)) {
        return;
      }

      // Track error
      this.trackError(errorContext);

      // Log error
      this.logError(errorContext);

      // Emit error event
      this.emit('error', errorContext);

      // Check if recovery is possible
      if (await this.canRecover(errorContext)) {
        await this.startRecovery(errorContext);
      } else {
        // Send notification if needed
        await this.notifyError(errorContext);

        // Rethrow error
        throw this.createError(errorContext);
      }

    } catch (handlerError) {
      // Log handler failure
      this.logger.error(
        'Error handler failed:',
        handlerError
      );

      // Rethrow original error
      throw error;
    }
  }

  /**
   * Clear error state
   */
  clearErrors(): void {
    this.errors.clear();
    this.recoveryAttempts.clear();
    this.errorCounts.clear();
    this.lastErrors.clear();
  }

  /**
   * Get error history
   */
  getErrors(filter?: {
    type?: ErrorType;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    since?: number;
  }): ErrorContext[] {
    let errors = Array.from(this.errors.values());

    if (filter) {
      errors = errors.filter(error => {
        if (filter.type && error.type !== filter.type) {
          return false;
        }
        if (filter.severity && error.severity < filter.severity) {
          return false;
        }
        if (filter.category && error.category !== filter.category) {
          return false;
        }
        if (filter.since && error.timestamp < filter.since) {
          return false;
        }
        return true;
      });
    }

    return errors;
  }

  /**
   * Initialize options
   */
  private initializeOptions(options: ErrorHandlerOptions): Required<ErrorHandlerOptions> {
    return {
      errorMap: options.errorMap || new Map(),
      severityThresholds: options.severityThresholds || new Map(),
      defaultStrategy: options.defaultStrategy || {
        maxAttempts: 3,
        backoffType: 'exponential',
        initialDelay: 1000,
        maxDelay: 30000
      },
      strategies: options.strategies || new Map(),
      errorLimit: options.errorLimit || 1000,
      errorWindow: options.errorWindow || 3600000, // 1 hour
      suppressSimilar: options.suppressSimilar !== false,
      notifyOnError: options.notifyOnError !== false,
      notificationThreshold: options.notificationThreshold || ErrorSeverity.ERROR
    };
  }

  /**
   * Create error context
   */
  private async createErrorContext(
    error: Error | string,
    context?: Partial<ErrorContext>
  ): Promise<ErrorContext> {
    const errorMessage = typeof error === 'string' ?
      error :
      error.message;

    const baseContext: ErrorContext = {
      id: this.generateErrorId(),
      type: ErrorType.UNKNOWN_ERROR,
      severity: ErrorSeverity.ERROR,
      category: ErrorCategory.TRANSIENT,
      message: errorMessage,
      error: typeof error === 'string' ? undefined : error,
      stack: typeof error === 'string' ? undefined : error.stack,
      timestamp: Date.now()
    };

    // Apply mapped context
    const mappedContext = this.findMappedContext(errorMessage);
    if (mappedContext) {
      Object.assign(baseContext, mappedContext);
    }

    // Apply provided context
    if (context) {
      Object.assign(baseContext, context);
    }

    // Set severity based on type
    const severityThreshold = this.options.severityThresholds.get(baseContext.type);
    if (severityThreshold !== undefined) {
      baseContext.severity = Math.max(baseContext.severity, severityThreshold);
    }

    return baseContext;
  }

  /**
   * Find mapped error context
   */
  private findMappedContext(message: string): Partial<ErrorContext> | undefined {
    for (const [pattern, context] of this.options.errorMap) {
      if (typeof pattern === 'string') {
        if (message.includes(pattern)) {
          return context;
        }
      } else {
        if (pattern.test(message)) {
          return context;
        }
      }
    }
    return undefined;
  }

  /**
   * Check if error should be suppressed
   */
  private shouldSuppressError(context: ErrorContext): boolean {
    // Check error limits
    if (this.errors.size >= this.options.errorLimit) {
      this.pruneErrors();
      if (this.errors.size >= this.options.errorLimit) {
        return true;
      }
    }

    // Check for similar errors
    if (this.options.suppressSimilar) {
      const key = this.getErrorKey(context);
      const lastError = this.lastErrors.get(key);
      
      if (lastError && 
          context.timestamp - lastError < this.options.errorWindow) {
        return true;
      }
      
      this.lastErrors.set(key, context.timestamp);
    }

    return false;
  }

  /**
   * Get error key for grouping similar errors
   */
  private getErrorKey(context: ErrorContext): string {
    return `${context.type}:${context.message}`;
  }

  /**
   * Track error occurrence
   */
  private trackError(context: ErrorContext): void {
    // Store error
    this.errors.set(context.id, context);

    // Update error counts
    const key = this.getErrorKey(context);
    const count = (this.errorCounts.get(key) || 0) + 1;
    this.errorCounts.set(key, count);

    // Track metrics
    this.metrics.track({
      type: 'error',
      timestamp: context.timestamp,
      data: {
        errorId: context.id,
        errorType: context.type,
        severity: context.severity,
        category: context.category,
        source: context.source,
        component: context.component
      }
    }).catch(() => {});
  }

  /**
   * Log error with appropriate severity
   */
  private logError(context: ErrorContext): void {
    const message = `[${context.type}] ${context.message}`;
    
    switch (context.severity) {
      case ErrorSeverity.DEBUG:
        this.logger.debug(message, context);
        break;
      case ErrorSeverity.INFO:
        this.logger.info(message, context);
        break;
      case ErrorSeverity.WARNING:
        this.logger.warn(message, context);
        break;
      case ErrorSeverity.ERROR:
        this.logger.error(message, context);
        break;
      case ErrorSeverity.CRITICAL:
        this.logger.error(message, context);
        break;
    }
  }

  /**
   * Check if error can be recovered
   */
  private async canRecover(context: ErrorContext): Promise<boolean> {
    if (context.category === ErrorCategory.FATAL) {
      return false;
    }

    // Get recovery strategy
    const strategy = this.getRecoveryStrategy(context);
    if (!strategy) {
      return false;
    }

    // Check custom recovery logic
    if (strategy.shouldRecover) {
      return strategy.shouldRecover(context);
    }

    // Check attempt limits
    const attempts = this.recoveryAttempts.get(context.id) || 0;
    return attempts < strategy.maxAttempts;
  }

  /**
   * Get recovery strategy for error
   */
  private getRecoveryStrategy(context: ErrorContext): RecoveryStrategy | undefined {
    return this.options.strategies.get(context.type) ||
           this.options.defaultStrategy;
  }

  /**
   * Start error recovery
   */
  private async startRecovery(context: ErrorContext): Promise<void> {
    const strategy = this.getRecoveryStrategy(context);
    if (!strategy) return;

    // Get current attempt count
    let attempts = this.recoveryAttempts.get(context.id) || 0;
    attempts++;
    this.recoveryAttempts.set(context.id, attempts);

    try {
      // Execute pre-retry hook
      if (strategy.beforeRetry) {
        await strategy.beforeRetry(context, attempts);
      }

      // Emit recovery event
      this.emit('recovery', context, attempts);

      // Calculate delay
      const delay = this.calculateRecoveryDelay(strategy, attempts);
      await new Promise(resolve =>
        setTimeout(resolve, delay)
      );

      // Recovery succeeded
      this.emit('recoverySuccess', context);

      // Execute post-retry hook
      if (strategy.afterRetry) {
        await strategy.afterRetry(context, true);
      }

    } catch (error) {
      // Recovery failed
      this.emit('recoveryFailure', context);

      if (strategy.afterRetry) {
        await strategy.afterRetry(context, false);
      }

      throw error;
    }
  }

  /**
   * Calculate recovery delay
   */
  private calculateRecoveryDelay(
    strategy: RecoveryStrategy,
    attempt: number
  ): number {
    const { backoffType, initialDelay, maxDelay, jitter } = strategy;
    
    let delay: number;
    switch (backoffType) {
      case 'exponential':
        delay = initialDelay * Math.pow(2, attempt - 1);
        break;
      case 'linear':
        delay = initialDelay * attempt;
        break;
      default:
        delay = initialDelay;
    }

    // Apply jitter if enabled
    if (jitter) {
      const jitterFactor = Math.random() * 0.2 + 0.9; // 0.9-1.1
      delay *= jitterFactor;
    }

    return Math.min(delay, maxDelay);
  }

  /**
   * Send error notification
   */
  private async notifyError(context: ErrorContext): Promise<void> {
    if (!this.options.notifyOnError ||
        context.severity < this.options.notificationThreshold) {
      return;
    }

    // TODO: Implement notification system
  }

  /**
   * Prune old errors
   */
  private pruneErrors(): void {
    const now = Date.now();
    const cutoff = now - this.options.errorWindow;

    // Remove old errors
    for (const [id, error] of this.errors) {
      if (error.timestamp < cutoff) {
        this.errors.delete(id);
        this.recoveryAttempts.delete(id);
      }
    }

    // Clear old error counts
    for (const [key, timestamp] of this.lastErrors) {
      if (timestamp < cutoff) {
        this.lastErrors.delete(key);
        this.errorCounts.delete(key);
      }
    }
  }

  /**
   * Create error from context
   */
  private createError(context: ErrorContext): Error {
    const error = new Error(context.message);
    error.name = context.type;
    error.stack = context.stack;
    return error;
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}
