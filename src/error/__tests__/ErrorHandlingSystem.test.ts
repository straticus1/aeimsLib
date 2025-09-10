import { ErrorHandlingSystem, ErrorCategory, ErrorSeverity, ErrorContext, ErrorHandler, RetryConfig, DegradationConfig } from '../ErrorHandlingSystem';
import { Logger } from '../../utils/Logger';

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

class DeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceError';
  }
}

class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

describe('ErrorHandlingSystem', () => {
  let errorSystem: ErrorHandlingSystem;

  beforeEach(() => {
    // Reset singleton instance
    (ErrorHandlingSystem as any).instance = null;
    errorSystem = ErrorHandlingSystem.getInstance();

    // Mock logger
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'info').mockImplementation(() => {});
  });

  describe('Handler Registration', () => {
    test('should register custom error handlers', () => {
      const customHandler: ErrorHandler = {
        canHandle: jest.fn().mockReturnValue(true),
        handle: jest.fn().mockResolvedValue({ type: 'alert' })
      };

      errorSystem.registerHandler(ErrorCategory.APPLICATION, customHandler);
      const handlers = errorSystem.getRegisteredHandlers();

      expect(handlers.get(ErrorCategory.APPLICATION)).toContainEqual(customHandler);
    });

    test('should maintain multiple handlers per category', () => {
      const handler1: ErrorHandler = {
        canHandle: jest.fn().mockReturnValue(true),
        handle: jest.fn().mockResolvedValue({ type: 'alert' })
      };

      const handler2: ErrorHandler = {
        canHandle: jest.fn().mockReturnValue(true),
        handle: jest.fn().mockResolvedValue({ type: 'retry' })
      };

      errorSystem.registerHandler(ErrorCategory.NETWORK, handler1);
      errorSystem.registerHandler(ErrorCategory.NETWORK, handler2);

      const handlers = errorSystem.getRegisteredHandlers();
      expect(handlers.get(ErrorCategory.NETWORK)?.length).toBe(3); // Including default handler
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors with retry', async () => {
      const error = new NetworkError('Connection failed');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.NETWORK
      };

      const action = await errorSystem.handleError(error, context);
      expect(action.type).toBe('retry');
      expect(action.params?.maxAttempts).toBe(3);
    });

    test('should handle device errors with recovery', async () => {
      const error = new DeviceError('Device disconnected');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.DEVICE,
        deviceId: 'test_device'
      };

      const action = await errorSystem.handleError(error, context);
      expect(action.type).toBe('recover');
      expect(action.params?.steps).toContain('reset');
    });

    test('should handle protocol errors with degradation', async () => {
      const error = new ProtocolError('Protocol mismatch');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.PROTOCOL
      };

      const action = await errorSystem.handleError(error, context);
      expect(action.type).toBe('degrade');
    });

    test('should handle security errors with alert', async () => {
      const error = new SecurityError('Authentication failed');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.CRITICAL,
        category: ErrorCategory.SECURITY
      };

      const action = await errorSystem.handleError(error, context);
      expect(action.type).toBe('alert');
      expect(action.params?.level).toBe('critical');
    });

    test('should handle unhandled errors', async () => {
      const error = new Error('Unknown error');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.APPLICATION
      };

      const action = await errorSystem.handleError(error, context);
      expect(action.type).toBe('alert');
      expect(action.params?.level).toBe('high');
    });
  });

  describe('Retry Configuration', () => {
    test('should configure retry behavior', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        initialDelay: 500,
        maxDelay: 5000,
        timeout: 15000,
        exponentialBackoff: true
      };

      errorSystem.setRetryConfig(ErrorCategory.NETWORK, config);
      const configs = errorSystem.getRetryConfigs();
      expect(configs.get(ErrorCategory.NETWORK)).toEqual(config);
    });

    test('should use exponential backoff', async () => {
      const delays: number[] = [];
      const error = new NetworkError('Connection failed');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.NETWORK
      };

      // Mock setTimeout to capture delays
      jest.spyOn(global, 'setTimeout').mockImplementation((cb, delay) => {
        delays.push(delay as number);
        cb();
        return null as any;
      });

      // Force multiple retries
      for (let i = 0; i < 3; i++) {
        await errorSystem.handleError(error, {
          ...context,
          metadata: { attempt: i + 1 }
        });
      }

      // Verify exponential increase
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
    });
  });

  describe('Graceful Degradation', () => {
    test('should configure degradation behavior', () => {
      const config: DegradationConfig = {
        timeoutReduction: 0.75,
        featureDisablement: ['advanced_patterns', 'sync'],
        qualityReduction: 0.5
      };

      errorSystem.setDegradationConfig(ErrorCategory.PROTOCOL, config);
      const configs = errorSystem.getDegradationConfigs();
      expect(configs.get(ErrorCategory.PROTOCOL)).toEqual(config);
    });

    test('should emit degradation events', async () => {
      const degradationSpy = jest.fn();
      errorSystem.on('degradation', degradationSpy);

      const error = new ProtocolError('Protocol error');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.PROTOCOL
      };

      await errorSystem.handleError(error, context);
      expect(degradationSpy).toHaveBeenCalled();
    });
  });

  describe('Event Emission', () => {
    test('should emit error events', async () => {
      const errorSpy = jest.fn();
      errorSystem.on('error', errorSpy);

      const error = new Error('Test error');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.APPLICATION
      };

      await errorSystem.handleError(error, context);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
        error,
        context
      }));
    });

    test('should emit alert events', async () => {
      const alertSpy = jest.fn();
      errorSystem.on('alert', alertSpy);

      const error = new SecurityError('Security breach');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.CRITICAL,
        category: ErrorCategory.SECURITY
      };

      await errorSystem.handleError(error, context);
      expect(alertSpy).toHaveBeenCalled();
    });
  });

  describe('Error Context Handling', () => {
    test('should handle errors with complete context', async () => {
      const error = new DeviceError('Connection lost');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.DEVICE,
        deviceId: 'test_device',
        userId: 'test_user',
        sessionId: 'test_session',
        operation: 'connect',
        metadata: {
          attempt: 1,
          lastError: 'timeout'
        }
      };

      const action = await errorSystem.handleError(error, context);
      expect(action).toBeDefined();
      expect(action.type).toBe('recover');
    });

    test('should handle minimal context', async () => {
      const error = new Error('Simple error');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.APPLICATION
      };

      const action = await errorSystem.handleError(error, context);
      expect(action).toBeDefined();
      expect(action.type).toBe('alert');
    });
  });

  describe('Logging', () => {
    test('should log errors with appropriate severity', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const infoSpy = jest.spyOn(Logger.prototype, 'info');

      const testCases = [
        {
          error: new Error('Critical error'),
          severity: ErrorSeverity.CRITICAL,
          spy: errorSpy
        },
        {
          error: new Error('Medium error'),
          severity: ErrorSeverity.MEDIUM,
          spy: warnSpy
        },
        {
          error: new Error('Low error'),
          severity: ErrorSeverity.LOW,
          spy: infoSpy
        }
      ];

      for (const { error, severity, spy } of testCases) {
        await errorSystem.handleError(error, {
          timestamp: new Date(),
          severity,
          category: ErrorCategory.APPLICATION
        });

        expect(spy).toHaveBeenCalled();
      }
    });

    test('should include stack traces in logs', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      const error = new Error('Test error');
      const context: ErrorContext = {
        timestamp: new Date(),
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.APPLICATION,
        stackTrace: error.stack
      };

      await errorSystem.handleError(error, context);

      expect(errorSpy).toHaveBeenCalledWith(
        'Error occurred',
        expect.objectContaining({
          error: expect.objectContaining({
            stack: error.stack
          })
        })
      );
    });
  });
});
