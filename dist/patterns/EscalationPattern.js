"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscalationPattern = void 0;
const BasePattern_1 = require("./BasePattern");
class EscalationPattern extends BasePattern_1.BasePattern {
    constructor(config) {
        super(config);
        this.config = config;
        this.currentIntensity = config.minIntensity;
        this.startTime = Date.now();
        this.lastStepTime = this.startTime;
    }
    getIntensity(time) {
        // Check if it's time for next step
        if (time - this.lastStepTime >= this.config.step.interval) {
            this.incrementIntensity(time);
        }
        // Check if we need to reset
        if (this.config.reset.enabled &&
            this.currentIntensity >= this.config.reset.threshold) {
            this.resetIntensity(time);
        }
        return this.clampIntensity(this.currentIntensity);
    }
    incrementIntensity(time) {
        this.currentIntensity += this.config.step.size;
        this.lastStepTime = time;
        this.updateTimestamp();
    }
    resetIntensity(time) {
        this.currentIntensity = this.config.minIntensity;
        this.startTime = time;
        this.lastStepTime = time;
        this.updateTimestamp();
    }
    getNextUpdate() {
        return this.lastStepTime + this.config.step.interval;
    }
    setStepSize(size) {
        if (size > 0 && this.validate(this.currentIntensity + size)) {
            this.config.step.size = size;
            this.updateTimestamp();
        }
    }
    setStepInterval(interval) {
        if (interval > 0) {
            this.config.step.interval = interval;
            this.updateTimestamp();
        }
    }
    setResetThreshold(threshold) {
        if (this.validate(threshold)) {
            this.config.reset.threshold = threshold;
            this.updateTimestamp();
        }
    }
    enableReset(enabled) {
        this.config.reset.enabled = enabled;
        this.updateTimestamp();
    }
    resetPattern() {
        this.resetIntensity(Date.now());
    }
}
exports.EscalationPattern = EscalationPattern;
//# sourceMappingURL=EscalationPattern.js.map