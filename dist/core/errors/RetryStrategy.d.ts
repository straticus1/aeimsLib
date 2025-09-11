/**
 * Retry Strategy Types
 */
export type RetryBackoffType = 'fixed' | 'linear' | 'exponential';
/**
 * Retry Strategy Interface
 */
export interface RetryStrategy {
    maxAttempts: number;
    backoffType: RetryBackoffType;
    initialDelay: number;
    maxDelay: number;
    jitter?: boolean;
    timeout?: number;
    resetAfter?: number;
    isRetryable?: (error: Error) => Promise<boolean>;
    shouldRetry?: (error: Error, attempt: number) => Promise<boolean>;
    beforeRetry?: (error: Error, attempt: number) => Promise<void>;
    afterRetry?: (error: Error, attempt: number, success: boolean) => Promise<void>;
}
/**
 * Common retry strategies
 */
export declare const CommonRetryStrategies: {
    NONE: {
        maxAttempts: number;
        backoffType: RetryBackoffType;
        initialDelay: number;
        maxDelay: number;
    };
    BASIC: {
        maxAttempts: number;
        backoffType: RetryBackoffType;
        initialDelay: number;
        maxDelay: number;
        jitter: boolean;
    };
    PROGRESSIVE: {
        maxAttempts: number;
        backoffType: RetryBackoffType;
        initialDelay: number;
        maxDelay: number;
        jitter: boolean;
    };
    EXPONENTIAL: {
        maxAttempts: number;
        backoffType: RetryBackoffType;
        initialDelay: number;
        maxDelay: number;
        jitter: boolean;
    };
    AGGRESSIVE: {
        maxAttempts: number;
        backoffType: RetryBackoffType;
        initialDelay: number;
        maxDelay: number;
        jitter: boolean;
    };
    NETWORK: {
        maxAttempts: number;
        backoffType: RetryBackoffType;
        initialDelay: number;
        maxDelay: number;
        jitter: boolean;
        timeout: number;
        isRetryable: (error: Error) => Promise<boolean>;
    };
    DATABASE: {
        maxAttempts: number;
        backoffType: RetryBackoffType;
        initialDelay: number;
        maxDelay: number;
        jitter: boolean;
        isRetryable: (error: Error) => Promise<boolean>;
    };
};
/**
 * Create custom retry strategy
 */
export declare function createRetryStrategy(options: Partial<RetryStrategy>): RetryStrategy;
/**
 * Calculate retry delay
 */
export declare function calculateRetryDelay(strategy: RetryStrategy, attempt: number): number;
/**
 * Execute with retry
 */
export declare function executeWithRetry<T>(operation: () => Promise<T>, strategy: RetryStrategy): Promise<T>;
