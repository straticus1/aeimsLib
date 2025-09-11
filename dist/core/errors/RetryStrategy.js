"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommonRetryStrategies = void 0;
exports.createRetryStrategy = createRetryStrategy;
exports.calculateRetryDelay = calculateRetryDelay;
exports.executeWithRetry = executeWithRetry;
/**
 * Common retry strategies
 */
exports.CommonRetryStrategies = {
    // No retry
    NONE: {
        maxAttempts: 1,
        backoffType: 'fixed',
        initialDelay: 0,
        maxDelay: 0
    },
    // Basic retry
    BASIC: {
        maxAttempts: 3,
        backoffType: 'fixed',
        initialDelay: 1000,
        maxDelay: 1000,
        jitter: true
    },
    // Progressive retry
    PROGRESSIVE: {
        maxAttempts: 5,
        backoffType: 'linear',
        initialDelay: 1000,
        maxDelay: 10000,
        jitter: true
    },
    // Exponential backoff
    EXPONENTIAL: {
        maxAttempts: 5,
        backoffType: 'exponential',
        initialDelay: 1000,
        maxDelay: 30000,
        jitter: true
    },
    // Aggressive retry
    AGGRESSIVE: {
        maxAttempts: 10,
        backoffType: 'exponential',
        initialDelay: 100,
        maxDelay: 10000,
        jitter: true
    },
    // Network retry
    NETWORK: {
        maxAttempts: 3,
        backoffType: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000,
        jitter: true,
        timeout: 5000,
        isRetryable: async (error) => {
            // Retry network and timeout errors
            return error.message.includes('network') ||
                error.message.includes('timeout') ||
                error.message.includes('connection');
        }
    },
    // Database retry
    DATABASE: {
        maxAttempts: 5,
        backoffType: 'exponential',
        initialDelay: 100,
        maxDelay: 5000,
        jitter: true,
        isRetryable: async (error) => {
            // Retry deadlock and lock timeout errors
            return error.message.includes('deadlock') ||
                error.message.includes('lock timeout') ||
                error.message.includes('connection');
        }
    }
};
/**
 * Create custom retry strategy
 */
function createRetryStrategy(options) {
    return {
        maxAttempts: options.maxAttempts || 3,
        backoffType: options.backoffType || 'exponential',
        initialDelay: options.initialDelay || 1000,
        maxDelay: options.maxDelay || 30000,
        jitter: options.jitter !== false,
        timeout: options.timeout,
        resetAfter: options.resetAfter,
        isRetryable: options.isRetryable,
        shouldRetry: options.shouldRetry,
        beforeRetry: options.beforeRetry,
        afterRetry: options.afterRetry
    };
}
/**
 * Calculate retry delay
 */
function calculateRetryDelay(strategy, attempt) {
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
 * Execute with retry
 */
async function executeWithRetry(operation, strategy) {
    let lastError;
    let attempt = 1;
    while (attempt <= strategy.maxAttempts) {
        try {
            // Execute operation with timeout if specified
            if (strategy.timeout) {
                const result = await Promise.race([
                    operation(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), strategy.timeout))
                ]);
                // Operation succeeded
                if (strategy.afterRetry) {
                    await strategy.afterRetry(lastError, attempt, true);
                }
                return result;
            }
            else {
                // Execute without timeout
                const result = await operation();
                if (strategy.afterRetry) {
                    await strategy.afterRetry(lastError, attempt, true);
                }
                return result;
            }
        }
        catch (error) {
            lastError = error;
            // Check if error is retryable
            if (strategy.isRetryable) {
                const retryable = await strategy.isRetryable(error);
                if (!retryable) {
                    throw error;
                }
            }
            // Check custom retry logic
            if (strategy.shouldRetry) {
                const shouldRetry = await strategy.shouldRetry(error, attempt);
                if (!shouldRetry) {
                    throw error;
                }
            }
            // Check if more attempts are available
            if (attempt >= strategy.maxAttempts) {
                if (strategy.afterRetry) {
                    await strategy.afterRetry(error, attempt, false);
                }
                throw error;
            }
            // Execute pre-retry hook
            if (strategy.beforeRetry) {
                await strategy.beforeRetry(error, attempt);
            }
            // Wait for backoff delay
            const delay = calculateRetryDelay(strategy, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }
    throw lastError;
}
//# sourceMappingURL=RetryStrategy.js.map