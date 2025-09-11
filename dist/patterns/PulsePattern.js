"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulsePattern = void 0;
const BasePattern_1 = require("./BasePattern");
class PulsePattern extends BasePattern_1.BasePattern {
    constructor(config) {
        super(config);
        this.config = config;
        this.pulseWidth = config.pulseWidth.default;
        this.interval = config.interval.default;
        this.lastPulseTime = 0;
        this.isInPulse = false;
    }
    getIntensity(time) {
        // Calculate time since the last pulse started
        const timeSinceLastPulse = time - this.lastPulseTime;
        // Check if we need to start a new pulse cycle
        if (timeSinceLastPulse >= this.interval) {
            this.lastPulseTime = time - (timeSinceLastPulse % this.interval);
            this.isInPulse = true;
        }
        // Check if we're still in the pulse width duration
        if (this.isInPulse && (time - this.lastPulseTime) >= this.pulseWidth) {
            this.isInPulse = false;
        }
        // Return max intensity during pulse, min intensity otherwise
        return this.clampIntensity(this.isInPulse ? this.config.maxIntensity : this.config.minIntensity);
    }
    setPulseWidth(width) {
        if (width >= this.config.pulseWidth.min && width <= this.config.pulseWidth.max) {
            this.pulseWidth = width;
            this.updateTimestamp();
        }
    }
    setInterval(interval) {
        if (interval >= this.config.interval.min && interval <= this.config.interval.max) {
            this.interval = interval;
            this.updateTimestamp();
        }
    }
    getNextUpdate() {
        const now = Date.now();
        const timeInCycle = (now - this.lastPulseTime) % this.interval;
        if (this.isInPulse) {
            // Next update when pulse ends
            return this.lastPulseTime + this.pulseWidth;
        }
        else {
            // Next update at start of next pulse
            return this.lastPulseTime + this.interval;
        }
    }
}
exports.PulsePattern = PulsePattern;
//# sourceMappingURL=PulsePattern.js.map