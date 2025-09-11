"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.CircuitBreaker = exports.PatternError = exports.RateLimitError = exports.ConfigurationError = exports.DatabaseError = exports.AuthorizationError = exports.AuthenticationError = exports.SecurityError = exports.ValidationError = exports.ConnectionError = exports.DeviceError = exports.ErrorSeverity = exports.AeimsError = void 0;
exports.isAeimsError = isAeimsError;
exports.createErrorFromCode = createErrorFromCode;
exports.handleErrors = handleErrors;
const Logger_1 = require("../utils/Logger");
// Base error class
class AeimsError extends Error {
    constructor(message, code, severity = ErrorSeverity.ERROR, context = {}, recoverable = false) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.severity = severity;
        this.context = context;
        this.timestamp = new Date();
        this.recoverable = recoverable;
        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            severity: this.severity,
            context: this.context,
            timestamp: this.timestamp,
            recoverable: this.recoverable,
            stack: this.stack
        };
    }
}
exports.AeimsError = AeimsError;
// Error severity levels
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["CRITICAL"] = "critical";
    ErrorSeverity["ERROR"] = "error";
    ErrorSeverity["WARNING"] = "warning";
    ErrorSeverity["INFO"] = "info";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
// Specific error types
class DeviceError extends AeimsError {
    constructor(message, deviceId, context = {}) {
        super(message, 'DEVICE_ERROR', ErrorSeverity.ERROR, { deviceId, ...context }, true);
    }
}
exports.DeviceError = DeviceError;
class ConnectionError extends AeimsError {
    constructor(message, endpoint, context = {}) {
        super(message, 'CONNECTION_ERROR', ErrorSeverity.ERROR, { endpoint, ...context }, true);
    }
}
exports.ConnectionError = ConnectionError;
class ValidationError extends AeimsError {
    constructor(message, field, value, context = {}) {
        super(message, 'VALIDATION_ERROR', ErrorSeverity.WARNING, { field, value, ...context }, false);
    }
}
exports.ValidationError = ValidationError;
class SecurityError extends AeimsError {
    constructor(message, context = {}) {
        super(message, 'SECURITY_ERROR', ErrorSeverity.CRITICAL, context, false);
    }
}
exports.SecurityError = SecurityError;
class AuthenticationError extends AeimsError {
    constructor(message, userId, context = {}) {
        super(message, 'AUTH_ERROR', ErrorSeverity.ERROR, { userId, ...context }, false);
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends AeimsError {
    constructor(message, userId, resource, context = {}) {
        super(message, 'AUTHZ_ERROR', ErrorSeverity.ERROR, { userId, resource, ...context }, false);
    }
}
exports.AuthorizationError = AuthorizationError;
class DatabaseError extends AeimsError {
    constructor(message, query, context = {}) {
        super(message, 'DATABASE_ERROR', ErrorSeverity.ERROR, { query, ...context }, true);
    }
}
exports.DatabaseError = DatabaseError;
class ConfigurationError extends AeimsError {
    constructor(message, configKey, context = {}) {
        super(message, 'CONFIG_ERROR', ErrorSeverity.CRITICAL, { configKey, ...context }, false);
    }
}
exports.ConfigurationError = ConfigurationError;
class RateLimitError extends AeimsError {
    constructor(message, limit, window, context = {}) {
        super(message, 'RATE_LIMIT_ERROR', ErrorSeverity.WARNING, { limit, window, ...context }, true);
    }
}
exports.RateLimitError = RateLimitError;
class PatternError extends AeimsError {
    constructor(message, patternId, context = {}) {
        super(message, 'PATTERN_ERROR', ErrorSeverity.ERROR, { patternId, ...context }, true);
    }
}
exports.PatternError = PatternError;
// Circuit breaker for error handling
class CircuitBreaker {
    constructor(failureThreshold = 5, recoveryTimeout = 60000, // 1 minute
    successThreshold = 3) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeout = recoveryTimeout;
        this.successThreshold = successThreshold;
        this.failures = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED';
    }
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (this.shouldAttemptReset()) {
                this.state = 'HALF_OPEN';
            }
            else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    onFailure() {
        this.failures++;
        this.lastFailureTime = new Date();
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
    shouldAttemptReset() {
        return this.lastFailureTime !== null &&
            Date.now() - this.lastFailureTime.getTime() >= this.recoveryTimeout;
    }
    getState() {
        return this.state;
    }
}
exports.CircuitBreaker = CircuitBreaker;
// Main error handler class
class ErrorHandler {
    constructor() {
        this.recoveryStrategies = new Map();
        this.circuitBreakers = new Map();
        this.errorCounts = new Map();
        this.lastErrors = new Map();
        this.logger = Logger_1.Logger.getInstance();
        this.setupDefaultRecoveryStrategies();
        this.setupGlobalErrorHandlers();
    }
    static getInstance() {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }
    setupDefaultRecoveryStrategies() {
        // Device connection recovery
        this.addRecoveryStrategy('DEVICE_ERROR', {
            canRecover: (error) => error.recoverable,
            recover: async (error) => {
                const deviceId = error.context.deviceId;
                if (deviceId) {
                    this.logger.info('Attempting device reconnection', { deviceId });
                    // Implement device reconnection logic
                    return true;
                }
                return false;
            }
        });
        // Database connection recovery
        this.addRecoveryStrategy('DATABASE_ERROR', {
            canRecover: (error) => error.recoverable,
            recover: async (error) => {
                this.logger.info('Attempting database reconnection');
                // Implement database reconnection logic
                return true;
            }
        });
        // Connection recovery
        this.addRecoveryStrategy('CONNECTION_ERROR', {
            canRecover: (error) => error.recoverable,
            recover: async (error) => {
                const endpoint = error.context.endpoint;
                this.logger.info('Attempting connection recovery', { endpoint });
                // Implement connection recovery logic
                return true;
            }
        });
    }
    setupGlobalErrorHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.handleCriticalError(error, 'Uncaught Exception');
        });
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            this.handleCriticalError(reason, 'Unhandled Promise Rejection', { promise });
        });
        // Handle warnings
        process.on('warning', (warning) => {
            this.logger.warn('Process warning', {
                name: warning.name,
                message: warning.message,
                stack: warning.stack
            });
        });
    }
    addRecoveryStrategy(errorCode, strategy) {
        this.recoveryStrategies.set(errorCode, strategy);
    }
    getCircuitBreaker(name) {
        if (!this.circuitBreakers.has(name)) {
            this.circuitBreakers.set(name, new CircuitBreaker());
        }
        return this.circuitBreakers.get(name);
    }
    async handleError(error, context = {}) {
        let aeimsError;
        if (error instanceof AeimsError) {
            aeimsError = error;
        }
        else {
            aeimsError = new AeimsError(error.message, 'UNKNOWN_ERROR', ErrorSeverity.ERROR, { originalError: error.name, ...context });
        }
        // Log the error
        this.logError(aeimsError);
        // Update error statistics
        this.updateErrorStats(aeimsError);
        // Attempt recovery if possible
        if (aeimsError.recoverable) {
            return await this.attemptRecovery(aeimsError);
        }
        return false;
    }
    logError(error) {
        const logData = {
            error: error.toJSON(),
            errorCount: this.errorCounts.get(error.code) || 0
        };
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
                this.logger.error('Critical error occurred', logData);
                break;
            case ErrorSeverity.ERROR:
                this.logger.error('Error occurred', logData);
                break;
            case ErrorSeverity.WARNING:
                this.logger.warn('Warning occurred', logData);
                break;
            case ErrorSeverity.INFO:
                this.logger.info('Info error occurred', logData);
                break;
        }
    }
    updateErrorStats(error) {
        const currentCount = this.errorCounts.get(error.code) || 0;
        this.errorCounts.set(error.code, currentCount + 1);
        this.lastErrors.set(error.code, error);
    }
    async attemptRecovery(error) {
        const strategy = this.recoveryStrategies.get(error.code);
        if (!strategy || !strategy.canRecover(error)) {
            return false;
        }
        try {
            const recovered = await strategy.recover(error);
            if (recovered) {
                this.logger.info('Error recovery successful', {
                    errorCode: error.code,
                    errorMessage: error.message
                });
                return true;
            }
        }
        catch (recoveryError) {
            this.logger.error('Error recovery failed', {
                originalError: error.toJSON(),
                recoveryError: recoveryError instanceof Error ? recoveryError.message : recoveryError
            });
        }
        return false;
    }
    handleCriticalError(error, type, context = {}) {
        const criticalError = new AeimsError(error.message || String(error), 'CRITICAL_SYSTEM_ERROR', ErrorSeverity.CRITICAL, { type, ...context });
        this.logError(criticalError);
        // In production, you might want to:
        // 1. Send alerts to monitoring systems
        // 2. Attempt graceful shutdown
        // 3. Restart services
        // For now, we'll just log and continue
        this.logger.error('Critical system error - system may be unstable', {
            error: criticalError.toJSON()
        });
    }
    getErrorStats() {
        const stats = {};
        for (const [code, count] of this.errorCounts.entries()) {
            const lastError = this.lastErrors.get(code);
            stats[code] = {
                count,
                lastOccurrence: lastError?.timestamp,
                lastMessage: lastError?.message,
                severity: lastError?.severity
            };
        }
        return stats;
    }
    clearErrorStats() {
        this.errorCounts.clear();
        this.lastErrors.clear();
    }
    createErrorResponse(error, includeStack = false) {
        const response = {
            error: true,
            code: error.code,
            message: error.message,
            severity: error.severity,
            timestamp: error.timestamp,
            recoverable: error.recoverable
        };
        if (includeStack && error.stack) {
            response.stack = error.stack;
        }
        // Don't expose sensitive context in production
        if (process.env.NODE_ENV !== 'production') {
            response.context = error.context;
        }
        return response;
    }
}
exports.ErrorHandler = ErrorHandler;
// Utility functions for error handling
function isAeimsError(error) {
    return error instanceof AeimsError;
}
function createErrorFromCode(code, message, context = {}) {
    switch (code) {
        case 'DEVICE_ERROR':
            return new DeviceError(message, context.deviceId, context);
        case 'CONNECTION_ERROR':
            return new ConnectionError(message, context.endpoint, context);
        case 'VALIDATION_ERROR':
            return new ValidationError(message, context.field, context.value, context);
        case 'SECURITY_ERROR':
            return new SecurityError(message, context);
        case 'AUTH_ERROR':
            return new AuthenticationError(message, context.userId, context);
        case 'AUTHZ_ERROR':
            return new AuthorizationError(message, context.userId, context.resource, context);
        case 'DATABASE_ERROR':
            return new DatabaseError(message, context.query, context);
        case 'CONFIG_ERROR':
            return new ConfigurationError(message, context.configKey, context);
        case 'RATE_LIMIT_ERROR':
            return new RateLimitError(message, context.limit, context.window, context);
        case 'PATTERN_ERROR':
            return new PatternError(message, context.patternId, context);
        default:
            return new AeimsError(message, code, ErrorSeverity.ERROR, context);
    }
}
// Decorator for automatic error handling
function handleErrors(target, propertyName, descriptor) {
    const method = descriptor.value;
    descriptor.value = async function (...args) {
        try {
            return await method.apply(this, args);
        }
        catch (error) {
            const errorHandler = ErrorHandler.getInstance();
            await errorHandler.handleError(error, {
                method: propertyName,
                class: target.constructor.name,
                args: args.length
            });
            throw error;
        }
    };
    return descriptor;
}
//# sourceMappingURL=ErrorHandler.js.map