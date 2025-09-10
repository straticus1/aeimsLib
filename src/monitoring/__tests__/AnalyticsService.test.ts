import { AnalyticsService, DeviceMetrics, SessionMetrics } from '../AnalyticsService';
import { DeviceEvent, DeviceEventType } from '../../interfaces/device';

describe('AnalyticsService', () => {
  let analytics: AnalyticsService;

  beforeEach(() => {
    analytics = AnalyticsService.getInstance();
  });

  test('should be a singleton', () => {
    const instance1 = AnalyticsService.getInstance();
    const instance2 = AnalyticsService.getInstance();
    expect(instance1).toBe(instance2);
  });

  describe('Device Metrics', () => {
    const deviceId = 'test_device_1';

    test('should track device connections', () => {
      const connectEvent: DeviceEvent = {
        type: DeviceEventType.CONNECTED,
        deviceId,
        timestamp: new Date()
      };

      analytics.trackDeviceMetrics(deviceId, connectEvent);
      const metrics = analytics.getDeviceMetrics(deviceId);

      expect(metrics).toBeDefined();
      expect(metrics?.connectionDuration).toBe(0);
      expect(metrics?.errorCount).toBe(0);
    });

    test('should track device commands', () => {
      const commandEvent: DeviceEvent = {
        type: DeviceEventType.COMMAND_RECEIVED,
        deviceId,
        timestamp: new Date(),
        data: { type: 'vibrate', intensity: 50 }
      };

      analytics.trackDeviceMetrics(deviceId, commandEvent);
      const metrics = analytics.getDeviceMetrics(deviceId);

      expect(metrics?.commandCount).toBe(1);
    });

    test('should track device errors', () => {
      const errorEvent: DeviceEvent = {
        type: DeviceEventType.ERROR,
        deviceId,
        timestamp: new Date(),
        data: { message: 'Test error' }
      };

      analytics.trackDeviceMetrics(deviceId, errorEvent);
      const metrics = analytics.getDeviceMetrics(deviceId);

      expect(metrics?.errorCount).toBe(1);
    });

    test('should calculate connection duration', async () => {
      const connectEvent: DeviceEvent = {
        type: DeviceEventType.CONNECTED,
        deviceId,
        timestamp: new Date()
      };

      analytics.trackDeviceMetrics(deviceId, connectEvent);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));

      const disconnectEvent: DeviceEvent = {
        type: DeviceEventType.DISCONNECTED,
        deviceId,
        timestamp: new Date()
      };

      analytics.trackDeviceMetrics(deviceId, disconnectEvent);
      const metrics = analytics.getDeviceMetrics(deviceId);

      expect(metrics?.connectionDuration).toBeGreaterThan(900); // Allow for small timing variations
    });
  });

  describe('Session Tracking', () => {
    const sessionId = 'test_session_1';
    const userId = 'test_user_1';
    const deviceId = 'test_device_1';

    test('should create and track sessions', () => {
      analytics.startSession(sessionId, userId, deviceId);
      const session = analytics.getSessionMetrics(sessionId);

      expect(session).toBeDefined();
      expect(session?.userId).toBe(userId);
      expect(session?.deviceId).toBe(deviceId);
      expect(session?.endTime).toBeUndefined();
    });

    test('should properly end sessions', async () => {
      analytics.startSession(sessionId, userId, deviceId);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      analytics.endSession(sessionId);
      const session = analytics.getSessionMetrics(sessionId);

      expect(session?.endTime).toBeDefined();
      expect(session?.duration).toBeGreaterThan(900); // Allow for small timing variations
    });

    test('should retrieve user sessions', () => {
      analytics.startSession('session1', userId, deviceId);
      analytics.startSession('session2', userId, 'other_device');
      analytics.startSession('session3', 'other_user', deviceId);

      const userSessions = analytics.getUserSessions(userId);
      expect(userSessions.length).toBe(2);
      expect(userSessions.every(s => s.userId === userId)).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    test('should collect performance metrics', async () => {
      // Wait for first metrics collection
      await new Promise(resolve => setTimeout(resolve, 5500));

      const metrics = analytics.getPerformanceMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      
      const latest = metrics[metrics.length - 1];
      expect(latest.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(latest.memoryUsage).toBeGreaterThan(0);
    });

    test('should filter metrics by time range', async () => {
      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 5500));

      const start = new Date(Date.now() - 5000);
      const end = new Date();

      const metrics = analytics.getPerformanceMetrics({ start, end });
      expect(metrics.every(m => 
        m.timestamp >= start && m.timestamp <= end
      )).toBe(true);
    });
  });

  describe('Data Cleanup', () => {
    test('should clean up old data', () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
      
      // Add some old metrics
      const oldMetrics: DeviceMetrics = {
        deviceId: 'old_device',
        connectionDuration: 1000,
        commandCount: 10,
        errorCount: 1,
        averageLatency: 50,
        batteryDrain: 20,
        lastSync: oldDate
      };

      analytics['metrics'].set('old_device', oldMetrics);

      // Add some old sessions
      const oldSession: SessionMetrics = {
        sessionId: 'old_session',
        userId: 'test_user',
        deviceId: 'old_device',
        startTime: oldDate,
        endTime: new Date(oldDate.getTime() + 3600000),
        duration: 3600000,
        commandCount: 10,
        errorCount: 1,
        patterns: ['test'],
        maxIntensity: 80,
        averageIntensity: 50
      };

      analytics['sessions'].set('old_session', oldSession);

      // Clean up with 30-day retention
      analytics.cleanupOldData(30 * 24 * 60 * 60 * 1000);

      expect(analytics['metrics'].has('old_device')).toBe(false);
      expect(analytics['sessions'].has('old_session')).toBe(false);
    });
  });
});
