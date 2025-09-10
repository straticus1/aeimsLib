import { MetricsCollector, MetricType, MetricCategory } from './MetricsCollector';
import {
  AnalyticsCollector,
  AnalyticsEventType,
  AnalyticsEvent,
  DeviceUsageStats,
  AnalyticsSnapshot
} from './AnalyticsCollector';

export {
  // Metrics exports
  MetricsCollector,
  MetricType,
  MetricCategory,
  
  // Analytics exports
  AnalyticsCollector,
  AnalyticsEventType,
  AnalyticsEvent,
  DeviceUsageStats,
  AnalyticsSnapshot
};

/**
 * Initialize monitoring system with default configuration.
 */
export function initializeMonitoring(): void {
  const metrics = MetricsCollector.getInstance();
  const analytics = AnalyticsCollector.getInstance();

  // Register standard metrics
  metrics.registerStandardMetrics();

  // Set up event listeners to sync analytics with metrics
  analytics.on('eventTracked', (event: AnalyticsEvent) => {
    switch (event.type) {
      case AnalyticsEventType.DEVICE_CONNECTED:
        metrics.recordMetric('device.connections', 1, {
          device_id: event.deviceId!
        });
        break;

      case AnalyticsEventType.COMMAND_COMPLETED:
      case AnalyticsEventType.COMMAND_FAILED:
        metrics.recordMetric('device.commands', 1, {
          device_id: event.deviceId!,
          status: event.success ? 'success' : 'failed'
        });

        if (event.duration) {
          metrics.recordMetric('device.latency', event.duration, {
            device_id: event.deviceId!
          });
        }

        if (!event.success) {
          metrics.recordMetric('device.errors', 1, {
            device_id: event.deviceId!,
            error_type: event.error?.name || 'unknown'
          });
        }
        break;

      case AnalyticsEventType.ERROR_OCCURRED:
        metrics.recordMetric('error.count', 1, {
          device_id: event.deviceId!,
          error_type: event.error?.name || 'unknown'
        });
        break;
    }
  });
}

/**
 * Shutdown monitoring system and cleanup resources.
 */
export function shutdownMonitoring(): void {
  const metrics = MetricsCollector.getInstance();
  const analytics = AnalyticsCollector.getInstance();

  // Ensure final flush of analytics
  analytics['flush']().finally(() => {
    metrics.dispose();
    analytics.dispose();
  });
}

/**
 * Helper class to simplify monitoring integration in device-related code.
 */
export class DeviceMonitoring {
  private deviceId: string;
  private metrics: MetricsCollector;
  private analytics: AnalyticsCollector;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
    this.metrics = MetricsCollector.getInstance();
    this.analytics = AnalyticsCollector.getInstance();
  }

  onConnect(userId?: string, sessionId?: string): void {
    this.analytics.trackDeviceConnection(
      { id: this.deviceId, info: { id: this.deviceId } },
      userId,
      sessionId
    );
  }

  onDisconnect(userId?: string, sessionId?: string): void {
    this.analytics.trackDeviceDisconnection(
      this.deviceId,
      userId,
      sessionId
    );
  }

  onCommandStart(commandType: string): void {
    this.metrics.recordMetric('command_queue_size', 1, {
      device_id: this.deviceId
    });
  }

  onCommandComplete(
    commandType: string,
    duration: number,
    success: boolean,
    error?: Error
  ): void {
    this.analytics.trackCommandExecution(
      this.deviceId,
      commandType,
      success,
      duration,
      error
    );

    this.metrics.recordMetric('command_queue_size', -1, {
      device_id: this.deviceId
    });
  }

  onError(error: Error, context: Record<string, any>): void {
    this.analytics.trackError(
      error,
      context,
      this.deviceId
    );
  }

  onStateChange(
    stateKey: string,
    oldValue: any,
    newValue: any,
    metadata?: Record<string, string>
  ): void {
    this.analytics.trackStateChange(
      this.deviceId,
      stateKey,
      oldValue,
      newValue,
      metadata
    );
  }

  onPatternUsage(
    patternId: string,
    action: 'start' | 'stop' | 'modify',
    params?: Record<string, any>
  ): void {
    this.analytics.trackPatternUsage(
      this.deviceId,
      patternId,
      action,
      params
    );
  }

  onFeatureUsed(
    feature: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.analytics.trackFeatureUsage(
      feature,
      this.deviceId,
      userId,
      sessionId
    );
  }

  recordPerformanceMetric(
    name: string,
    value: number,
    tags: Record<string, string> = {}
  ): void {
    this.metrics.recordMetric(name, value, {
      device_id: this.deviceId,
      ...tags
    });
  }

  getDeviceStats(): DeviceUsageStats | undefined {
    return this.analytics.getDeviceStats(this.deviceId);
  }
}

/**
 * Helper class to simplify monitoring integration in session-related code.
 */
export class SessionMonitoring {
  private sessionId: string;
  private userId?: string;
  private analytics: AnalyticsCollector;

  constructor(sessionId: string, userId?: string) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.analytics = AnalyticsCollector.getInstance();
  }

  start(): void {
    this.analytics.startSession(this.sessionId, this.userId);
  }

  end(): void {
    this.analytics.endSession(this.sessionId, this.userId);
  }

  onFeatureUsed(feature: string, deviceId?: string): void {
    this.analytics.trackFeatureUsage(
      feature,
      deviceId,
      this.userId,
      this.sessionId
    );
  }

  onError(error: Error, context: Record<string, any>, deviceId?: string): void {
    this.analytics.trackError(
      error,
      context,
      deviceId,
      this.userId,
      this.sessionId
    );
  }
}
