import { TelemetryManager, TelemetryEvent } from './TelemetryManager';
import { MetricsCollector } from './MetricsCollector';

interface AnalyticsPeriod {
  start: number;
  end: number;
  resolution: 'minute' | 'hour' | 'day';
}

interface UsageMetrics {
  activeUsers: number;
  activeDevices: number;
  totalSessions: number;
  avgSessionDuration: number;
  patternUsage: Record<string, number>;
  deviceTypeUsage: Record<string, number>;
}

interface PerformanceMetrics {
  avgLatency: number;
  p95Latency: number;
  errorRate: number;
  deviceErrors: Record<string, number>;
  patternErrors: Record<string, number>;
}

interface UserExperienceMetrics {
  sessionCompletionRate: number;
  avgPatternDuration: number;
  patternSuccessRate: Record<string, number>;
  deviceReliability: Record<string, number>;
}

/**
 * AnalyticsProcessor
 * Processes telemetry data into actionable insights.
 */
export class AnalyticsProcessor {
  private sessionData: Map<string, {
    userId: string;
    deviceId: string;
    startTime: number;
    patterns: Set<string>;
    errors: number;
  }> = new Map();

  constructor(
    private telemetry: TelemetryManager,
    private metrics: MetricsCollector
  ) {
    this.setupListeners();
  }

  /**
   * Get usage analytics for a time period
   */
  async getUsageAnalytics(period: AnalyticsPeriod): Promise<UsageMetrics> {
    const userSet = new Set<string>();
    const deviceSet = new Set<string>();
    const patternCounts: Record<string, number> = {};
    const deviceTypeCounts: Record<string, number> = {};
    let totalSessions = 0;
    let totalDuration = 0;

    // Get session data within period
    const sessionEvents = await this.getEventsInPeriod(
      period,
      ['session_start', 'session_end']
    );

    for (const event of sessionEvents) {
      if (event.type === 'session_start') {
        if (event.data?.userId) userSet.add(event.data.userId);
        if (event.deviceId) deviceSet.add(event.deviceId);
        totalSessions++;
      }
      if (event.type === 'session_end' && event.durationMs) {
        totalDuration += event.durationMs;
      }
      if (event.data?.patternType) {
        patternCounts[event.data.patternType] = 
          (patternCounts[event.data.patternType] || 0) + 1;
      }
      if (event.data?.deviceType) {
        deviceTypeCounts[event.data.deviceType] = 
          (deviceTypeCounts[event.data.deviceType] || 0) + 1;
      }
    }

    return {
      activeUsers: userSet.size,
      activeDevices: deviceSet.size,
      totalSessions,
      avgSessionDuration: totalSessions ? totalDuration / totalSessions : 0,
      patternUsage: patternCounts,
      deviceTypeUsage: deviceTypeCounts
    };
  }

  /**
   * Get performance analytics for a time period
   */
  async getPerformanceAnalytics(period: AnalyticsPeriod): Promise<PerformanceMetrics> {
    const latencyStats = this.metrics.getMetricStats(
      'device_latency_ms',
      period
    );

    const errorEvents = await this.getEventsInPeriod(
      period,
      ['device_error', 'pattern_error']
    );

    const deviceErrors: Record<string, number> = {};
    const patternErrors: Record<string, number> = {};
    let totalEvents = await this.countEventsInPeriod(period);

    for (const event of errorEvents) {
      if (event.type === 'device_error' && event.deviceId) {
        deviceErrors[event.deviceId] = (deviceErrors[event.deviceId] || 0) + 1;
      }
      if (event.type === 'pattern_error' && event.data?.patternType) {
        patternErrors[event.data.patternType] = 
          (patternErrors[event.data.patternType] || 0) + 1;
      }
    }

    return {
      avgLatency: latencyStats.avg || 0,
      p95Latency: this.metrics.getMetricStats('device_latency_ms', period).p90 || 0,
      errorRate: totalEvents ? errorEvents.length / totalEvents : 0,
      deviceErrors,
      patternErrors
    };
  }

