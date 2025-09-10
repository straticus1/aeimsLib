import { EventEmitter } from 'events';
import { DeviceManager } from '../core/DeviceManager';
import { Pattern } from '../patterns/Pattern';
import { TelemetryManager } from '../core/telemetry/TelemetryManager';
import { MetricsCollector } from '../core/telemetry/MetricsCollector';

interface LatencyAnalysis {
  average: number;
  p50: number;
  p90: number;
  p99: number;
  histogram: Record<string, number>;
  trends: {
    window: number;
    values: number[];
  }[];
}

interface PatternVisualization {
  timeline: {
    time: number;
    intensity: number;
    type: string;
    metadata?: Record<string, any>;
  }[];
  heatmap?: {
    x: number;
    y: number;
    intensity: number;
  }[];
  stats: {
    minIntensity: number;
    maxIntensity: number;
    avgIntensity: number;
    duration: number;
    transitions: number;
  };
}

interface DeviceSnapshot {
  timestamp: number;
  deviceId: string;
  state: {
    connected: boolean;
    pattern?: string;
    intensity?: number;
    mode?: string;
  };
  metrics: {
    latency?: number;
    battery?: number;
    temperature?: number;
    errors?: number;
  };
  history: {
    commands: {
      type: string;
      timestamp: number;
      success: boolean;
    }[];
    patterns: {
      id: string;
      startTime: number;
      endTime?: number;
    }[];
  };
}

/**
 * DebugManager
 * Advanced debugging and analysis tools for device control system.
 */
export class DebugManager extends EventEmitter {
  private latencyBuffer: Map<string, number[]> = new Map();
  private patternHistory: Map<string, {
    pattern: Pattern;
    startTime: number;
    endTime?: number;
  }[]> = new Map();
  private deviceSnapshots: Map<string, DeviceSnapshot[]> = new Map();

  constructor(
    private deviceManager: DeviceManager,
    private telemetry: TelemetryManager,
    private metrics: MetricsCollector
  ) {
    super();
    this.initializeMonitoring();
  }

