"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConstantPattern = void 0;
const BasePattern_1 = require("./BasePattern");
class ConstantPattern extends BasePattern_1.BasePattern {
    constructor(config) {
        super(config);
        this.intensity = config.defaultIntensity;
    }
    getIntensity(time) {
        return this.clampIntensity(this.intensity);
    }
    setIntensity(intensity) {
        if (this.validate(intensity)) {
            this.intensity = intensity;
            this.updateTimestamp();
        }
    }
}
exports.ConstantPattern = ConstantPattern;
//# sourceMappingURL=ConstantPattern.js.map