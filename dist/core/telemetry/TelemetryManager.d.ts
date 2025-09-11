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
    endpoint?: string;
}
/**
 * TelemetryManager
 * Buffered, privacy-aware telemetry collection and shipping.
 */
export declare class TelemetryManager extends EventEmitter {
    private buffer;
    private config;
    private timer?;
    constructor(config?: Partial<TelemetryConfig>);
    setLevel(level: TelemetryLevel): void;
    track(event: TelemetryEvent): void;
    flush(): Promise<void>;
    stop(): void;
    private startTimer;
    private sanitize;
}
