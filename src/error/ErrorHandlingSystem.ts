import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  DEVICE = 'device',
  PROTOCOL = 'protocol',
  SECURITY = 'security',
  SYSTEM = 'system',
  APPLICATION = 'application'
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

export class ErrorHandlingSystem extends EventEmitter {
  private static instance: ErrorHandlingSystem;
  private handlers: Map<string, ErrorHandler[]>;
  private retryConfigs: Map<string, RetryConfig>;
  private degradationConfigs: Map<string, DegradationConfig>;
  private logger: Logger;

  private constructor() {
    super();
    this.handlers = new Map();
    this.retryConfigs = new Map();
    this.degradationConfigs = new Map();
    this.logger = Logger.getInstance();

    // Initialize with default handlers
    this.registerDefaultHandlers();
  }

  static getInstance(): ErrorHandlingSystem {
    if (!ErrorHandlingSystem.instance) {
      ErrorHandlingSystem.instance = new ErrorHandlingSystem();
    }
    return ErrorHandlingSystem.instance;
  }

  registerHandler(category: ErrorCategory, handler: ErrorHandler): void {
    if (!this.handlers.has(category)) {
      this.handlers.set(category, []);
    }
    this.handlers.get(category)!.push(handler);
  }

  setRetryConfig(category: ErrorCategory, config: RetryConfig): void {
    this.retryConfigs.set(category, {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      timeout: 10000,
      exponentialBackoff: true,
      ...config
    });
  }

  setDegradationConfig(category: ErrorCategory, config: DegradationConfig): void {
    this.degradationConfigs.set(category, {
      timeoutReduction: 0.5,
      featureDisablement: [],
      qualityReduction: 0.25,
      ...config
    });
  }

  async handleError(error: Error, context: ErrorContext): Promise<ErrorAction> {
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

    } catch (handlingError) {
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

  private async executeAction(action: ErrorAction, error: Error, context: ErrorContext): Promise<void> {
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

  private async executeRetry(
    error: Error,
    context: ErrorContext,
    params?: Record<string, any>
  ): Promise<void> {
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
    } catch (retryError) {
      return this.handleError(retryError as Error, {
        ...context,
        metadata: {
          ...context.metadata,
          retryAttempt: attempt
        }
      });
    }
  }

  private async executeFallback(
    context: ErrorContext,
    params?: Record<string, any>
  ): Promise<void> {
    if (!params?.fallbackOperation) {
      throw new Error('No fallback operation specified');
    }

    try {
      await this.executeOperation(params.fallbackOperation, params.args);
    } catch (fallbackError) {
      this.logger.error('Fallback operation failed', {
        error: fallbackError,
        context,
        params
      });
      throw fallbackError;
    }
  }

  private async executeGracefulDegradation(
    context: ErrorContext,
    params?: Record<string, any>
  ): Promise<void> {
    const config = this.degradationConfigs.get(context.category);
    if (!config) return;

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

  private async executeRecovery(
    context: ErrorContext,
    params?: Record<string, any>
  ): Promise<void> {
    // Implement recovery steps
    const steps = params?.steps || ['reset', 'reinitialize', 'restore'];

    for (const step of steps) {
      try {
        await this.executeOperation(step, params);
      } catch (recoveryError) {
        this.logger.error(`Recovery step ${step} failed`, {
          error: recoveryError,
          context,
          params
        });
        throw recoveryError;
      }
    }
  }

  private async executeAlert(
    context: ErrorContext,
    params?: Record<string, any>
  ): Promise<void> {
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

  private async handleUnhandledError(error: Error, context: ErrorContext): Promise<ErrorAction> {
    this.logger.error('Unhandled error', { error, context });

    return {
      type: 'alert',
      params: {
        level: 'high',
        message: 'Unhandled error encountered'
      }
    };
  }

  private async executeOperation(operation: string, args?: any): Promise<any> {
    // This should be implemented to execute operations based on your system's needs
    throw new Error('Operation execution not implemented');
  }

  private async disableFeatures(features: string[]): Promise<void> {
    // This should be implemented to disable features based on your system's needs
    throw new Error('Feature disablement not implemented');
  }

  private logError(error: Error, context: ErrorContext): void {
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

  private getLogLevel(severity: ErrorSeverity): string {
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

  private registerDefaultHandlers(): void {
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

  getRegisteredHandlers(): Map<string, ErrorHandler[]> {
    return new Map(this.handlers);
  }

  getRetryConfigs(): Map<string, RetryConfig> {
    return new Map(this.retryConfigs);
  }

  getDegradationConfigs(): Map<string, DegradationConfig> {
    return new Map(this.degradationConfigs);
  }
}
