"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WavePattern = void 0;
const BasePattern_1 = require("./BasePattern");
class WavePattern extends BasePattern_1.BasePattern {
    constructor(config) {
        super(config);
        this.config = config;
        this.amplitude = (config.maxIntensity - config.minIntensity) / 2;
        this.frequency = config.frequency.default;
    }
    getIntensity(time) {
        const center = (this.config.maxIntensity + this.config.minIntensity) / 2;
        let intensity;
        switch (this.config.waveform) {
            case 'sine':
                intensity = this.getSineWave(time, center);
                break;
            case 'square':
                intensity = this.getSquareWave(time, center);
                break;
            case 'triangle':
                intensity = this.getTriangleWave(time, center);
                break;
            case 'sawtooth':
                intensity = this.getSawtoothWave(time, center);
                break;
            default:
                intensity = this.getSineWave(time, center);
        }
        return this.clampIntensity(intensity);
    }
    setFrequency(frequency) {
        if (frequency >= this.config.frequency.min && frequency <= this.config.frequency.max) {
            this.frequency = frequency;
            this.updateTimestamp();
        }
    }
    getSineWave(time, center) {
        return center + this.amplitude * Math.sin(2 * Math.PI * this.frequency * time / 1000);
    }
    getSquareWave(time, center) {
        const t = (time * this.frequency) % 1000;
        return center + this.amplitude * (t < 500 ? 1 : -1);
    }
    getTriangleWave(time, center) {
        const t = (time * this.frequency) % 1000;
        const normalizedTime = t / 1000;
        return center + this.amplitude * (Math.abs(2 * normalizedTime - 1) * 2 - 1);
    }
    getSawtoothWave(time, center) {
        const t = (time * this.frequency) % 1000;
        const normalizedTime = t / 1000;
        return center + this.amplitude * (2 * normalizedTime - 1);
    }
}
exports.WavePattern = WavePattern;
//# sourceMappingURL=WavePattern.js.map