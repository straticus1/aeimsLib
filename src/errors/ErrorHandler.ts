import { Logger } from '../utils/Logger';

// Base error class
export abstract class AeimsError extends Error {
    public readonly code: string;
    public readonly severity: ErrorSeverity;
    public readonly context: Record<string, any>;
    public readonly timestamp: Date;
    public readonly recoverable: boolean;

    constructor(
        message: string,
        code: string,
        severity: ErrorSeverity = ErrorSeverity.ERROR,
        context: Record<string, any> = {},
        recoverable: boolean = false
    ) {
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

    toJSON(): ErrorInfo {
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

// Error severity levels
export enum ErrorSeverity {
    CRITICAL = 'critical',
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info'
}

// Specific error types
export class DeviceError extends AeimsError {
    constructor(message: string, deviceId?: string, context: Record<string, any> = {}) {
        super(
            message,
            'DEVICE_ERROR',
            ErrorSeverity.ERROR,
            { deviceId, ...context },
            true
        );
    }
}

export class ConnectionError extends AeimsError {
    constructor(message: string, endpoint?: string, context: Record<string, any> = {}) {
        super(
            message,
            'CONNECTION_ERROR',
            ErrorSeverity.ERROR,
            { endpoint, ...context },
            true
        );
    }
}

export class ValidationError extends AeimsError {
    constructor(message: string, field?: string, value?: any, context: Record<string, any> = {}) {
        super(
            message,
            'VALIDATION_ERROR',
            ErrorSeverity.WARNING,
            { field, value, ...context },
            false
        );
    }
}

export class SecurityError extends AeimsError {
    constructor(message: string, context: Record<string, any> = {}) {
        super(
            message,
            'SECURITY_ERROR',
            ErrorSeverity.CRITICAL,
            context,
            false
        );
    }
}

export class AuthenticationError extends AeimsError {
    constructor(message: string, userId?: string, context: Record<string, any> = {}) {
        super(
            message,
            'AUTH_ERROR',
            ErrorSeverity.ERROR,
            { userId, ...context },
            false
        );
    }
}

export class AuthorizationError extends AeimsError {
    constructor(message: string, userId?: string, resource?: string, context: Record<string, any> = {}) {
        super(
            message,
            'AUTHZ_ERROR',
            ErrorSeverity.ERROR,
            { userId, resource, ...context },
            false
        );
    }
}

export class DatabaseError extends AeimsError {
    constructor(message: string, query?: string, context: Record<string, any> = {}) {
        super(
            message,
            'DATABASE_ERROR',
            ErrorSeverity.ERROR,
            { query, ...context },
            true
        );
    }
}

export class ConfigurationError extends AeimsError {
    constructor(message: string, configKey?: string, context: Record<string, any> = {}) {
        super(
            message,
            'CONFIG_ERROR',
            ErrorSeverity.CRITICAL,
            { configKey, ...context },
            false
        );
    }
}

export class RateLimitError extends AeimsError {
    constructor(message: string, limit?: number, window?: number, context: Record<string, any> = {}) {
        super(
            message,
            'RATE_LIMIT_ERROR',
            ErrorSeverity.WARNING,
            { limit, window, ...context },
            true
        );
    }
}

export class PatternError extends AeimsError {
    constructor(message: string, patternId?: string, context: Record<string, any> = {}) {
        super(
            message,
            'PATTERN_ERROR',
            ErrorSeverity.ERROR,
            { patternId, ...context },
            true
        );
    }
}

// Error information interface
export interface ErrorInfo {
    name: string;
    message: string;
    code: string;
    severity: ErrorSeverity;
    context: Record<string, any>;
    timestamp: Date;
    recoverable: boolean;
    stack?: string;
}

// Error recovery strategy interface
export interface ErrorRecoveryStrategy {
    canRecover(error: AeimsError): boolean;
    recover(error: AeimsError): Promise<boolean>;
}

// Circuit breaker for error handling
export class CircuitBreaker {
    private failures: number = 0;
    private lastFailureTime: Date | null = null;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

    constructor(
        private readonly failureThreshold: number = 5,
        private readonly recoveryTimeout: number = 60000, // 1 minute
        private readonly successThreshold: number = 3
    ) {}

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (this.shouldAttemptReset()) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        this.failures = 0;
        this.state = 'CLOSED';
    }

    private onFailure(): void {
        this.failures++;
        this.lastFailureTime = new Date();

        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }

    private shouldAttemptReset(): boolean {
        return this.lastFailureTime !== null &&
               Date.now() - this.lastFailureTime.getTime() >= this.recoveryTimeout;
    }

    getState(): string {
        return this.state;
    }
}

// Main error handler class
export class ErrorHandler {
    private static instance: ErrorHandler;
    private logger: Logger;
    private recoveryStrategies: Map<string, ErrorRecoveryStrategy> = new Map();
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();
    private errorCounts: Map<string, number> = new Map();
    private lastErrors: Map<string, AeimsError> = new Map();

    private constructor() {
        this.logger = Logger.getInstance();
        this.setupDefaultRecoveryStrategies();
        this.setupGlobalErrorHandlers();
    }

    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    private setupDefaultRecoveryStrategies(): void {
        // Device connection recovery
        this.addRecoveryStrategy('DEVICE_ERROR', {
            canRecover: (error: AeimsError) => error.recoverable,
            recover: async (error: AeimsError) => {
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
            canRecover: (error: AeimsError) => error.recoverable,
            recover: async (error: AeimsError) => {
                this.logger.info('Attempting database reconnection');
                // Implement database reconnection logic
                return true;
            }
        });

        // Connection recovery
        this.addRecoveryStrategy('CONNECTION_ERROR', {
            canRecover: (error: AeimsError) => error.recoverable,
            recover: async (error: AeimsError) => {
                const endpoint = error.context.endpoint;
                this.logger.info('Attempting connection recovery', { endpoint });
                // Implement connection recovery logic
                return true;
            }
        });
    }

    private setupGlobalErrorHandlers(): void {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error: Error) => {
            this.handleCriticalError(error, 'Uncaught Exception');
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
            this.handleCriticalError(reason, 'Unhandled Promise Rejection', { promise });
        });

        // Handle warnings
        process.on('warning', (warning: Error) => {
            this.logger.warn('Process warning', {
                name: warning.name,
                message: warning.message,
                stack: warning.stack
            });
        });
    }

    public addRecoveryStrategy(errorCode: string, strategy: ErrorRecoveryStrategy): void {
        this.recoveryStrategies.set(errorCode, strategy);
    }

    public getCircuitBreaker(name: string): CircuitBreaker {
        if (!this.circuitBreakers.has(name)) {
            this.circuitBreakers.set(name, new CircuitBreaker());
        }
        return this.circuitBreakers.get(name)!;
    }

    public async handleError(error: Error | AeimsError, context: Record<string, any> = {}): Promise<boolean> {
        let aeimsError: AeimsError;

        if (error instanceof AeimsError) {
            aeimsError = error;
        } else {
            aeimsError = new AeimsError(
                error.message,
                'UNKNOWN_ERROR',
                ErrorSeverity.ERROR,
                { originalError: error.name, ...context }
            );
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

    private logError(error: AeimsError): void {
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

    private updateErrorStats(error: AeimsError): void {
        const currentCount = this.errorCounts.get(error.code) || 0;
        this.errorCounts.set(error.code, currentCount + 1);
        this.lastErrors.set(error.code, error);
    }

    private async attemptRecovery(error: AeimsError): Promise<boolean> {
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
        } catch (recoveryError) {
            this.logger.error('Error recovery failed', {
                originalError: error.toJSON(),
                recoveryError: recoveryError instanceof Error ? recoveryError.message : recoveryError
            });
        }

        return false;
    }

    private handleCriticalError(error: any, type: string, context: Record<string, any> = {}): void {
        const criticalError = new AeimsError(
            error.message || String(error),
            'CRITICAL_SYSTEM_ERROR',
            ErrorSeverity.CRITICAL,
            { type, ...context }
        );

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

    public getErrorStats(): Record<string, any> {
        const stats: Record<string, any> = {};
        
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

    public clearErrorStats(): void {
        this.errorCounts.clear();
        this.lastErrors.clear();
    }

    public createErrorResponse(error: AeimsError, includeStack: boolean = false): Record<string, any> {
        const response: Record<string, any> = {
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

// Utility functions for error handling
export function isAeimsError(error: any): error is AeimsError {
    return error instanceof AeimsError;
}

export function createErrorFromCode(code: string, message: string, context: Record<string, any> = {}): AeimsError {
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
export function handleErrors(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
        try {
            return await method.apply(this, args);
        } catch (error) {
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
