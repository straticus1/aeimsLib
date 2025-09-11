import { EventEmitter } from 'events';
import { Logger } from '../logging/Logger';
import { MetricsCollector } from '../metrics/MetricsCollector';
/**
 * Error Types
 */
export declare enum ErrorType {
    CONNECTION_ERROR = "connection_error",
    TIMEOUT_ERROR = "timeout_error",
    PROTOCOL_ERROR = "protocol_error",
    DEVICE_ERROR = "device_error",
    DEVICE_BUSY = "device_busy",
    DEVICE_NOT_READY = "device_not_ready",
    COMMAND_ERROR = "command_error",
    INVALID_COMMAND = "invalid_command",
    INVALID_RESPONSE = "invalid_response",
    SYSTEM_ERROR = "system_error",
    RESOURCE_ERROR = "resource_error",
    CONFIGURATION_ERROR = "configuration_error",
    UNKNOWN_ERROR = "unknown_error"
}
/**
 * Error Severity Levels
 */
export declare enum ErrorSeverity {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
    CRITICAL = 4
}
/**
 * Error Categories
 */
export declare enum ErrorCategory {
    TRANSIENT = "transient",// Temporary errors that may resolve themselves
    PERSISTENT = "persistent",// Errors that require intervention
    FATAL = "fatal"
}
/**
 * Error Context
 */
export interface ErrorContext {
    id: string;
    type: ErrorType;
    severity: ErrorSeverity;
    category: ErrorCategory;
    message: string;
    error?: Error;
    stack?: string;
    code?: string | number;
    source?: string;
    component?: string;
    operation?: string;
    timestamp: number;
    data?: Record<string, any>;
    metadata?: Record<string, any>;
}
/**
 * Recovery Strategy
 */
export interface RecoveryStrategy {
    maxAttempts: number;
    backoffType: 'fixed' | 'linear' | 'exponential';
    initialDelay: number;
    maxDelay: number;
    jitter?: boolean;
    shouldRecover?: (context: ErrorContext) => Promise<boolean>;
    beforeRetry?: (context: ErrorContext, attempt: number) => Promise<void>;
    afterRetry?: (context: ErrorContext, success: boolean) => Promise<void>;
}
/**
 * Error Handler Options
 */
export interface ErrorHandlerOptions {
    errorMap?: Map<string | RegExp, Partial<ErrorContext>>;
    severityThresholds?: Map<ErrorType, ErrorSeverity>;
    defaultStrategy?: RecoveryStrategy;
    strategies?: Map<ErrorType, RecoveryStrategy>;
    errorLimit?: number;
    errorWindow?: number;
    suppressSimilar?: boolean;
    notifyOnError?: boolean;
    notificationThreshold?: ErrorSeverity;
}
/**
 * Error Handler Implementation
 * Provides error classification, recovery strategies, and error tracking
 */
export declare class ErrorHandler extends EventEmitter {
    private logger;
    private metrics;
    private options;
    private errors;
    private recoveryAttempts;
    private errorCounts;
    private lastErrors;
    constructor(logger: Logger, metrics: MetricsCollector, options?: ErrorHandlerOptions);
    /**
     * Handle error
     */
    handleError(error: Error | string, context?: Partial<ErrorContext>): Promise<void>;
    /**
     * Clear error state
     */
    clearErrors(): void;
    /**
     * Get error history
     */
    getErrors(filter?: {
        type?: ErrorType;
        severity?: ErrorSeverity;
        category?: ErrorCategory;
        since?: number;
    }): ErrorContext[];
    /**
     * Initialize options
     */
    private initializeOptions;
    /**
     * Create error context
     */
    private createErrorContext;
    /**
     * Find mapped error context
     */
    private findMappedContext;
    /**
     * Check if error should be suppressed
     */
    private shouldSuppressError;
    /**
     * Get error key for grouping similar errors
     */
    private getErrorKey;
    /**
     * Track error occurrence
     */
    private trackError;
    /**
     * Log error with appropriate severity
     */
    private logError;
    /**
     * Check if error can be recovered
     */
    private canRecover;
    /**
     * Get recovery strategy for error
     */
    private getRecoveryStrategy;
    /**
     * Start error recovery
     */
    private startRecovery;
    /**
     * Calculate recovery delay
     */
    private calculateRecoveryDelay;
    /**
     * Send error notification
     */
    private notifyError;
    /**
     * Prune old errors
     */
    private pruneErrors;
    /**
     * Create error from context
     */
    private createError;
    /**
     * Generate unique error ID
     */
    private generateErrorId;
}
