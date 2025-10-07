import { Counter, Gauge, Histogram, register } from 'prom-client';

export interface MetricConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

export class MetricsCollector {
  private counters: Map<string, Counter<string>> = new Map();
  private gauges: Map<string, Gauge<string>> = new Map();
  private histograms: Map<string, Histogram<string>> = new Map();

  createCounter(config: MetricConfig): Counter<string> {
    const counter = new Counter({
      name: config.name,
      help: config.help,
      labelNames: config.labelNames || []
    });
    this.counters.set(config.name, counter);
    return counter;
  }

  createGauge(config: MetricConfig): Gauge<string> {
    const gauge = new Gauge({
      name: config.name,
      help: config.help,
      labelNames: config.labelNames || []
    });
    this.gauges.set(config.name, gauge);
    return gauge;
  }

  createHistogram(config: MetricConfig & { buckets?: number[] }): Histogram<string> {
    const histogram = new Histogram({
      name: config.name,
      help: config.help,
      labelNames: config.labelNames || [],
      buckets: config.buckets
    });
    this.histograms.set(config.name, histogram);
    return histogram;
  }

  getCounter(name: string): Counter<string> | undefined {
    return this.counters.get(name);
  }

  getGauge(name: string): Gauge<string> | undefined {
    return this.gauges.get(name);
  }

  getHistogram(name: string): Histogram<string> | undefined {
    return this.histograms.get(name);
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  clear(): void {
    register.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

export default MetricsCollector;