import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';

interface ProfilerOptions {
  // Sampling settings
  sampleInterval: number;
  bufferSize: number;
  historyLength: number;

  // Analysis settings
  latencyThreshold: number;
  stallThreshold: number;
  resourceThreshold: number;

  // Reporting settings
  reportInterval: number;
  metrics: string[];
}

interface ProfilerMetrics {
  // Timing metrics
  avgLatency: number;
  maxLatency: number;
  p95Latency: number;
  p99Latency: number;
  jitter: number;

  // Command metrics
  commandRate: number;
  commandSuccess: number;
  commandErrors: number;
  queueLength: number;

  // Resource metrics
  memoryUsage: number;
  cpuUsage: number;
  networkBps: number;
  bufferUsage: number;

  // Pattern metrics
  patternAccuracy: number;
  syncDeviation: number;
  batteryImpact: number;
}

interface PerformanceSample {
  timestamp: number;
  metrics: ProfilerMetrics;
  events: Array<{
    type: string;
    data: any;
  }>;
}

interface ProfilerReport {
  timeRange: {
    start: number;
    end: number;
  };
  summary: ProfilerMetrics;
  anomalies: Array<{
    type: string;
    severity: 'warning' | 'error';
    metric: string;
    value: number;
    threshold: number;
    timestamp: number;
  }>;
  recommendations: Array<{
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    metrics: string[];
  }>;
}

/**
 * Performance Profiler
 * Analyzes device and pattern performance with detailed metrics and recommendations
 */
export class PerformanceProfiler extends EventEmitter {
  private options: Required<ProfilerOptions>;
  private samples: PerformanceSample[] = [];
  private sampleTimer?: NodeJS.Timer;
  private reportTimer?: NodeJS.Timer;
  private startTime: number;

  constructor(
    private telemetry: TelemetryManager,
    options: Partial<ProfilerOptions> = {}
  ) {
    super();
    this.options = this.initializeOptions(options);
    this.startTime = Date.now();
    this.startSampling();
  }

  /**
   * Start profiling session
   */
  start(): void {
    this.startTime = Date.now();
    this.samples = [];
    this.startSampling();
    this.startReporting();

    // Track session start
    this.telemetry.track({
      type: 'profiler_session_start',
      timestamp: this.startTime,
      data: {
        options: this.options
      }
    });
  }

