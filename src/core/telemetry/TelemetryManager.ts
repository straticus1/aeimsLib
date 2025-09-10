import { EventEmitter } from 'events';

export type TelemetryLevel = 'off' | 'basic' | 'verbose';

export interface TelemetryEvent {
  timestamp: number;
  type: string;
  deviceId?: string;
  sessionId?: string;
  data?: Record<string, any>;
  durationMs?: number;
  success?: boolean;
  error?: {
    name: string;
    message: string;
  };
}

export interface TelemetryConfig {
  level: TelemetryLevel;
  bufferSize: number;
  flushIntervalMs: number;
  redactFields: string[];
  endpoint?: string; // optional HTTP endpoint for remote shipping
}

/**
 * TelemetryManager
 * Buffered, privacy-aware telemetry collection and shipping.
 */
export class TelemetryManager extends EventEmitter {
  private buffer: TelemetryEvent[] = [];
  private config: TelemetryConfig;
  private timer?: NodeJS.Timeout;

  constructor(config?: Partial<TelemetryConfig>) {
    super();
    this.config = {
      level: 'basic',
      bufferSize: 1000,
      flushIntervalMs: 5000,
      redactFields: ['token', 'password', 'apiKey', 'cookie'],
      ...config
    } as TelemetryConfig;

    this.startTimer();
  }

  setLevel(level: TelemetryLevel) {
    this.config.level = level;
  }

  track(event: TelemetryEvent) {
    if (this.config.level === 'off') return;

    const sanitized = this.sanitize(event);
    this.buffer.push(sanitized);

    this.emit('event', sanitized);

    if (this.buffer.length >= this.config.bufferSize) {
      void this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);

    // Emit locally for integrations (e.g., write to file, metrics backend)
    this.emit('flush', batch);

    // Optionally ship to remote endpoint
    if (this.config.endpoint) {
      try {
        await fetch(this.config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch)
        });
      } catch (err) {
        // Re-queue on failure (best-effort)
        this.buffer.unshift(...batch);
        this.emit('error', err);
      }
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.flush(), this.config.flushIntervalMs);
  }

  private sanitize(event: TelemetryEvent): TelemetryEvent {
    const cloned: TelemetryEvent = JSON.parse(JSON.stringify(event));

    const redact = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (this.config.redactFields.includes(key.toLowerCase())) {
          obj[key] = '**REDACTED**';
        } else if (typeof obj[key] === 'object') {
          redact(obj[key]);
        }
      }
    };

    redact(cloned.data);
    return cloned;
  }
}

