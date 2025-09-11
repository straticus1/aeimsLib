export declare abstract class AeimsError extends Error {
    readonly code: string;
    readonly severity: ErrorSeverity;
    readonly context: Record<string, any>;
    readonly timestamp: Date;
    readonly recoverable: boolean;
    constructor(message: string, code: string, severity?: ErrorSeverity, context?: Record<string, any>, recoverable?: boolean);
    toJSON(): ErrorInfo;
}
export declare enum ErrorSeverity {
    CRITICAL = "critical",
    ERROR = "error",
    WARNING = "warning",
    INFO = "info"
}
export declare class DeviceError extends AeimsError {
    constructor(message: string, deviceId?: string, context?: Record<string, any>);
}
export declare class ConnectionError extends AeimsError {
    constructor(message: string, endpoint?: string, context?: Record<string, any>);
}
export declare class ValidationError extends AeimsError {
    constructor(message: string, field?: string, value?: any, context?: Record<string, any>);
}
export declare class SecurityError extends AeimsError {
    constructor(message: string, context?: Record<string, any>);
}
export declare class AuthenticationError extends AeimsError {
    constructor(message: string, userId?: string, context?: Record<string, any>);
}
export declare class AuthorizationError extends AeimsError {
    constructor(message: string, userId?: string, resource?: string, context?: Record<string, any>);
}
export declare class DatabaseError extends AeimsError {
    constructor(message: string, query?: string, context?: Record<string, any>);
}
export declare class ConfigurationError extends AeimsError {
    constructor(message: string, configKey?: string, context?: Record<string, any>);
}
export declare class RateLimitError extends AeimsError {
    constructor(message: string, limit?: number, window?: number, context?: Record<string, any>);
}
export declare class PatternError extends AeimsError {
    constructor(message: string, patternId?: string, context?: Record<string, any>);
}
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
export interface ErrorRecoveryStrategy {
    canRecover(error: AeimsError): boolean;
    recover(error: AeimsError): Promise<boolean>;
}
export declare class CircuitBreaker {
    private readonly failureThreshold;
    private readonly recoveryTimeout;
    private readonly successThreshold;
    private failures;
    private lastFailureTime;
    private state;
    constructor(failureThreshold?: number, recoveryTimeout?: number, // 1 minute
    successThreshold?: number);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    private shouldAttemptReset;
    getState(): string;
}
export declare class ErrorHandler {
    private static instance;
    private logger;
    private recoveryStrategies;
    private circuitBreakers;
    private errorCounts;
    private lastErrors;
    private constructor();
    static getInstance(): ErrorHandler;
    private setupDefaultRecoveryStrategies;
    private setupGlobalErrorHandlers;
    addRecoveryStrategy(errorCode: string, strategy: ErrorRecoveryStrategy): void;
    getCircuitBreaker(name: string): CircuitBreaker;
    handleError(error: Error | AeimsError, context?: Record<string, any>): Promise<boolean>;
    private logError;
    private updateErrorStats;
    private attemptRecovery;
    private handleCriticalError;
    getErrorStats(): Record<string, any>;
    clearErrorStats(): void;
    createErrorResponse(error: AeimsError, includeStack?: boolean): Record<string, any>;
}
export declare function isAeimsError(error: any): error is AeimsError;
export declare function createErrorFromCode(code: string, message: string, context?: Record<string, any>): AeimsError;
export declare function handleErrors(target: any, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor;
