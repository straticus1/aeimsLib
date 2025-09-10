import { MetricsCollector, MetricType, MetricCategory } from '../MetricsCollector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = MetricsCollector.getInstance();
  });

  afterEach(() => {
    collector.dispose();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = MetricsCollector.getInstance();
      const instance2 = MetricsCollector.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Metric Registration', () => {
    it('should register a new metric', () => {
      const config = {
        name: 'test_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.DEVICE,
        description: 'Test metric'
      };

      collector.registerMetric(config);
      const registeredConfig = collector.getMetricConfig('test_metric');
      expect(registeredConfig).toEqual({
        ...config,
        retentionPeriod: 24 * 60 * 60 * 1000
      });
    });

    it('should throw error when registering duplicate metric', () => {
      const config = {
        name: 'test_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.DEVICE,
        description: 'Test metric'
      };

      collector.registerMetric(config);
      expect(() => collector.registerMetric(config)).toThrow();
    });
  });

  describe('Recording Metrics', () => {
    beforeEach(() => {
      collector.registerMetric({
        name: 'counter_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.DEVICE,
        description: 'Test counter'
      });

      collector.registerMetric({
        name: 'gauge_metric',
        type: MetricType.GAUGE,
        category: MetricCategory.PERFORMANCE,
        description: 'Test gauge'
      });

      collector.registerMetric({
        name: 'histogram_metric',
        type: MetricType.HISTOGRAM,
        category: MetricCategory.DEVICE,
        description: 'Test histogram',
        buckets: [10, 20, 50, 100]
      });
    });

    it('should record counter metrics', () => {
      collector.recordMetric('counter_metric', 1);
      collector.recordMetric('counter_metric', 2);
      
      const values = collector.getMetricValues('counter_metric');
      expect(values).toHaveLength(2);
      expect(values[0].value).toBe(1);
      expect(values[1].value).toBe(2);
    });

    it('should record gauge metrics', () => {
      collector.recordMetric('gauge_metric', 50);
      collector.recordMetric('gauge_metric', 75);
      
      const values = collector.getMetricValues('gauge_metric');
      expect(values).toHaveLength(2);
      expect(values[1].value).toBe(75);
    });

    it('should record histogram metrics', () => {
      collector.recordMetric('histogram_metric', 15);
      collector.recordMetric('histogram_metric', 45);
      collector.recordMetric('histogram_metric', 95);
      
      const values = collector.getMetricValues('histogram_metric');
      expect(values).toHaveLength(3);
      
      const summary = collector.getMetrics({ name: 'histogram_metric' })['histogram_metric'];
      expect(summary.p50).toBe(45);
      expect(summary.p90).toBeCloseTo(95);
    });

    it('should throw error for unregistered metrics', () => {
      expect(() => collector.recordMetric('unknown_metric', 1)).toThrow();
    });

    it('should validate metric values', () => {
      expect(() => collector.recordMetric('counter_metric', -1)).toThrow();
      expect(() => collector.recordMetric('histogram_metric', 200)).toThrow();
    });

    it('should support metric tags', () => {
      collector.recordMetric('counter_metric', 1, { device: 'dev1' });
      collector.recordMetric('counter_metric', 2, { device: 'dev2' });
      
      const values = collector.getMetricValues('counter_metric', {
        tags: { device: 'dev1' }
      });
      
      expect(values).toHaveLength(1);
      expect(values[0].value).toBe(1);
      expect(values[0].tags.device).toBe('dev1');
    });
  });

  describe('Querying Metrics', () => {
    beforeEach(() => {
      collector.registerMetric({
        name: 'test_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.DEVICE,
        description: 'Test metric'
      });

      for (let i = 1; i <= 5; i++) {
        collector.recordMetric('test_metric', i, { group: i <= 3 ? 'A' : 'B' });
      }
    });

    it('should filter metrics by time range', () => {
      const now = Date.now();
      const startTime = now - 1000;
      const endTime = now + 1000;
      
      const values = collector.getMetricValues('test_metric', { startTime, endTime });
      expect(values).toHaveLength(5);
    });

    it('should filter metrics by tags', () => {
      const valuesA = collector.getMetricValues('test_metric', {
        tags: { group: 'A' }
      });
      expect(valuesA).toHaveLength(3);

      const valuesB = collector.getMetricValues('test_metric', {
        tags: { group: 'B' }
      });
      expect(valuesB).toHaveLength(2);
    });

    it('should calculate metric summaries', () => {
      const summary = collector.getMetrics({ name: 'test_metric' })['test_metric'];
      
      expect(summary.count).toBe(5);
      expect(summary.sum).toBe(15);
      expect(summary.min).toBe(1);
      expect(summary.max).toBe(5);
      expect(summary.avg).toBe(3);
    });

    it('should limit returned values', () => {
      const values = collector.getMetricValues('test_metric', { limit: 3 });
      expect(values).toHaveLength(3);
      expect(values[2].value).toBe(5);
    });
  });

  describe('Standard Metrics', () => {
    beforeEach(() => {
      collector.registerStandardMetrics();
    });

    it('should register device metrics', () => {
      expect(collector.getMetricConfig('device.connections')).toBeDefined();
      expect(collector.getMetricConfig('device.commands')).toBeDefined();
      expect(collector.getMetricConfig('device.errors')).toBeDefined();
      expect(collector.getMetricConfig('device.latency')).toBeDefined();
    });

    it('should register protocol metrics', () => {
      expect(collector.getMetricConfig('protocol.messages')).toBeDefined();
      expect(collector.getMetricConfig('protocol.errors')).toBeDefined();
    });

    it('should register performance metrics', () => {
      expect(collector.getMetricConfig('performance.memory')).toBeDefined();
      expect(collector.getMetricConfig('performance.cpu')).toBeDefined();
      expect(collector.getMetricConfig('performance.command_queue')).toBeDefined();
    });

    it('should register security metrics', () => {
      expect(collector.getMetricConfig('security.auth_failures')).toBeDefined();
      expect(collector.getMetricConfig('security.rate_limits')).toBeDefined();
    });
  });

  describe('Cleanup and Disposal', () => {
    beforeEach(() => {
      collector.registerMetric({
        name: 'test_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.DEVICE,
        description: 'Test metric',
        retentionPeriod: 100 // 100ms for testing
      });
    });

    it('should clean up old metrics', async () => {
      collector.recordMetric('test_metric', 1);
      await new Promise(resolve => setTimeout(resolve, 150));
      collector.recordMetric('test_metric', 2);
      
      const values = collector.getMetricValues('test_metric');
      expect(values).toHaveLength(1);
      expect(values[0].value).toBe(2);
    });

    it('should clear metrics on dispose', () => {
      collector.recordMetric('test_metric', 1);
      collector.dispose();
      
      const newCollector = MetricsCollector.getInstance();
      expect(() => newCollector.getMetricValues('test_metric')).toThrow();
    });
  });

  describe('Event Emission', () => {
    it('should emit metric events', () => {
      const listener = jest.fn();
      collector.on('metric', listener);

      collector.registerMetric({
        name: 'test_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.DEVICE,
        description: 'Test metric'
      });

      collector.recordMetric('test_metric', 1);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toMatchObject({
        name: 'test_metric',
        value: {
          value: 1
        }
      });
    });

    it('should emit cleanup events', async () => {
      const listener = jest.fn();
      collector.on('cleanup', listener);

      collector.registerMetric({
        name: 'test_metric',
        type: MetricType.COUNTER,
        category: MetricCategory.DEVICE,
        description: 'Test metric',
        retentionPeriod: 100
      });

      collector.recordMetric('test_metric', 1);
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0]).toMatchObject({
        metrics: ['test_metric']
      });
    });
  });
});