  /**
   * Analyze command latency for a device
   */
  analyzeLatency(
    deviceId: string,
    options: {
      window?: number;
      bucketSize?: number;
    } = {}
  ): LatencyAnalysis {
    const latencies = this.latencyBuffer.get(deviceId) || [];
    const window = options.window || 60000; // 1 minute default
    const bucketSize = options.bucketSize || 10; // 10ms buckets default

    const recentLatencies = latencies.filter(
      l => Date.now() - l.timestamp <= window
    );

    if (recentLatencies.length === 0) {
      return {
        average: 0,
        p50: 0,
        p90: 0,
        p99: 0,
        histogram: {},
        trends: []
      };
    }

    // Calculate statistics
    const sorted = [...recentLatencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    // Build histogram
    const histogram: Record<string, number> = {};
    for (const latency of recentLatencies) {
      const bucket = Math.floor(latency / bucketSize) * bucketSize;
      const key = `${bucket}-${bucket + bucketSize}ms`;
      histogram[key] = (histogram[key] || 0) + 1;
    }

    // Calculate trends over different windows
    const trends = [
      5000,   // 5 seconds
      15000,  // 15 seconds
      60000   // 1 minute
    ].map(windowSize => {
      const windowLatencies = recentLatencies.filter(
        l => Date.now() - l.timestamp <= windowSize
      );
      return {
        window: windowSize,
        values: windowLatencies
      };
    });

    return {
      average: sum / recentLatencies.length,
      p50: this.percentile(sorted, 50),
      p90: this.percentile(sorted, 90),
      p99: this.percentile(sorted, 99),
      histogram,
      trends
    };
  }

  /**
   * Visualize a pattern's behavior
   */
  visualizePattern(pattern: Pattern): PatternVisualization {
    const timeline: PatternVisualization['timeline'] = [];
    let minIntensity = Infinity;
    let maxIntensity = -Infinity;
    let totalIntensity = 0;
    let transitions = 0;
    let lastIntensity: number | null = null;

    // Sample pattern at regular intervals
    const duration = pattern.getDuration();
    const sampleRate = Math.min(duration / 100, 100); // Max 100 samples
    
    for (let time = 0; time < duration; time += sampleRate) {
      const intensity = pattern.getIntensityAtTime(time);
      
      timeline.push({
        time,
        intensity,
        type: pattern.getTypeAtTime(time),
        metadata: pattern.getMetadataAtTime(time)
      });

      // Update statistics
      minIntensity = Math.min(minIntensity, intensity);
      maxIntensity = Math.max(maxIntensity, intensity);
      totalIntensity += intensity;

      if (lastIntensity !== null && Math.abs(intensity - lastIntensity) > 0.1) {
        transitions++;
      }
      lastIntensity = intensity;
    }

    // Generate 2D heatmap for complex patterns
    const heatmap = pattern.getDimensions() > 1 ? 
      this.generatePatternHeatmap(pattern) : 
      undefined;

    return {
      timeline,
      heatmap,
      stats: {
        minIntensity,
        maxIntensity,
        avgIntensity: totalIntensity / timeline.length,
        duration,
        transitions
      }
    };
  }

  /**
   * Take a snapshot of device state
   */
  async takeDeviceSnapshot(deviceId: string): Promise<DeviceSnapshot> {
    const device = this.deviceManager.getDevice(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const snapshot: DeviceSnapshot = {
      timestamp: Date.now(),
      deviceId,
      state: {
        connected: device.isConnected(),
        pattern: device.getCurrentPattern()?.id,
        intensity: device.getCurrentIntensity(),
        mode: device.getMode()
      },
      metrics: {
        latency: await device.getLatency(),
        battery: device.getBatteryLevel(),
        temperature: device.getTemperature(),
        errors: device.getErrorCount()
      },
      history: {
        commands: device.getCommandHistory(),
        patterns: device.getPatternHistory()
      }
    };

    // Store snapshot
    const deviceSnapshots = this.deviceSnapshots.get(deviceId) || [];
    deviceSnapshots.push(snapshot);
    
    // Keep last 100 snapshots
    if (deviceSnapshots.length > 100) {
      deviceSnapshots.splice(0, deviceSnapshots.length - 100);
    }
    
    this.deviceSnapshots.set(deviceId, deviceSnapshots);

    return snapshot;
  }

  /**
   * Get device history
   */
  getDeviceHistory(
    deviceId: string,
    options: {
      startTime?: number;
      endTime?: number;
      limit?: number;
    } = {}
  ) {
    const snapshots = this.deviceSnapshots.get(deviceId) || [];
    let filtered = snapshots;

    if (options.startTime) {
      filtered = filtered.filter(s => s.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter(s => s.timestamp <= options.endTime!);
    }
    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Compare pattern executions
   */
  comparePatternExecutions(
    pattern: Pattern,
    executions: {
      deviceId: string;
      startTime: number;
      endTime: number;
    }[]
  ) {
    const results = executions.map(execution => {
      const metrics = this.metrics.getMetricStats('device_latency_ms', {
        start: execution.startTime,
        end: execution.endTime
      });

      const events = this.telemetry.getEvents({
        deviceId: execution.deviceId,
        startTime: execution.startTime,
        endTime: execution.endTime,
        types: ['pattern_start', 'pattern_end', 'pattern_error']
      });

      return {
        deviceId: execution.deviceId,
        duration: execution.endTime - execution.startTime,
        latency: {
          avg: metrics.avg,
          p90: metrics.p90
        },
        events,
        deviation: this.calculatePatternDeviation(
          pattern,
          execution.deviceId,
          execution.startTime,
          execution.endTime
        )
      };
    });

    return {
      pattern: this.visualizePattern(pattern),
      executions: results,
      analysis: {
        durationVariance: this.calculateVariance(
          results.map(r => r.duration)
        ),
        latencyVariance: this.calculateVariance(
          results.map(r => r.latency.avg)
        ),
        deviationStats: {
          min: Math.min(...results.map(r => r.deviation)),
          max: Math.max(...results.map(r => r.deviation)),
          avg: results.reduce((sum, r) => sum + r.deviation, 0) / results.length
        }
      }
    };
  }

  /**
   * Generate a debug report
   */
  async generateDebugReport(
    deviceId: string,
    timeRange: { start: number; end: number }
  ) {
    const device = this.deviceManager.getDevice(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const snapshots = this.getDeviceHistory(deviceId, timeRange);
    const latencyAnalysis = this.analyzeLatency(deviceId, {
      window: timeRange.end - timeRange.start
    });

    const metrics = this.metrics.getMetricStats('device_latency_ms', timeRange);
    const events = this.telemetry.getEvents({
      deviceId,
      startTime: timeRange.start,
      endTime: timeRange.end
    });

    const patterns = device.getPatternHistory()
      .filter(p => p.startTime >= timeRange.start && 
                   p.startTime <= timeRange.end)
      .map(p => ({
        pattern: this.visualizePattern(p.pattern),
        startTime: p.startTime,
        endTime: p.endTime,
        success: p.endTime ? true : false
      }));

    return {
      device: {
        id: deviceId,
        type: device.getType(),
        firmware: device.getFirmwareVersion(),
        capabilities: device.getCapabilities()
      },
      timeRange,
      snapshots,
      latencyAnalysis,
      metrics,
      events,
      patterns,
      summary: {
        totalPatterns: patterns.length,
        successRate: patterns.filter(p => p.success).length / patterns.length,
        avgLatency: metrics.avg,
        errorRate: events.filter(e => e.type.includes('error')).length / 
                  events.length,
        disconnections: events.filter(e => e.type === 'device_disconnected').length
      }
    };
  }

  private initializeMonitoring() {
    this.deviceManager.on('commandSent', (data: any) => {
      const { deviceId, timestamp, latency } = data;
      const latencies = this.latencyBuffer.get(deviceId) || [];
      latencies.push({ timestamp, latency });
      
      // Keep last 1000 latency measurements
      if (latencies.length > 1000) {
        latencies.splice(0, latencies.length - 1000);
      }
      
      this.latencyBuffer.set(deviceId, latencies);
    });

    this.deviceManager.on('patternStarted', (data: any) => {
      const { deviceId, pattern, timestamp } = data;
      const history = this.patternHistory.get(deviceId) || [];
      history.push({
        pattern,
        startTime: timestamp
      });
      this.patternHistory.set(deviceId, history);
    });

    this.deviceManager.on('patternStopped', (data: any) => {
      const { deviceId, timestamp } = data;
      const history = this.patternHistory.get(deviceId) || [];
      const lastPattern = history[history.length - 1];
      if (lastPattern) {
        lastPattern.endTime = timestamp;
      }
    });
  }

  private generatePatternHeatmap(pattern: Pattern) {
    const resolution = 20; // 20x20 grid
    const duration = pattern.getDuration();
    const heatmap: PatternVisualization['heatmap'] = [];

    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        const time = (x / resolution) * duration;
        const position = y / resolution;
        
        heatmap.push({
          x,
          y,
          intensity: pattern.getIntensityAtPosition(time, position)
        });
      }
    }

    return heatmap;
  }

  private calculatePatternDeviation(
    pattern: Pattern,
    deviceId: string,
    startTime: number,
    endTime: number
  ): number {
    // Calculate how much actual execution deviated from intended pattern
    // This is a placeholder implementation
    return Math.random(); // 0-1 deviation score
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    if (p <= 0) return sorted[0];
    if (p >= 100) return sorted[sorted.length - 1];

    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper === lower) return sorted[index];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
}
