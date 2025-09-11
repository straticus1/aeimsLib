"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasePattern = void 0;
class BasePattern {
    constructor(config) {
        this.config = config;
        this.lastUpdate = Date.now();
    }
    get name() {
        return this.config.name;
    }
    setConfig(config) {
        this.config = config;
    }
    validate(intensity) {
        return (intensity >= this.config.minIntensity && intensity <= this.config.maxIntensity);
    }
    getNextUpdate() {
        return this.lastUpdate;
    }
    updateTimestamp() {
        this.lastUpdate = Date.now();
    }
    clampIntensity(intensity) {
        return Math.min(Math.max(intensity, this.config.minIntensity), this.config.maxIntensity);
    }
}
exports.BasePattern = BasePattern;
//# sourceMappingURL=BasePattern.js.map