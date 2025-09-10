import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';
import { Device } from '../interfaces/device';

export enum AnalyticsEventType {
  DEVICE_CONNECTED = 'device_connected',
  DEVICE_DISCONNECTED = 'device_disconnected',
  COMMAND_SENT = 'command_sent',
  COMMAND_COMPLETED = 'command_completed',
  COMMAND_FAILED = 'command_failed',
  PATTERN_STARTED = 'pattern_started',
  PATTERN_STOPPED = 'pattern_stopped',
  PATTERN_MODIFIED = 'pattern_modified',
  SESSION_STARTED = 'session_started',
  SESSION_ENDED = 'session_ended',
  ERROR_OCCURRED = 'error_occurred',
  STATE_CHANGED = 'state_changed',
  FEATURE_USED = 'feature_used'
}

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: number;
  deviceId?: string;
  userId?: string;
  sessionId?: string;
  data?: Record<string, any>;
  duration?: number;
  success?: boolean;
  error?: Error;
  metadata?: Record<string, string>;
}

export interface DeviceUsageStats {
  deviceId: string;
  totalConnections: number;
  totalCommandsSent: number;
  totalCommandsFailed: number;
  totalPatternRuns: number;
  totalSessionTime: number;
  averageSessionDuration: number;
  lastSeen: number;
  topFeatures: Array<{ feature: string; count: number }>;
  errorRates: Record<string, number>;
}

export interface AnalyticsSnapshot {
  events: AnalyticsEvent[];
  deviceStats: Record<string, DeviceUsageStats>;
  period: {
    start: number;
    end: number;
  };
}

export interface EventFilter {
  types?: AnalyticsEventType[];
  deviceIds?: string[];
  userIds?: string[];
  sessionIds?: string[];
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export class AnalyticsCollector extends EventEmitter {
  private static instance: AnalyticsCollector;
  private events: AnalyticsEvent[] = [];
  private deviceStats: Map<string, DeviceUsageStats> = new Map();
  private activeSessions: Map<string, number> = new Map(); // sessionId -> startTime
  private logger: Logger;
  private retentionPeriodMs: number = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly maxEventsPerDevice = 1000;
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly defaultFlushIntervalMs = 300000; // 5 minutes

  private constructor() {
    super();
    this.logger = Logger.getInstance();
    this.startPeriodicFlush();
  }

  static getInstance(): AnalyticsCollector {
    if (!AnalyticsCollector.instance) {
      AnalyticsCollector.instance = new AnalyticsCollector();
    }
    return AnalyticsCollector.instance;
  }

  trackEvent(event: AnalyticsEvent): void {
    try {
      // Set timestamp if not provided
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }

      this.events.push(event);
      this.updateDeviceStats(event);
      this.emit('eventTracked', event);

      // Clean up old events periodically
      if (this.events.length % 100 === 0) {
        this.cleanupOldEvents();
      }
    } catch (error) {
      this.logger.error('Error tracking analytics event', {
        error,
        event
      });
    }
  }

  trackDeviceConnection(device: Device, userId?: string, sessionId?: string): void {
    this.trackEvent({
      type: AnalyticsEventType.DEVICE_CONNECTED,
      timestamp: Date.now(),
      deviceId: device.id,
      userId,
      sessionId,
      data: {
        deviceInfo: device.info
      }
    });

    const stats = this.getOrCreateDeviceStats(device.id);
    stats.totalConnections++;
    stats.lastSeen = Date.now();
  }

  trackDeviceDisconnection(deviceId: string, userId?: string, sessionId?: string): void {
    this.trackEvent({
      type: AnalyticsEventType.DEVICE_DISCONNECTED,
      timestamp: Date.now(),
      deviceId,
      userId,
      sessionId
    });
  }

  trackCommandExecution(
    deviceId: string,
    commandType: string,
    success: boolean,
    duration: number,
    error?: Error,
    metadata?: Record<string, string>
  ): void {
    const eventType = success
      ? AnalyticsEventType.COMMAND_COMPLETED
      : AnalyticsEventType.COMMAND_FAILED;

    this.trackEvent({
      type: eventType,
      timestamp: Date.now(),
      deviceId,
      data: { commandType },
      duration,
      success,
      error,
      metadata
    });

    const stats = this.getOrCreateDeviceStats(deviceId);
    stats.totalCommandsSent++;
    if (!success) {
      stats.totalCommandsFailed++;
      const errorType = error?.name || 'UnknownError';
      stats.errorRates[errorType] = (stats.errorRates[errorType] || 0) + 1;
    }
  }

  trackPatternUsage(
    deviceId: string,
    patternId: string,
    action: 'start' | 'stop' | 'modify',
    params?: Record<string, any>,
    metadata?: Record<string, string>
  ): void {
    let eventType: AnalyticsEventType;
    switch (action) {
      case 'start':
        eventType = AnalyticsEventType.PATTERN_STARTED;
        break;
      case 'stop':
        eventType = AnalyticsEventType.PATTERN_STOPPED;
        break;
      case 'modify':
        eventType = AnalyticsEventType.PATTERN_MODIFIED;
        break;
    }

    this.trackEvent({
      type: eventType,
      timestamp: Date.now(),
      deviceId,
      data: {
        patternId,
        ...params
      },
      metadata
    });

    const stats = this.getOrCreateDeviceStats(deviceId);
    if (action === 'start') {
      stats.totalPatternRuns++;
    }
  }

  startSession(sessionId: string, userId?: string): void {
    this.activeSessions.set(sessionId, Date.now());
    
    this.trackEvent({
      type: AnalyticsEventType.SESSION_STARTED,
      timestamp: Date.now(),
      sessionId,
      userId
    });
  }

