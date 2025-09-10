import { Router } from 'express';
import {
  MetricsCollector,
  AnalyticsCollector,
  MetricType,
  MetricCategory
} from '../index';

const router = Router();

/**
 * Metrics Endpoints
 */

// Get all metrics
router.get('/metrics', (req, res) => {
  const metrics = MetricsCollector.getInstance();
  const {
    category,
    type,
    startTime,
    endTime,
    tags
  } = req.query;

  const query: any = {};
  if (category) query.category = category;
  if (type) query.type = type;
  if (startTime) query.startTime = parseInt(startTime as string);
  if (endTime) query.endTime = parseInt(endTime as string);
  if (tags) query.tags = JSON.parse(tags as string);

  const results = metrics.getMetrics(query);
  res.json(results);
});

// Get specific metric by name
router.get('/metrics/:name', (req, res) => {
  const metrics = MetricsCollector.getInstance();
  const { name } = req.params;
  const {
    startTime,
    endTime,
    tags,
    limit
  } = req.query;

  const query: any = {};
  if (startTime) query.startTime = parseInt(startTime as string);
  if (endTime) query.endTime = parseInt(endTime as string);
  if (tags) query.tags = JSON.parse(tags as string);
  if (limit) query.limit = parseInt(limit as string);

  try {
    const values = metrics.getMetricValues(name, query);
    const config = metrics.getMetricConfig(name);
    res.json({
      name,
      config,
      values
    });
  } catch (error) {
    res.status(404).json({
      error: `Metric '${name}' not found`
    });
  }
});

// Get metrics summary
router.get('/metrics/summary', (req, res) => {
  const metrics = MetricsCollector.getInstance();
  const {
    startTime = Date.now() - 3600000, // Last hour by default
    endTime = Date.now()
  } = req.query;

  const results = metrics.getMetrics({
    startTime: parseInt(startTime as string),
    endTime: parseInt(endTime as string)
  });

  // Add metric metadata
  const summary = Object.entries(results).reduce((acc, [name, data]) => {
    const config = metrics.getMetricConfig(name);
    acc[name] = {
      ...data,
      config
    };
    return acc;
  }, {} as Record<string, any>);

  res.json(summary);
});

/**
 * Analytics Endpoints
 */

// Get analytics events
router.get('/analytics/events', (req, res) => {
  const analytics = AnalyticsCollector.getInstance();
  const {
    types,
    deviceIds,
    userIds,
    sessionIds,
    startTime,
    endTime,
    limit
  } = req.query;

  const filter: any = {};
  if (types) filter.types = (types as string).split(',');
  if (deviceIds) filter.deviceIds = (deviceIds as string).split(',');
  if (userIds) filter.userIds = (userIds as string).split(',');
  if (sessionIds) filter.sessionIds = (sessionIds as string).split(',');
  if (startTime) filter.startTime = parseInt(startTime as string);
  if (endTime) filter.endTime = parseInt(endTime as string);
  if (limit) filter.limit = parseInt(limit as string);

  const events = analytics.queryEvents(filter);
  res.json(events);
});

// Get device statistics
router.get('/analytics/devices/:deviceId/stats', (req, res) => {
  const analytics = AnalyticsCollector.getInstance();
  const { deviceId } = req.params;

  const stats = analytics.getDeviceStats(deviceId);
  if (!stats) {
    res.status(404).json({
      error: `No statistics found for device '${deviceId}'`
    });
    return;
  }

  res.json(stats);
});

// Get all device statistics
router.get('/analytics/devices/stats', (req, res) => {
  const analytics = AnalyticsCollector.getInstance();
  const stats = analytics.getAllDeviceStats();
  res.json(stats);
});

// Get session events
router.get('/analytics/sessions/:sessionId', (req, res) => {
  const analytics = AnalyticsCollector.getInstance();
  const { sessionId } = req.params;

  const events = analytics.queryEvents({
    sessionIds: [sessionId]
  });

  if (events.length === 0) {
    res.status(404).json({
      error: `No events found for session '${sessionId}'`
    });
    return;
  }

  // Get session duration if session has ended
  const sessionStart = events.find(e => e.type === 'session_started');
  const sessionEnd = events.find(e => e.type === 'session_ended');
  const duration = sessionEnd && sessionStart
    ? sessionEnd.timestamp - sessionStart.timestamp
    : undefined;

  res.json({
    sessionId,
    events,
    duration,
    isActive: !sessionEnd && !!sessionStart
  });
});

// Get analytics snapshot
router.get('/analytics/snapshot', (req, res) => {
  const analytics = AnalyticsCollector.getInstance();
  const {
    startTime,
    endTime = Date.now()
  } = req.query;

  const snapshot = analytics.getSnapshot(
    startTime ? parseInt(startTime as string) : undefined,
    parseInt(endTime as string)
  );

  res.json(snapshot);
});

export default router;
