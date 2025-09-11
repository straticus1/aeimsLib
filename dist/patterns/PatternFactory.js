"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultPatternFactory = void 0;
const ConstantPattern_1 = require("./ConstantPattern");
const WavePattern_1 = require("./WavePattern");
const PulsePattern_1 = require("./PulsePattern");
const EscalationPattern_1 = require("./EscalationPattern");
class DefaultPatternFactory {
    constructor() {
        this.patterns = new Map();
        this.registerDefaultPatterns();
    }
    static getInstance() {
        if (!DefaultPatternFactory.instance) {
            DefaultPatternFactory.instance = new DefaultPatternFactory();
        }
        return DefaultPatternFactory.instance;
    }
    registerDefaultPatterns() {
        this.patterns.set('constant', ConstantPattern_1.ConstantPattern);
        this.patterns.set('wave', WavePattern_1.WavePattern);
        this.patterns.set('pulse', PulsePattern_1.PulsePattern);
        this.patterns.set('escalation', EscalationPattern_1.EscalationPattern);
    }
    createPattern(type, config) {
        const PatternClass = this.patterns.get(type.toLowerCase());
        if (!PatternClass) {
            throw new Error(`Unknown pattern type: ${type}`);
        }
        return new PatternClass(this.validateConfig(type, config));
    }
    getAvailablePatterns() {
        return Array.from(this.patterns.keys());
    }
    validatePattern(type, config) {
        try {
            this.validateConfig(type, config);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    validateConfig(type, config) {
        const baseValidation = this.validateBaseConfig(config);
        switch (type.toLowerCase()) {
            case 'constant':
                return this.validateConstantConfig(baseValidation);
            case 'wave':
                return this.validateWaveConfig(baseValidation);
            case 'pulse':
                return this.validatePulseConfig(baseValidation);
            case 'escalation':
                return this.validateEscalationConfig(baseValidation);
            default:
                throw new Error(`Unknown pattern type: ${type}`);
        }
    }
    validateBaseConfig(config) {
        if (!config.name || typeof config.name !== 'string') {
            throw new Error('Invalid pattern name');
        }
        if (typeof config.minIntensity !== 'number' || config.minIntensity < 0) {
            throw new Error('Invalid minimum intensity');
        }
        if (typeof config.maxIntensity !== 'number' || config.maxIntensity > 100) {
            throw new Error('Invalid maximum intensity');
        }
        if (config.minIntensity >= config.maxIntensity) {
            throw new Error('Minimum intensity must be less than maximum intensity');
        }
        if (typeof config.defaultIntensity !== 'number' ||
            config.defaultIntensity < config.minIntensity ||
            config.defaultIntensity > config.maxIntensity) {
            throw new Error('Invalid default intensity');
        }
        return config;
    }
    validateConstantConfig(config) {
        return config;
    }
    validateWaveConfig(config) {
        if (!config.frequency ||
            typeof config.frequency.min !== 'number' ||
            typeof config.frequency.max !== 'number' ||
            typeof config.frequency.default !== 'number') {
            throw new Error('Invalid wave frequency configuration');
        }
        if (config.frequency.min <= 0 || config.frequency.max <= config.frequency.min) {
            throw new Error('Invalid frequency range');
        }
        if (!['sine', 'square', 'triangle', 'sawtooth'].includes(config.waveform)) {
            throw new Error('Invalid waveform type');
        }
        return config;
    }
    validatePulseConfig(config) {
        if (!config.pulseWidth ||
            typeof config.pulseWidth.min !== 'number' ||
            typeof config.pulseWidth.max !== 'number' ||
            typeof config.pulseWidth.default !== 'number') {
            throw new Error('Invalid pulse width configuration');
        }
        if (!config.interval ||
            typeof config.interval.min !== 'number' ||
            typeof config.interval.max !== 'number' ||
            typeof config.interval.default !== 'number') {
            throw new Error('Invalid interval configuration');
        }
        if (config.pulseWidth.min <= 0 || config.pulseWidth.max <= config.pulseWidth.min) {
            throw new Error('Invalid pulse width range');
        }
        if (config.interval.min <= 0 || config.interval.max <= config.interval.min) {
            throw new Error('Invalid interval range');
        }
        return config;
    }
    validateEscalationConfig(config) {
        if (!config.step ||
            typeof config.step.size !== 'number' ||
            typeof config.step.interval !== 'number') {
            throw new Error('Invalid step configuration');
        }
        if (config.step.size <= 0) {
            throw new Error('Step size must be greater than 0');
        }
        if (config.step.interval <= 0) {
            throw new Error('Step interval must be greater than 0');
        }
        if (!config.reset ||
            typeof config.reset.enabled !== 'boolean' ||
            typeof config.reset.threshold !== 'number') {
            throw new Error('Invalid reset configuration');
        }
        if (config.reset.threshold <= config.minIntensity ||
            config.reset.threshold > config.maxIntensity) {
            throw new Error('Invalid reset threshold');
        }
        return config;
    }
}
exports.DefaultPatternFactory = DefaultPatternFactory;
//# sourceMappingURL=PatternFactory.js.map