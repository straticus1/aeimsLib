import {
  initializeMonitoring,
  shutdownMonitoring,
  DeviceMonitoring,
  SessionMonitoring,
  MetricsCollector,
  AnalyticsCollector,
  AnalyticsEventType
} from '../index';

jest.useFakeTimers();

describe('Monitoring Integration', () => {
  let metrics: MetricsCollector;
  let analytics: AnalyticsCollector;

  beforeEach(() => {
    metrics = MetricsCollector.getInstance();
    analytics = AnalyticsCollector.getInstance();
    initializeMonitoring();
  });

  afterEach(() => {
    shutdownMonitoring();
  });

  describe('Initialization', () => {
    it('should register standard metrics', () => {
      expect(metrics.getMetricConfig('device.connections')).toBeDefined();
      expect(metrics.getMetricConfig('device.commands')).toBeDefined();
      expect(metrics.getMetricConfig('device.latency')).toBeDefined();
      expect(metrics.getMetricConfig('error.count')).toBeDefined();
    });

    it('should sync analytics events with metrics', () => {
      const deviceId = 'test-device';
      
      analytics.trackDeviceConnection({
        id: deviceId,
        info: { id: deviceId }
      });

      const connections = metrics.getMetricValues('device.connections');
      expect(connections).toHaveLength(1);
      expect(connections[0].tags.device_id).toBe(deviceId);
    });
  });

  describe('DeviceMonitoring', () => {
    const deviceId = 'test-device';
    let monitor: DeviceMonitoring;

    beforeEach(() => {
      monitor = new DeviceMonitoring(deviceId);
    });

    it('should track device connections', () => {
      monitor.onConnect('user1', 'session1');

      const analyticsEvents = analytics.queryEvents({
        types: [AnalyticsEventType.DEVICE_CONNECTED]
      });
      expect(analyticsEvents).toHaveLength(1);
      expect(analyticsEvents[0]).toMatchObject({
        deviceId,
        userId: 'user1',
        sessionId: 'session1'
      });

      const metricValues = metrics.getMetricValues('device.connections');
      expect(metricValues).toHaveLength(1);
      expect(metricValues[0].tags.device_id).toBe(deviceId);
    });

    it('should track command execution', () => {
      const startTime = Date.now();
      monitor.onCommandStart('TEST_CMD');

      let queueSize = metrics.getMetricValues('command_queue_size');
      expect(queueSize).toHaveLength(1);
      expect(queueSize[0].value).toBe(1);

      const error = new Error('Command failed');
      monitor.onCommandComplete('TEST_CMD', 100, false, error);

      const analyticsEvents = analytics.queryEvents({
        types: [AnalyticsEventType.COMMAND_FAILED]
      });
      expect(analyticsEvents).toHaveLength(1);
      expect(analyticsEvents[0]).toMatchObject({
        deviceId,
        data: { commandType: 'TEST_CMD' },
        duration: 100,
        error
      });

      // Queue size should be decremented
      queueSize = metrics.getMetricValues('command_queue_size');
      expect(queueSize[queueSize.length - 1].value).toBe(0);

      // Error metrics should be recorded
      const errors = metrics.getMetricValues('device.errors');
      expect(errors).toHaveLength(1);
      expect(errors[0].tags.device_id).toBe(deviceId);
      expect(errors[0].tags.error_type).toBe('Error');
    });

    it('should track pattern usage', () => {
      monitor.onPatternUsage('pattern1', 'start', { intensity: 100 });

      const analyticsEvents = analytics.queryEvents({
        types: [AnalyticsEventType.PATTERN_STARTED]
      });
      expect(analyticsEvents).toHaveLength(1);
      expect(analyticsEvents[0]).toMatchObject({
        deviceId,
        data: {
          patternId: 'pattern1',
          intensity: 100
        }
      });
    });

    it('should track state changes', () => {
      monitor.onStateChange('power', false, true, { source: 'user' });

      const analyticsEvents = analytics.queryEvents({
        types: [AnalyticsEventType.STATE_CHANGED]
      });
      expect(analyticsEvents).toHaveLength(1);
      expect(analyticsEvents[0]).toMatchObject({
        deviceId,
        data: {
          stateKey: 'power',
          oldValue: false,
          newValue: true
        },
        metadata: { source: 'user' }
      });
    });

    it('should track feature usage', () => {
      monitor.onFeatureUsed('test-feature', 'user1', 'session1');

      const analyticsEvents = analytics.queryEvents({
        types: [AnalyticsEventType.FEATURE_USED]
      });
      expect(analyticsEvents).toHaveLength(1);
      expect(analyticsEvents[0]).toMatchObject({
        deviceId,
        data: { feature: 'test-feature' },
        userId: 'user1',
        sessionId: 'session1'
      });
    });

    it('should record custom performance metrics', () => {
      monitor.recordPerformanceMetric('custom.metric', 42, { tag: 'value' });

      const metricValues = metrics.getMetricValues('custom.metric');
      expect(metricValues).toHaveLength(1);
      expect(metricValues[0]).toMatchObject({
        value: 42,
        tags: {
          device_id: deviceId,
          tag: 'value'
        }
      });
    });

    it('should retrieve device stats', () => {
      monitor.onConnect();
      monitor.onCommandComplete('TEST_CMD', 100, true);
      monitor.onFeatureUsed('test-feature');

      const stats = monitor.getDeviceStats();
      expect(stats).toBeDefined();
      expect(stats).toMatchObject({
        deviceId,
        totalConnections: 1,
        totalCommandsSent: 1
      });
    });
  });

  describe('SessionMonitoring', () => {
    const sessionId = 'test-session';
    const userId = 'test-user';
    let monitor: SessionMonitoring;

    beforeEach(() => {
      monitor = new SessionMonitoring(sessionId, userId);
    });

    it('should track session lifecycle', () => {
      monitor.start();

      let events = analytics.queryEvents({
        types: [AnalyticsEventType.SESSION_STARTED]
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        sessionId,
        userId
      });

      monitor.end();

      events = analytics.queryEvents({
        types: [AnalyticsEventType.SESSION_ENDED]
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        sessionId,
        userId
      });
      expect(events[0].duration).toBeGreaterThan(0);
    });

    it('should track session-specific feature usage', () => {
      const deviceId = 'test-device';
      monitor.onFeatureUsed('test-feature', deviceId);

      const events = analytics.queryEvents({
        types: [AnalyticsEventType.FEATURE_USED]
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        sessionId,
        userId,
        deviceId,
        data: { feature: 'test-feature' }
      });
    });

    it('should track session-specific errors', () => {
      const error = new Error('Test error');
      const context = { operation: 'test' };
      const deviceId = 'test-device';

      monitor.onError(error, context, deviceId);

      const analyticsEvents = analytics.queryEvents({
        types: [AnalyticsEventType.ERROR_OCCURRED]
      });
      expect(analyticsEvents).toHaveLength(1);
      expect(analyticsEvents[0]).toMatchObject({
        sessionId,
        userId,
        deviceId,
        error,
        data: context
      });

      const metricValues = metrics.getMetricValues('error.count');
      expect(metricValues).toHaveLength(1);
      expect(metricValues[0].tags.device_id).toBe(deviceId);
      expect(metricValues[0].tags.error_type).toBe('Error');
    });
  });

  describe('Shutdown', () => {
    it('should cleanup resources', async () => {
      const deviceMonitor = new DeviceMonitoring('test-device');
      deviceMonitor.onConnect();

      const sessionMonitor = new SessionMonitoring('test-session');
      sessionMonitor.start();

      await shutdownMonitoring();

      // Verify collectors are disposed
      expect(() => metrics.getMetricValues('device.connections')).toThrow();
      expect(analytics.queryEvents()).toHaveLength(0);
    });
  });
});