  /**
   * Get user experience analytics for a time period
   */
  async getUserExperienceAnalytics(period: AnalyticsPeriod): Promise<UserExperienceMetrics> {
    const patternSuccessMap: Record<string, { success: number; total: number }> = {};
    const deviceReliabilityMap: Record<string, { success: number; total: number }> = {};
    let completedSessions = 0;
    let totalSessions = 0;
    let totalPatternDuration = 0;
    let patternCount = 0;

    const events = await this.getEventsInPeriod(
      period,
      ['pattern_start', 'pattern_end', 'session_start', 'session_end']
    );

    for (const event of events) {
      switch (event.type) {
        case 'session_start':
          totalSessions++;
          break;

        case 'session_end':
          if (event.success) completedSessions++;
          break;

        case 'pattern_start':
          if (event.data?.patternType && event.deviceId) {
            const key = event.data.patternType;
            patternSuccessMap[key] = patternSuccessMap[key] || { success: 0, total: 0 };
            patternSuccessMap[key].total++;

            const devKey = event.deviceId;
            deviceReliabilityMap[devKey] = deviceReliabilityMap[devKey] || { success: 0, total: 0 };
            deviceReliabilityMap[devKey].total++;
          }
          break;

        case 'pattern_end':
          if (event.success && event.data?.patternType && event.deviceId) {
            const key = event.data.patternType;
            if (patternSuccessMap[key]) patternSuccessMap[key].success++;

            const devKey = event.deviceId;
            if (deviceReliabilityMap[devKey]) deviceReliabilityMap[devKey].success++;
          }
          if (event.durationMs) {
            totalPatternDuration += event.durationMs;
            patternCount++;
          }
          break;
      }
    }

    // Calculate success rates
    const patternSuccessRate: Record<string, number> = {};
    for (const [key, data] of Object.entries(patternSuccessMap)) {
      patternSuccessRate[key] = data.total ? data.success / data.total : 0;
    }

    const deviceReliability: Record<string, number> = {};
    for (const [key, data] of Object.entries(deviceReliabilityMap)) {
      deviceReliability[key] = data.total ? data.success / data.total : 0;
    }

    return {
      sessionCompletionRate: totalSessions ? completedSessions / totalSessions : 0,
      avgPatternDuration: patternCount ? totalPatternDuration / patternCount : 0,
      patternSuccessRate,
      deviceReliability
    };
  }

  private setupListeners() {
    this.telemetry.on('event', (event: TelemetryEvent) => {
      // Track session data
      if (event.sessionId) {
        if (event.type === 'session_start') {
          this.sessionData.set(event.sessionId, {
            userId: event.data?.userId || 'unknown',
            deviceId: event.deviceId || 'unknown',
            startTime: event.timestamp,
            patterns: new Set(),
            errors: 0
          });
        } else if (event.type === 'session_end') {
          this.sessionData.delete(event.sessionId);
        } else {
          const session = this.sessionData.get(event.sessionId);
          if (session) {
            if (event.data?.patternType) {
              session.patterns.add(event.data.patternType);
            }
            if (event.type.includes('error')) {
              session.errors++;
            }
          }
        }
      }
    });
  }

  private async getEventsInPeriod(
    period: AnalyticsPeriod,
    types?: string[]
  ): Promise<TelemetryEvent[]> {
    // This would normally fetch from storage/database
    // For now, we'll return mock data
    return [];
  }

  private async countEventsInPeriod(period: AnalyticsPeriod): Promise<number> {
    // This would normally count from storage/database
    // For now, return mock count
    return 1000;
  }

  /**
   * Get user pattern history
   */
  getUserPatternHistory(userId: string): any[] {
    // This would normally fetch from storage/database
    // For now, return mock data
    return [];
  }
}
