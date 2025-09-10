import { AnalyticsCollector, AnalyticsEventType } from '../AnalyticsCollector';

describe('AnalyticsCollector', () => {
  let collector: AnalyticsCollector;

  beforeEach(() => {
    collector = AnalyticsCollector.getInstance();
  });

  afterEach(() => {
    collector.dispose();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = AnalyticsCollector.getInstance();
      const instance2 = AnalyticsCollector.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Event Tracking', () => {
    const mockDevice = {
      id: 'device1',
      info: {
        id: 'device1',
        name: 'Test Device',
        type: 'test'
      }
    };

    it('should track device connection events', () => {
      collector.trackDeviceConnection(mockDevice, 'user1', 'session1');
      
      const events = collector.queryEvents({
        types: [AnalyticsEventType.DEVICE_CONNECTED],
        deviceIds: ['device1']
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: AnalyticsEventType.DEVICE_CONNECTED,
        deviceId: 'device1',
        userId: 'user1',
        sessionId: 'session1',
        data: {
          deviceInfo: mockDevice.info
        }
      });

      const stats = collector.getDeviceStats('device1');
      expect(stats?.totalConnections).toBe(1);
    });

    it('should track device disconnection events', () => {
      collector.trackDeviceDisconnection('device1', 'user1', 'session1');
      
      const events = collector.queryEvents({
        types: [AnalyticsEventType.DEVICE_DISCONNECTED]
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: AnalyticsEventType.DEVICE_DISCONNECTED,
        deviceId: 'device1',
        userId: 'user1',
        sessionId: 'session1'
      });
    });

    it('should track command execution events', () => {
      const error = new Error('Command failed');
      
      collector.trackCommandExecution('device1', 'TEST_CMD', false, 100, error, {
        context: 'test'
      });

      const events = collector.queryEvents({
        types: [AnalyticsEventType.COMMAND_FAILED]
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: AnalyticsEventType.COMMAND_FAILED,
        deviceId: 'device1',
        data: { commandType: 'TEST_CMD' },
        duration: 100,
        success: false,
        error,
        metadata: { context: 'test' }
      });

      const stats = collector.getDeviceStats('device1');
      expect(stats?.totalCommandsSent).toBe(1);
      expect(stats?.totalCommandsFailed).toBe(1);
      expect(stats?.errorRates['Error']).toBe(1);
    });

    it('should track pattern usage events', () => {
      collector.trackPatternUsage('device1', 'pattern1', 'start', {
        intensity: 100
      });

      const events = collector.queryEvents({
        types: [AnalyticsEventType.PATTERN_STARTED]
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: AnalyticsEventType.PATTERN_STARTED,
        deviceId: 'device1',
        data: {
          patternId: 'pattern1',
          intensity: 100
        }
      });

      const stats = collector.getDeviceStats('device1');
      expect(stats?.totalPatternRuns).toBe(1);
    });

    it('should track session lifecycle', () => {
      collector.startSession('session1', 'user1');
      
      let events = collector.queryEvents({
        types: [AnalyticsEventType.SESSION_STARTED]
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: AnalyticsEventType.SESSION_STARTED,
        sessionId: 'session1',
        userId: 'user1'
      });

      // Add some device events to the session
      collector.trackDeviceConnection(mockDevice, 'user1', 'session1');
      
      // End the session
      collector.endSession('session1', 'user1');

      events = collector.queryEvents({
        types: [AnalyticsEventType.SESSION_ENDED]
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: AnalyticsEventType.SESSION_ENDED,
        sessionId: 'session1',
        userId: 'user1'
      });
      expect(events[0].duration).toBeGreaterThan(0);

      // Check device stats were updated
      const stats = collector.getDeviceStats('device1');
      expect(stats?.totalSessionTime).toBeGreaterThan(0);
      expect(stats?.averageSessionDuration).toBeGreaterThan(0);
    });

    it('should track errors with context', () => {
      const error = new Error('Test error');
      const context = { operation: 'test' };

      collector.trackError(error, context, 'device1', 'user1', 'session1');

      const events = collector.queryEvents({
        types: [AnalyticsEventType.ERROR_OCCURRED]
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: AnalyticsEventType.ERROR_OCCURRED,
        deviceId: 'device1',
        userId: 'user1',
        sessionId: 'session1',
        error,
        data: context
      });

      const stats = collector.getDeviceStats('device1');
      expect(stats?.errorRates['Error']).toBe(1);
    });

    it('should track state changes', () => {
      collector.trackStateChange(
        'device1',
        'power',
        'off',
        'on',
        { trigger: 'user' }
      );

      const events = collector.queryEvents({
        types: [AnalyticsEventType.STATE_CHANGED]
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: AnalyticsEventType.STATE_CHANGED,
        deviceId: 'device1',
        data: {
          stateKey: 'power',
          oldValue: 'off',
          newValue: 'on'
        },
        metadata: { trigger: 'user' }
      });
    });

    it('should track feature usage and maintain top features', () => {
      // Track multiple uses of different features
      for (let i = 0; i < 3; i++) {
        collector.trackFeatureUsage('feature1', 'device1');
      }
      for (let i = 0; i < 2; i++) {
        collector.trackFeatureUsage('feature2', 'device1');
      }
      collector.trackFeatureUsage('feature3', 'device1');

      const events = collector.queryEvents({
        types: [AnalyticsEventType.FEATURE_USED]
      });

      expect(events).toHaveLength(6);

      const stats = collector.getDeviceStats('device1');
      expect(stats?.topFeatures).toEqual([
        { feature: 'feature1', count: 3 },
        { feature: 'feature2', count: 2 },
        { feature: 'feature3', count: 1 }
      ]);
    });
  });

  describe('Event Querying', () => {
    beforeEach(() => {
      // Add some test events
      collector.trackDeviceConnection(
        { id: 'device1', info: { id: 'device1', name: 'Test Device', type: 'test' } },
        'user1',
        'session1'
      );
      collector.trackDeviceConnection(
        { id: 'device2', info: { id: 'device2', name: 'Test Device 2', type: 'test' } },
        'user2',
        'session2'
      );
      collector.trackCommandExecution('device1', 'TEST_CMD', true, 100);
      collector.trackCommandExecution('device2', 'TEST_CMD', false, 200, new Error('Failed'));
    });

    it('should filter events by type', () => {
      const events = collector.queryEvents({
        types: [AnalyticsEventType.DEVICE_CONNECTED]
      });
      expect(events).toHaveLength(2);
    });

    it('should filter events by device ID', () => {
      const events = collector.queryEvents({
        deviceIds: ['device1']
      });
      expect(events).toHaveLength(2);
    });

    it('should filter events by user ID', () => {
      const events = collector.queryEvents({
        userIds: ['user1']
      });
      expect(events).toHaveLength(1);
    });

    it('should filter events by session ID', () => {
      const events = collector.queryEvents({
        sessionIds: ['session2']
      });
      expect(events).toHaveLength(1);
    });

    it('should filter events by time range', () => {
      const now = Date.now();
      const events = collector.queryEvents({
        startTime: now - 1000,
        endTime: now
      });
      expect(events.length).toBeGreaterThan(0);
    });

    it('should limit returned events', () => {
      const events = collector.queryEvents({
        limit: 2
      });
      expect(events).toHaveLength(2);
    });
  });

  describe('Device Statistics', () => {
    beforeEach(() => {
      collector.trackDeviceConnection(
        { id: 'device1', info: { id: 'device1', name: 'Test Device', type: 'test' } }
      );
      collector.trackCommandExecution('device1', 'TEST_CMD', true, 100);
      collector.trackCommandExecution('device1', 'TEST_CMD', false, 200, new Error('Failed'));
      collector.trackPatternUsage('device1', 'pattern1', 'start');
    });

    it('should maintain accurate device statistics', () => {
      const stats = collector.getDeviceStats('device1');
      expect(stats).toBeDefined();
      expect(stats).toMatchObject({
        deviceId: 'device1',
        totalConnections: 1,
        totalCommandsSent: 2,
        totalCommandsFailed: 1,
        totalPatternRuns: 1
      });
      expect(stats?.errorRates['Error']).toBe(1);
    });

    it('should return all device statistics', () => {
      collector.trackDeviceConnection(
        { id: 'device2', info: { id: 'device2', name: 'Test Device 2', type: 'test' } }
      );
      
      const allStats = collector.getAllDeviceStats();
      expect(allStats).toHaveLength(2);
    });
  });

  describe('Analytics Snapshot', () => {
    beforeEach(() => {
      const now = Date.now();
      // Add events at different times
      collector.trackDeviceConnection(
        { id: 'device1', info: { id: 'device1', name: 'Test Device', type: 'test' } }
      );
      collector.trackCommandExecution('device1', 'TEST_CMD', true, 100);
    });

    it('should create snapshot with all events', () => {
      const snapshot = collector.getSnapshot();
      expect(snapshot.events).toHaveLength(2);
      expect(snapshot.deviceStats).toBeDefined();
      expect(snapshot.period).toBeDefined();
    });

    it('should create snapshot with time range', () => {
      const now = Date.now();
      const snapshot = collector.getSnapshot(now - 1000, now);
      expect(snapshot.events.length).toBeGreaterThan(0);
      expect(snapshot.period.start).toBe(now - 1000);
      expect(snapshot.period.end).toBe(now);
    });
  });

  describe('Event Retention and Cleanup', () => {
    beforeEach(() => {
      collector.setRetentionPeriod(1/24/60); // 1 minute retention for testing
    });

    it('should clean up old events', async () => {
      collector.trackDeviceConnection(
        { id: 'device1', info: { id: 'device1', name: 'Test Device', type: 'test' } }
      );

      await new Promise(resolve => setTimeout(resolve, 2000));
      
      collector.trackCommandExecution('device1', 'TEST_CMD', true, 100);
      
      // Force cleanup
      collector['cleanupOldEvents']();

      const events = collector.queryEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(AnalyticsEventType.COMMAND_COMPLETED);
    });

    it('should clean up old device stats', async () => {
      collector.trackDeviceConnection(
        { id: 'device1', info: { id: 'device1', name: 'Test Device', type: 'test' } }
      );

      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force cleanup
      collector['cleanupOldEvents']();

      const stats = collector.getDeviceStats('device1');
      expect(stats).toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    it('should emit tracked events', () => {
      const listener = jest.fn();
      collector.on('eventTracked', listener);

      collector.trackDeviceConnection(
        { id: 'device1', info: { id: 'device1', name: 'Test Device', type: 'test' } }
      );

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toMatchObject({
        type: AnalyticsEventType.DEVICE_CONNECTED,
        deviceId: 'device1'
      });
    });

    it('should emit flush events', async () => {
      const listener = jest.fn();
      collector.on('flush', listener);

      collector.trackDeviceConnection(
        { id: 'device1', info: { id: 'device1', name: 'Test Device', type: 'test' } }
      );

      // Trigger a flush
      await collector['flush']();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toMatchObject({
        events: expect.any(Array),
        deviceStats: expect.any(Object),
        period: expect.any(Object)
      });
    });
  });
});