  /**
   * Stop profiling session
   */
  stop(): void {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
    }
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }

    // Track session end
    this.telemetry.track({
      type: 'profiler_session_end',
      timestamp: Date.now(),
      data: {
        duration: Date.now() - this.startTime,
        sampleCount: this.samples.length
      }
    });
  }

  /**
   * Add a performance event
   */
  addEvent(type: string, data: any): void {
    const now = Date.now();
    const currentSample = this.getCurrentSample();

    if (currentSample) {
      currentSample.events.push({
        type,
        data
      });
    }

    // Track significant events
    if (this.isSignificantEvent(type, data)) {
      this.telemetry.track({
        type: 'profiler_significant_event',
        timestamp: now,
        data: {
          eventType: type,
          eventData: data
        }
      });
    }
  }

  /**
   * Get current performance report
   */
  async getReport(): Promise<ProfilerReport> {
    const now = Date.now();
    const metrics = this.calculateMetrics();
    const anomalies = this.detectAnomalies(metrics);
    const recommendations = this.generateRecommendations(metrics, anomalies);

    const report: ProfilerReport = {
      timeRange: {
        start: this.startTime,
        end: now
      },
      summary: metrics,
      anomalies,
      recommendations
    };

    // Track report generation
    await this.telemetry.track({
      type: 'profiler_report_generated',
      timestamp: now,
      data: {
        reportTimeRange: report.timeRange,
        anomalyCount: anomalies.length,
        recommendationCount: recommendations.length
      }
    });

    return report;
  }

  /**
   * Get raw performance data
   */
  getRawData(): PerformanceSample[] {
    return this.samples;
  }

  private initializeOptions(options: Partial<ProfilerOptions>): Required<ProfilerOptions> {
    return {
      sampleInterval: options.sampleInterval || 1000,
      bufferSize: options.bufferSize || 1000,
      historyLength: options.historyLength || 3600,
      latencyThreshold: options.latencyThreshold || 100,
      stallThreshold: options.stallThreshold || 1000,
      resourceThreshold: options.resourceThreshold || 0.8,
      reportInterval: options.reportInterval || 60000,
      metrics: options.metrics || [
        'latency',
        'commandRate',
        'memoryUsage',
        'patternAccuracy'
      ]
    };
  }

  private startSampling(): void {
    this.sampleTimer = setInterval(() => {
      this.collectSample();
    }, this.options.sampleInterval);
  }

  private startReporting(): void {
    this.reportTimer = setInterval(async () => {
      const report = await this.getReport();
      this.emit('report', report);
    }, this.options.reportInterval);
  }

  private collectSample(): void {
    const metrics = this.collectMetrics();
    
    const sample: PerformanceSample = {
      timestamp: Date.now(),
      metrics,
      events: []
    };

    this.samples.push(sample);

    // Trim old samples
    while (this.samples.length > this.options.bufferSize) {
      this.samples.shift();
    }

    // Clean up old samples
    const cutoff = Date.now() - (this.options.historyLength * 1000);
    this.samples = this.samples.filter(s => s.timestamp >= cutoff);

    this.emit('sample', sample);
  }

  private collectMetrics(): ProfilerMetrics {
    // Collect current metrics
    // This is a placeholder - real implementation would:
    // 1. Get process metrics (memory, CPU)
    // 2. Get network metrics
    // 3. Get command queue metrics
    // 4. Get pattern execution metrics
    return {
      avgLatency: 0,
      maxLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      jitter: 0,
      commandRate: 0,
      commandSuccess: 0,
      commandErrors: 0,
      queueLength: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      networkBps: 0,
      bufferUsage: 0,
      patternAccuracy: 0,
      syncDeviation: 0,
      batteryImpact: 0
    };
  }

  private calculateMetrics(): ProfilerMetrics {
    if (this.samples.length === 0) {
      return this.collectMetrics();
    }

    // Calculate aggregate metrics
    const metrics = this.samples.map(s => s.metrics);
    
    return {
      avgLatency: this.calculateAverage(metrics.map(m => m.avgLatency)),
      maxLatency: Math.max(...metrics.map(m => m.maxLatency)),
      p95Latency: this.calculatePercentile(metrics.map(m => m.avgLatency), 95),
      p99Latency: this.calculatePercentile(metrics.map(m => m.avgLatency), 99),
      jitter: this.calculateStdDev(metrics.map(m => m.avgLatency)),
      commandRate: this.calculateAverage(metrics.map(m => m.commandRate)),
      commandSuccess: this.calculateSum(metrics.map(m => m.commandSuccess)),
      commandErrors: this.calculateSum(metrics.map(m => m.commandErrors)),
      queueLength: this.calculateAverage(metrics.map(m => m.queueLength)),
      memoryUsage: this.calculateAverage(metrics.map(m => m.memoryUsage)),
      cpuUsage: this.calculateAverage(metrics.map(m => m.cpuUsage)),
      networkBps: this.calculateAverage(metrics.map(m => m.networkBps)),
      bufferUsage: this.calculateAverage(metrics.map(m => m.bufferUsage)),
      patternAccuracy: this.calculateAverage(metrics.map(m => m.patternAccuracy)),
      syncDeviation: this.calculateAverage(metrics.map(m => m.syncDeviation)),
      batteryImpact: this.calculateAverage(metrics.map(m => m.batteryImpact))
    };
  }

  private detectAnomalies(metrics: ProfilerMetrics): Array<{
    type: string;
    severity: 'warning' | 'error';
    metric: string;
    value: number;
    threshold: number;
    timestamp: number;
  }> {
    const anomalies = [];
    const now = Date.now();

    // Check latency anomalies
    if (metrics.avgLatency > this.options.latencyThreshold) {
      anomalies.push({
        type: 'high_latency',
        severity: 'warning',
        metric: 'avgLatency',
        value: metrics.avgLatency,
        threshold: this.options.latencyThreshold,
        timestamp: now
      });
    }

    // Check stall conditions
    if (metrics.maxLatency > this.options.stallThreshold) {
      anomalies.push({
        type: 'command_stall',
        severity: 'error',
        metric: 'maxLatency',
        value: metrics.maxLatency,
        threshold: this.options.stallThreshold,
        timestamp: now
      });
    }

    // Check resource usage
    if (metrics.memoryUsage > this.options.resourceThreshold) {
      anomalies.push({
        type: 'high_memory',
        severity: 'warning',
        metric: 'memoryUsage',
        value: metrics.memoryUsage,
        threshold: this.options.resourceThreshold,
        timestamp: now
      });
    }

    if (metrics.cpuUsage > this.options.resourceThreshold) {
      anomalies.push({
        type: 'high_cpu',
        severity: 'warning',
        metric: 'cpuUsage',
        value: metrics.cpuUsage,
        threshold: this.options.resourceThreshold,
        timestamp: now
      });
    }

    return anomalies;
  }

  private generateRecommendations(
    metrics: ProfilerMetrics,
    anomalies: Array<{
      type: string;
      severity: 'warning' | 'error';
      metric: string;
      value: number;
      threshold: number;
      timestamp: number;
    }>
  ): Array<{
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    metrics: string[];
  }> {
    const recommendations = [];

    // Latency recommendations
    if (metrics.avgLatency > this.options.latencyThreshold) {
      recommendations.push({
        type: 'reduce_latency',
        description: 'Consider reducing pattern complexity or increasing update interval',
        impact: 'high',
        metrics: ['avgLatency', 'jitter']
      });
    }

    // Resource recommendations
    if (metrics.memoryUsage > this.options.resourceThreshold) {
      recommendations.push({
        type: 'optimize_memory',
        description: 'Reduce pattern buffer size or clean up unused resources',
        impact: 'medium',
        metrics: ['memoryUsage', 'bufferUsage']
      });
    }

    // Pattern recommendations
    if (metrics.patternAccuracy < 0.9) {
      recommendations.push({
        type: 'improve_accuracy',
        description: 'Adjust pattern timing or reduce complexity',
        impact: 'medium',
        metrics: ['patternAccuracy', 'syncDeviation']
      });
    }

    // Battery recommendations
    if (metrics.batteryImpact > 0.7) {
      recommendations.push({
        type: 'reduce_battery_impact',
        description: 'Optimize update frequency or pattern intensity',
        impact: 'medium',
        metrics: ['batteryImpact', 'commandRate']
      });
    }

    return recommendations;
  }

  private getCurrentSample(): PerformanceSample | undefined {
    return this.samples[this.samples.length - 1];
  }

  private isSignificantEvent(type: string, data: any): boolean {
    return (
      type === 'error' ||
      type === 'stall' ||
      type === 'recovery' ||
      (type === 'metric' && data.value > data.threshold)
    );
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateSum(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0);
  }

  private calculateStdDev(values: number[]): number {
    const avg = this.calculateAverage(values);
    const squareDiffs = values.map(value => {
      const diff = value - avg;
      return diff * diff;
    });
    const avgSquareDiff = this.calculateAverage(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
}
