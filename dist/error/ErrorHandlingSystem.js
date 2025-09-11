"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandlingSystem = exports.ErrorCategory = exports.ErrorSeverity = void 0;
const events_1 = require("events");
const Logger_1 = require("../utils/Logger");
const DeviceManager_1 = require("../core/DeviceManager");
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["DEVICE"] = "device";
    ErrorCategory["PROTOCOL"] = "protocol";
    ErrorCategory["SECURITY"] = "security";
    ErrorCategory["SYSTEM"] = "system";
    ErrorCategory["APPLICATION"] = "application";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
class ErrorHandlingSystem extends events_1.EventEmitter {
    constructor() {
        super();
        this.handlers = new Map();
        this.retryConfigs = new Map();
        this.degradationConfigs = new Map();
        this.logger = Logger_1.Logger.getInstance();
        // Initialize with default handlers
        this.registerDefaultHandlers();
    }
    static getInstance() {
        if (!ErrorHandlingSystem.instance) {
            ErrorHandlingSystem.instance = new ErrorHandlingSystem();
        }
        return ErrorHandlingSystem.instance;
    }
    registerHandler(category, handler) {
        if (!this.handlers.has(category)) {
            this.handlers.set(category, []);
        }
        this.handlers.get(category).push(handler);
    }
    setRetryConfig(category, config) {
        this.retryConfigs.set(category, {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            timeout: 10000,
            exponentialBackoff: true,
            ...config
        });
    }
    setDegradationConfig(category, config) {
        this.degradationConfigs.set(category, {
            timeoutReduction: 0.5,
            featureDisablement: [],
            qualityReduction: 0.25,
            ...config
        });
    }
    async handleError(error, context) {
        try {
            this.logError(error, context);
            // Get relevant handlers
            const handlers = this.handlers.get(context.category) || [];
            const defaultHandlers = this.handlers.get('default') || [];
            const allHandlers = [...handlers, ...defaultHandlers];
            // Find first handler that can handle this error
            for (const handler of allHandlers) {
                if (handler.canHandle(error, context)) {
                    const action = await handler.handle(error, context);
                    await this.executeAction(action, error, context);
                    return action;
                }
            }
            // No handler found, use default behavior
            return await this.handleUnhandledError(error, context);
        }
        catch (handlingError) {
            this.logger.error('Error handling failure', {
                originalError: error,
                handlingError,
                context
            });
            return {
                type: 'alert',
                params: {
                    level: 'critical',
                    message: 'Error handling system failure'
                }
            };
        }
    }
    async executeAction(action, error, context) {
        switch (action.type) {
            case 'retry':
                await this.executeRetry(error, context, action.params);
                break;
            case 'fallback':
                await this.executeFallback(context, action.params);
                break;
            case 'degrade':
                await this.executeGracefulDegradation(context, action.params);
                break;
            case 'recover':
                await this.executeRecovery(context, action.params);
                break;
            case 'alert':
                await this.executeAlert(context, action.params);
                break;
        }
    }
    async executeRetry(error, context, params) {
        const config = this.retryConfigs.get(context.category) || {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            timeout: 10000,
            exponentialBackoff: true
        };
        const attempt = params?.attempt || 1;
        if (attempt > config.maxAttempts) {
            throw new Error('Max retry attempts exceeded');
        }
        const delay = config.exponentialBackoff
            ? Math.min(config.initialDelay * Math.pow(2, attempt - 1), config.maxDelay)
            : config.initialDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
        // Execute retry logic
        try {
            if (params?.operation) {
                await this.executeOperation(params.operation, params.args);
            }
        }
        catch (retryError) {
            return this.handleError(retryError, {
                ...context,
                metadata: {
                    ...context.metadata,
                    retryAttempt: attempt
                }
            });
        }
    }
    async executeFallback(context, params) {
        if (!params?.fallbackOperation) {
            throw new Error('No fallback operation specified');
        }
        try {
            await this.executeOperation(params.fallbackOperation, params.args);
        }
        catch (fallbackError) {
            this.logger.error('Fallback operation failed', {
                error: fallbackError,
                context,
                params
            });
            throw fallbackError;
        }
    }
    async executeGracefulDegradation(context, params) {
        const config = this.degradationConfigs.get(context.category);
        if (!config)
            return;
        // Apply degradation measures
        if (params?.timeout) {
            params.timeout *= config.timeoutReduction;
        }
        if (config.featureDisablement.length > 0) {
            await this.disableFeatures(config.featureDisablement);
        }
        if (params?.quality) {
            params.quality *= (1 - config.qualityReduction);
        }
        this.emit('degradation', {
            context,
            config,
            params
        });
    }
    async executeRecovery(context, params) {
        // Implement recovery steps
        const steps = params?.steps || ['reset', 'reinitialize', 'restore'];
        for (const step of steps) {
            try {
                await this.executeOperation(step, params);
            }
            catch (recoveryError) {
                this.logger.error(`Recovery step ${step} failed`, {
                    error: recoveryError,
                    context,
                    params
                });
                throw recoveryError;
            }
        }
    }
    async executeAlert(context, params) {
        const level = params?.level || 'error';
        const message = params?.message || 'System error occurred';
        this.emit('alert', {
            level,
            message,
            context,
            timestamp: new Date()
        });
        this.logger[level](message, {
            context,
            params
        });
    }
    async handleUnhandledError(error, context) {
        this.logger.error('Unhandled error', { error, context });
        return {
            type: 'alert',
            params: {
                level: 'high',
                message: 'Unhandled error encountered'
            }
        };
    }
    async executeOperation(operation, args) {
        try {
            switch (operation) {
                case 'restart_device':
                    if (args?.deviceId) {
                        const deviceManager = DeviceManager_1.DeviceManager.getInstance();
                        const device = deviceManager.getDevice(args.deviceId);
                        // Implement device restart logic
                        this.logger.info('Device restart requested', { deviceId: args.deviceId });
                        return { success: true, message: 'Device restart initiated' };
                    }
                    break;
                case 'clear_cache':
                    // Implement cache clearing logic
                    this.logger.info('Cache clear requested');
                    return { success: true, message: 'Cache cleared' };
                case 'reload_config':
                    // Implement configuration reload logic
                    this.logger.info('Configuration reload requested');
                    return { success: true, message: 'Configuration reloaded' };
                case 'restart_service':
                    // Implement service restart logic
                    this.logger.info('Service restart requested');
                    return { success: true, message: 'Service restart initiated' };
                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }
        }
        catch (error) {
            this.logger.error('Operation execution failed', { operation, args, error: error.message });
            throw error;
        }
    }
    async disableFeatures(features) {
        try {
            for (const feature of features) {
                switch (feature) {
                    case 'device_control':
                        // Disable device control features
                        this.logger.warn('Device control feature disabled due to errors');
                        break;
                    case 'pattern_execution':
                        // Disable pattern execution features
                        this.logger.warn('Pattern execution feature disabled due to errors');
                        break;
                    case 'remote_control':
                        // Disable remote control features
                        this.logger.warn('Remote control feature disabled due to errors');
                        break;
                    case 'analytics':
                        // Disable analytics features
                        this.logger.warn('Analytics feature disabled due to errors');
                        break;
                    default:
                        this.logger.warn(`Unknown feature to disable: ${feature}`);
                }
            }
            this.logger.info('Features disabled', { features });
        }
        catch (error) {
            this.logger.error('Feature disablement failed', { features, error: error.message });
            throw error;
        }
    }
    logError(error, context) {
        const logLevel = this.getLogLevel(context.severity);
        this.logger[logLevel]('Error occurred', {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context
        });
        // Emit error event for monitoring
        this.emit('error', {
            error,
            context,
            timestamp: new Date()
        });
    }
    getLogLevel(severity) {
        switch (severity) {
            case ErrorSeverity.LOW:
                return 'info';
            case ErrorSeverity.MEDIUM:
                return 'warn';
            case ErrorSeverity.HIGH:
            case ErrorSeverity.CRITICAL:
                return 'error';
            default:
                return 'error';
        }
    }
    registerDefaultHandlers() {
        // Network error handler
        this.registerHandler(ErrorCategory.NETWORK, {
            canHandle: (error) => error.name === 'NetworkError',
            handle: async (error, context) => ({
                type: 'retry',
                params: { maxAttempts: 3 }
            })
        });
        // Device error handler
        this.registerHandler(ErrorCategory.DEVICE, {
            canHandle: (error) => error.name === 'DeviceError',
            handle: async (error, context) => ({
                type: 'recover',
                params: { steps: ['reset', 'reconnect'] }
            })
        });
        // Protocol error handler
        this.registerHandler(ErrorCategory.PROTOCOL, {
            canHandle: (error) => error.name === 'ProtocolError',
            handle: async (error, context) => ({
                type: 'degrade',
                params: { timeout: 5000 }
            })
        });
        // Security error handler
        this.registerHandler(ErrorCategory.SECURITY, {
            canHandle: (error) => error.name === 'SecurityError',
            handle: async (error, context) => ({
                type: 'alert',
                params: { level: 'critical' }
            })
        });
    }
    getRegisteredHandlers() {
        return new Map(this.handlers);
    }
    getRetryConfigs() {
        return new Map(this.retryConfigs);
    }
    getDegradationConfigs() {
        return new Map(this.degradationConfigs);
    }
}
exports.ErrorHandlingSystem = ErrorHandlingSystem;
//# sourceMappingURL=ErrorHandlingSystem.js.map