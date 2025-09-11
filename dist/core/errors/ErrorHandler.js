"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.ErrorCategory = exports.ErrorSeverity = exports.ErrorType = void 0;
const events_1 = require("events");
/**
 * Error Types
 */
var ErrorType;
(function (ErrorType) {
    // Communication errors
    ErrorType["CONNECTION_ERROR"] = "connection_error";
    ErrorType["TIMEOUT_ERROR"] = "timeout_error";
    ErrorType["PROTOCOL_ERROR"] = "protocol_error";
    // Device errors
    ErrorType["DEVICE_ERROR"] = "device_error";
    ErrorType["DEVICE_BUSY"] = "device_busy";
    ErrorType["DEVICE_NOT_READY"] = "device_not_ready";
    // Command errors
    ErrorType["COMMAND_ERROR"] = "command_error";
    ErrorType["INVALID_COMMAND"] = "invalid_command";
    ErrorType["INVALID_RESPONSE"] = "invalid_response";
    // System errors
    ErrorType["SYSTEM_ERROR"] = "system_error";
    ErrorType["RESOURCE_ERROR"] = "resource_error";
    ErrorType["CONFIGURATION_ERROR"] = "configuration_error";
    // Other
    ErrorType["UNKNOWN_ERROR"] = "unknown_error";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
/**
 * Error Severity Levels
 */
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity[ErrorSeverity["DEBUG"] = 0] = "DEBUG";
    ErrorSeverity[ErrorSeverity["INFO"] = 1] = "INFO";
    ErrorSeverity[ErrorSeverity["WARNING"] = 2] = "WARNING";
    ErrorSeverity[ErrorSeverity["ERROR"] = 3] = "ERROR";
    ErrorSeverity[ErrorSeverity["CRITICAL"] = 4] = "CRITICAL";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
/**
 * Error Categories
 */
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["TRANSIENT"] = "transient";
    ErrorCategory["PERSISTENT"] = "persistent";
    ErrorCategory["FATAL"] = "fatal"; // Unrecoverable errors
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
/**
 * Error Handler Implementation
 * Provides error classification, recovery strategies, and error tracking
 */
class ErrorHandler extends events_1.EventEmitter {
    constructor(logger, metrics, options = {}) {
        super();
        this.logger = logger;
        this.metrics = metrics;
        this.errors = new Map();
        this.recoveryAttempts = new Map();
        this.errorCounts = new Map();
        this.lastErrors = new Map();
        this.options = this.initializeOptions(options);
    }
    /**
     * Handle error
     */
    async handleError(error, context) {
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
            }
            else {
                // Send notification if needed
                await this.notifyError(errorContext);
                // Rethrow error
                throw this.createError(errorContext);
            }
        }
        catch (handlerError) {
            // Log handler failure
            this.logger.error('Error handler failed:', handlerError);
            // Rethrow original error
            throw error;
        }
    }
    /**
     * Clear error state
     */
    clearErrors() {
        this.errors.clear();
        this.recoveryAttempts.clear();
        this.errorCounts.clear();
        this.lastErrors.clear();
    }
    /**
     * Get error history
     */
    getErrors(filter) {
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
    initializeOptions(options) {
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
    async createErrorContext(error, context) {
        const errorMessage = typeof error === 'string' ?
            error :
            error.message;
        const baseContext = {
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
    findMappedContext(message) {
        for (const [pattern, context] of this.options.errorMap) {
            if (typeof pattern === 'string') {
                if (message.includes(pattern)) {
                    return context;
                }
            }
            else {
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
    shouldSuppressError(context) {
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
    getErrorKey(context) {
        return `${context.type}:${context.message}`;
    }
    /**
     * Track error occurrence
     */
    trackError(context) {
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
        }).catch(() => { });
    }
    /**
     * Log error with appropriate severity
     */
    logError(context) {
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
    async canRecover(context) {
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
    getRecoveryStrategy(context) {
        return this.options.strategies.get(context.type) ||
            this.options.defaultStrategy;
    }
    /**
     * Start error recovery
     */
    async startRecovery(context) {
        const strategy = this.getRecoveryStrategy(context);
        if (!strategy)
            return;
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
            await new Promise(resolve => setTimeout(resolve, delay));
            // Recovery succeeded
            this.emit('recoverySuccess', context);
            // Execute post-retry hook
            if (strategy.afterRetry) {
                await strategy.afterRetry(context, true);
            }
        }
        catch (error) {
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
    calculateRecoveryDelay(strategy, attempt) {
        const { backoffType, initialDelay, maxDelay, jitter } = strategy;
        let delay;
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
    async notifyError(context) {
        if (!this.options.notifyOnError ||
            context.severity < this.options.notificationThreshold) {
            return;
        }
        // TODO: Implement notification system
    }
    /**
     * Prune old errors
     */
    pruneErrors() {
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
    createError(context) {
        const error = new Error(context.message);
        error.name = context.type;
        error.stack = context.stack;
        return error;
    }
    /**
     * Generate unique error ID
     */
    generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
}
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=ErrorHandler.js.map