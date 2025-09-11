"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryManager = void 0;
const events_1 = require("events");
/**
 * TelemetryManager
 * Buffered, privacy-aware telemetry collection and shipping.
 */
class TelemetryManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.buffer = [];
        this.config = {
            level: 'basic',
            bufferSize: 1000,
            flushIntervalMs: 5000,
            redactFields: ['token', 'password', 'apiKey', 'cookie'],
            ...config
        };
        this.startTimer();
    }
    setLevel(level) {
        this.config.level = level;
    }
    track(event) {
        if (this.config.level === 'off')
            return;
        const sanitized = this.sanitize(event);
        this.buffer.push(sanitized);
        this.emit('event', sanitized);
        if (this.buffer.length >= this.config.bufferSize) {
            void this.flush();
        }
    }
    async flush() {
        if (this.buffer.length === 0)
            return;
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
            }
            catch (err) {
                // Re-queue on failure (best-effort)
                this.buffer.unshift(...batch);
                this.emit('error', err);
            }
        }
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    startTimer() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = setInterval(() => void this.flush(), this.config.flushIntervalMs);
    }
    sanitize(event) {
        const cloned = JSON.parse(JSON.stringify(event));
        const redact = (obj) => {
            if (!obj || typeof obj !== 'object')
                return;
            for (const key of Object.keys(obj)) {
                if (this.config.redactFields.includes(key.toLowerCase())) {
                    obj[key] = '**REDACTED**';
                }
                else if (typeof obj[key] === 'object') {
                    redact(obj[key]);
                }
            }
        };
        redact(cloned.data);
        return cloned;
    }
}
exports.TelemetryManager = TelemetryManager;
//# sourceMappingURL=TelemetryManager.js.map