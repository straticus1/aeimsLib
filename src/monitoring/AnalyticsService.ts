import { EventEmitter } from 'events';
import { Device, DeviceEvent } from '../interfaces/device';

export interface DeviceMetrics {
  deviceId: string;
  connectionDuration: number;
  commandCount: number;
  errorCount: number;
  averageLatency: number;
  batteryDrain: number;
  lastSync: Date;
}

export interface SessionMetrics {
  sessionId: string;
  userId: string;
  deviceId: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  commandCount: number;
  errorCount: number;
  patterns: string[];
  maxIntensity: number;
  averageIntensity: number;
}

export interface PerformanceMetrics {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  messageQueueSize: number;
  commandLatency: number;
}

export class AnalyticsService extends EventEmitter {
  private static instance: AnalyticsService;
  private metrics: Map<string, DeviceMetrics>;
  private sessions: Map<string, SessionMetrics>;
  private performanceLog: PerformanceMetrics[];
  private readonly maxPerformanceLogSize: number = 1000;

  private constructor() {
    super();
    this.metrics = new Map();
    this.sessions = new Map();
    this.performanceLog = [];
    this.startPerformanceMonitoring();
  }

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  // Device metrics tracking
  trackDeviceMetrics(deviceId: string, event: DeviceEvent): void {
    let metrics = this.metrics.get(deviceId) || this.createDefaultMetrics(deviceId);

    switch (event.type) {
      case 'connected':
        metrics.connectionDuration = 0;
        break;
      case 'disconnected':
        if (metrics.lastSync) {
          metrics.connectionDuration += Date.now() - metrics.lastSync.getTime();
        }
        break;
      case 'commandReceived':
        metrics.commandCount++;
        break;
      case 'error':
        metrics.errorCount++;
        break;
    }

    metrics.lastSync = new Date();
    this.metrics.set(deviceId, metrics);
    this.emit('metricsUpdated', metrics);
  }

  // Session tracking
  startSession(sessionId: string, userId: string, deviceId: string): void {
    const session: SessionMetrics = {
      sessionId,
      userId,
      deviceId,
      startTime: new Date(),
      duration: 0,
      commandCount: 0,
      errorCount: 0,
      patterns: [],
      maxIntensity: 0,
      averageIntensity: 0
    };

    this.sessions.set(sessionId, session);
    this.emit('sessionStarted', session);
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = new Date();
      session.duration = session.endTime.getTime() - session.startTime.getTime();
      this.emit('sessionEnded', session);
    }
  }

  // Performance monitoring
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // Convert to MB
        activeConnections: this.getActiveConnectionCount(),
        messageQueueSize: this.getMessageQueueSize(),
        commandLatency: this.calculateAverageLatency()
      };

      this.performanceLog.push(metrics);
      if (this.performanceLog.length > this.maxPerformanceLogSize) {
        this.performanceLog.shift();
      }

      this.emit('performanceMetrics', metrics);
    }, 5000); // Collect metrics every 5 seconds
  }

  // Analytics queries
  getDeviceMetrics(deviceId: string): DeviceMetrics | undefined {
    return this.metrics.get(deviceId);
  }

  getAllDeviceMetrics(): DeviceMetrics[] {
    return Array.from(this.metrics.values());
  }

  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSessions(userId: string): SessionMetrics[] {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId);
  }

  getPerformanceMetrics(timeRange?: { start: Date; end: Date }): PerformanceMetrics[] {
    if (!timeRange) {
      return [...this.performanceLog];
    }

    return this.performanceLog.filter(metrics => 
      metrics.timestamp >= timeRange.start && metrics.timestamp <= timeRange.end
    );
  }

  // Utility methods
  private createDefaultMetrics(deviceId: string): DeviceMetrics {
    return {
      deviceId,
      connectionDuration: 0,
      commandCount: 0,
      errorCount: 0,
      averageLatency: 0,
      batteryDrain: 0,
      lastSync: new Date()
    };
  }

  private getActiveConnectionCount(): number {
    return Array.from(this.metrics.values())
      .filter(m => Date.now() - m.lastSync.getTime() < 60000) // Consider connections active in last minute
      .length;
  }

  private getMessageQueueSize(): number {
    // This should be implemented based on your message queue implementation
    return 0;
  }

  private calculateAverageLatency(): number {
    const recentMetrics = this.performanceLog
      .slice(-10) // Look at last 10 measurements
      .map(m => m.commandLatency);
    
    return recentMetrics.length > 0
      ? recentMetrics.reduce((a, b) => a + b, 0) / recentMetrics.length
      : 0;
  }

  // Clean up old data
  cleanupOldData(retentionPeriod: number = 30 * 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - retentionPeriod);

    // Clean up old sessions
    for (const [sessionId, session] of this.sessions) {
      if (session.endTime && session.endTime < cutoff) {
        this.sessions.delete(sessionId);
      }
    }

    // Clean up old metrics
    for (const [deviceId, metrics] of this.metrics) {
      if (metrics.lastSync < cutoff) {
        this.metrics.delete(deviceId);
      }
    }

    // Clean up old performance logs
    this.performanceLog = this.performanceLog.filter(m => m.timestamp >= cutoff);
  }
}