  endSession(sessionId: string, userId?: string): void {
    const startTime = this.activeSessions.get(sessionId);
    if (!startTime) {
      this.logger.warn('Attempting to end unknown session', { sessionId });
      return;
    }

    const duration = Date.now() - startTime;
    this.activeSessions.delete(sessionId);

    this.trackEvent({
      type: AnalyticsEventType.SESSION_ENDED,
      timestamp: Date.now(),
      sessionId,
      userId,
      duration
    });

    // Update device stats if session was associated with a device
    const sessionEvents = this.queryEvents({
      sessionIds: [sessionId]
    });
    const deviceId = sessionEvents[0]?.deviceId;
    if (deviceId) {
      const stats = this.getOrCreateDeviceStats(deviceId);
      stats.totalSessionTime += duration;
      const sessionCount = this.queryEvents({
        types: [AnalyticsEventType.SESSION_ENDED],
        deviceIds: [deviceId]
      }).length;
      stats.averageSessionDuration = stats.totalSessionTime / sessionCount;
    }
  }

  trackError(
    error: Error,
    context: Record<string, any>,
    deviceId?: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.trackEvent({
      type: AnalyticsEventType.ERROR_OCCURRED,
      timestamp: Date.now(),
      deviceId,
      userId,
      sessionId,
      error,
      data: context
    });

    if (deviceId) {
      const stats = this.getOrCreateDeviceStats(deviceId);
      const errorType = error.name || 'UnknownError';
      stats.errorRates[errorType] = (stats.errorRates[errorType] || 0) + 1;
    }
  }

  trackStateChange(
    deviceId: string,
    stateKey: string,
    oldValue: any,
    newValue: any,
    metadata?: Record<string, string>
  ): void {
    this.trackEvent({
      type: AnalyticsEventType.STATE_CHANGED,
      timestamp: Date.now(),
      deviceId,
      data: {
        stateKey,
        oldValue,
        newValue
      },
      metadata
    });
  }

  trackFeatureUsage(
    feature: string,
    deviceId?: string,
    userId?: string,
    sessionId?: string,
    metadata?: Record<string, string>
  ): void {
    this.trackEvent({
      type: AnalyticsEventType.FEATURE_USED,
      timestamp: Date.now(),
      deviceId,
      userId,
      sessionId,
      data: { feature },
      metadata
    });

    if (deviceId) {
      const stats = this.getOrCreateDeviceStats(deviceId);
      const featureUsage = stats.topFeatures.find(f => f.feature === feature);
      if (featureUsage) {
        featureUsage.count++;
      } else {
        stats.topFeatures.push({ feature, count: 1 });
      }
      // Sort by count in descending order
      stats.topFeatures.sort((a, b) => b.count - a.count);
    }
  }

  queryEvents(filter: EventFilter = {}): AnalyticsEvent[] {
    return this.events.filter(event => {
      if (filter.types && !filter.types.includes(event.type)) return false;
      if (filter.deviceIds && event.deviceId && !filter.deviceIds.includes(event.deviceId)) return false;
      if (filter.userIds && event.userId && !filter.userIds.includes(event.userId)) return false;
      if (filter.sessionIds && event.sessionId && !filter.sessionIds.includes(event.sessionId)) return false;
      if (filter.startTime && event.timestamp < filter.startTime) return false;
      if (filter.endTime && event.timestamp > filter.endTime) return false;
      return true;
    }).slice(-(filter.limit || this.events.length));
  }

  getDeviceStats(deviceId: string): DeviceUsageStats | undefined {
    return this.deviceStats.get(deviceId);
  }

  getAllDeviceStats(): DeviceUsageStats[] {
    return Array.from(this.deviceStats.values());
  }

  getSnapshot(startTime?: number, endTime: number = Date.now()): AnalyticsSnapshot {
    return {
      events: this.queryEvents({ startTime, endTime }),
      deviceStats: Object.fromEntries(this.deviceStats),
      period: {
        start: startTime || this.events[0]?.timestamp || Date.now(),
        end: endTime
      }
    };
  }

  setRetentionPeriod(days: number): void {
    this.retentionPeriodMs = days * 24 * 60 * 60 * 1000;
    this.cleanupOldEvents();
  }

  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.defaultFlushIntervalMs);
  }

  private async flush(): Promise<void> {
    try {
      const snapshot = this.getSnapshot();
      this.emit('flush', snapshot);
      this.cleanupOldEvents();
    } catch (error) {
      this.logger.error('Error flushing analytics', { error });
    }
  }

  private cleanupOldEvents(): void {
    const cutoff = Date.now() - this.retentionPeriodMs;
    this.events = this.events.filter(event => event.timestamp >= cutoff);

    // Also cleanup old device stats
    for (const [deviceId, stats] of this.deviceStats) {
      if (stats.lastSeen < cutoff) {
        this.deviceStats.delete(deviceId);
      }
    }
  }

  private getOrCreateDeviceStats(deviceId: string): DeviceUsageStats {
    let stats = this.deviceStats.get(deviceId);
    if (!stats) {
      stats = {
        deviceId,
        totalConnections: 0,
        totalCommandsSent: 0,
        totalCommandsFailed: 0,
        totalPatternRuns: 0,
        totalSessionTime: 0,
        averageSessionDuration: 0,
        lastSeen: Date.now(),
        topFeatures: [],
        errorRates: {}
      };
      this.deviceStats.set(deviceId, stats);
    }
    return stats;
  }

  private updateDeviceStats(event: AnalyticsEvent): void {
    if (!event.deviceId) return;

    const stats = this.getOrCreateDeviceStats(event.deviceId);
    stats.lastSeen = event.timestamp;

    // Additional stats updates are handled in specific tracking methods
  }

  dispose(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.removeAllListeners();
    this.events = [];
    this.deviceStats.clear();
    this.activeSessions.clear();
  }
}
