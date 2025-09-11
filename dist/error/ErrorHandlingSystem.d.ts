import { EventEmitter } from 'events';
export declare enum ErrorSeverity {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum ErrorCategory {
    NETWORK = "network",
    DEVICE = "device",
    PROTOCOL = "protocol",
    SECURITY = "security",
    SYSTEM = "system",
    APPLICATION = "application"
}
export interface ErrorContext {
    timestamp: Date;
    severity: ErrorSeverity;
    category: ErrorCategory;
    deviceId?: string;
    userId?: string;
    sessionId?: string;
    operation?: string;
    metadata?: Record<string, any>;
    stackTrace?: string;
}
export interface ErrorAction {
    type: 'retry' | 'fallback' | 'degrade' | 'alert' | 'recover';
    params?: Record<string, any>;
}
export interface ErrorHandler {
    canHandle(error: Error, context: ErrorContext): boolean;
    handle(error: Error, context: ErrorContext): Promise<ErrorAction>;
}
export interface RetryConfig {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    timeout: number;
    exponentialBackoff: boolean;
}
export interface DegradationConfig {
    timeoutReduction: number;
    featureDisablement: string[];
    qualityReduction: number;
}
export declare class ErrorHandlingSystem extends EventEmitter {
    private static instance;
    private handlers;
    private retryConfigs;
    private degradationConfigs;
    private logger;
    private constructor();
    static getInstance(): ErrorHandlingSystem;
    registerHandler(category: ErrorCategory, handler: ErrorHandler): void;
    setRetryConfig(category: ErrorCategory, config: RetryConfig): void;
    setDegradationConfig(category: ErrorCategory, config: DegradationConfig): void;
    handleError(error: Error, context: ErrorContext): Promise<ErrorAction>;
    private executeAction;
    private executeRetry;
    private executeFallback;
    private executeGracefulDegradation;
    private executeRecovery;
    private executeAlert;
    private handleUnhandledError;
    private executeOperation;
    private disableFeatures;
    private logError;
    private getLogLevel;
    private registerDefaultHandlers;
    getRegisteredHandlers(): Map<string, ErrorHandler[]>;
    getRetryConfigs(): Map<string, RetryConfig>;
    getDegradationConfigs(): Map<string, DegradationConfig>;
}
