"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.validateDeviceType = validateDeviceType;
exports.validateDeviceId = validateDeviceId;
exports.validateDeviceName = validateDeviceName;
/**
 * Validate device configuration
 */
function validateConfig(config) {
    const errors = [];
    const warnings = [];
    // Validate basic fields
    if (!config.type || typeof config.type !== 'string') {
        errors.push('Device type is required and must be a string');
    }
    if (!config.name || typeof config.name !== 'string') {
        errors.push('Device name is required and must be a string');
    }
    if (!config.description || typeof config.description !== 'string') {
        errors.push('Device description is required and must be a string');
    }
    if (!config.version || typeof config.version !== 'string') {
        errors.push('Device version is required and must be a string');
    }
    // Validate features
    if (!Array.isArray(config.features)) {
        errors.push('Features must be an array');
    }
    else {
        config.features.forEach((feature, index) => {
            const featureErrors = validateFeature(feature, index);
            errors.push(...featureErrors);
        });
    }
    // Validate pricing
    const pricingErrors = validatePricing(config.pricing);
    errors.push(...pricingErrors);
    // Validate requirements if present
    if (config.requirements) {
        const requirementsErrors = validateRequirements(config.requirements);
        errors.push(...requirementsErrors);
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Validate device feature
 */
function validateFeature(feature, index) {
    const errors = [];
    if (!feature.id || typeof feature.id !== 'string') {
        errors.push(`Feature ${index}: ID is required and must be a string`);
    }
    if (!feature.name || typeof feature.name !== 'string') {
        errors.push(`Feature ${index}: Name is required and must be a string`);
    }
    if (!feature.description || typeof feature.description !== 'string') {
        errors.push(`Feature ${index}: Description is required and must be a string`);
    }
    // Validate parameters if present
    if (feature.parameters && Array.isArray(feature.parameters)) {
        feature.parameters.forEach((param, paramIndex) => {
            const paramErrors = validateParameter(param, index, paramIndex);
            errors.push(...paramErrors);
        });
    }
    return errors;
}
/**
 * Validate feature parameter
 */
function validateParameter(param, featureIndex, paramIndex) {
    const errors = [];
    if (!param.id || typeof param.id !== 'string') {
        errors.push(`Feature ${featureIndex}, Parameter ${paramIndex}: ID is required and must be a string`);
    }
    if (!param.name || typeof param.name !== 'string') {
        errors.push(`Feature ${featureIndex}, Parameter ${paramIndex}: Name is required and must be a string`);
    }
    if (!param.type || !['number', 'string', 'boolean'].includes(param.type)) {
        errors.push(`Feature ${featureIndex}, Parameter ${paramIndex}: Type must be 'number', 'string', or 'boolean'`);
    }
    // Validate min/max for number types
    if (param.type === 'number') {
        if (param.min !== undefined && typeof param.min !== 'number') {
            errors.push(`Feature ${featureIndex}, Parameter ${paramIndex}: Min value must be a number`);
        }
        if (param.max !== undefined && typeof param.max !== 'number') {
            errors.push(`Feature ${featureIndex}, Parameter ${paramIndex}: Max value must be a number`);
        }
        if (param.min !== undefined && param.max !== undefined && param.min > param.max) {
            errors.push(`Feature ${featureIndex}, Parameter ${paramIndex}: Min value cannot be greater than max value`);
        }
    }
    return errors;
}
/**
 * Validate device pricing
 */
function validatePricing(pricing) {
    const errors = [];
    if (typeof pricing.baseRate !== 'number' || pricing.baseRate < 0) {
        errors.push('Base rate must be a non-negative number');
    }
    if (!pricing.currency || typeof pricing.currency !== 'string') {
        errors.push('Currency is required and must be a string');
    }
    if (!pricing.billingPeriod || !['hourly', 'daily', 'monthly'].includes(pricing.billingPeriod)) {
        errors.push('Billing period must be one of: hourly, daily, monthly');
    }
    if (!pricing.featureRates || typeof pricing.featureRates !== 'object') {
        errors.push('Feature rates must be an object');
    }
    else {
        Object.entries(pricing.featureRates).forEach(([feature, rate]) => {
            if (typeof rate !== 'number' || rate < 0) {
                errors.push(`Feature rate for '${feature}' must be a non-negative number`);
            }
        });
    }
    if (pricing.minimumCharge !== undefined && (typeof pricing.minimumCharge !== 'number' || pricing.minimumCharge < 0)) {
        errors.push('Minimum charge must be a non-negative number');
    }
    if (pricing.enterpriseDiscount !== undefined && (typeof pricing.enterpriseDiscount !== 'number' || pricing.enterpriseDiscount < 0 || pricing.enterpriseDiscount > 1)) {
        errors.push('Enterprise discount must be a number between 0 and 1');
    }
    return errors;
}
/**
 * Validate device requirements
 */
function validateRequirements(requirements) {
    const errors = [];
    if (requirements.minFirmware !== undefined && typeof requirements.minFirmware !== 'string') {
        errors.push('Minimum firmware version must be a string');
    }
    if (requirements.maxFirmware !== undefined && typeof requirements.maxFirmware !== 'string') {
        errors.push('Maximum firmware version must be a string');
    }
    if (requirements.dependencies !== undefined) {
        if (!Array.isArray(requirements.dependencies)) {
            errors.push('Dependencies must be an array');
        }
        else {
            requirements.dependencies.forEach((dep, index) => {
                if (typeof dep !== 'string') {
                    errors.push(`Dependency ${index} must be a string`);
                }
            });
        }
    }
    return errors;
}
/**
 * Validate device type string
 */
function validateDeviceType(type) {
    const errors = [];
    const warnings = [];
    if (!type || typeof type !== 'string') {
        errors.push('Device type is required and must be a string');
    }
    else {
        // Check for valid characters (alphanumeric, underscore, hyphen)
        if (!/^[a-zA-Z0-9_-]+$/.test(type)) {
            errors.push('Device type can only contain alphanumeric characters, underscores, and hyphens');
        }
        // Check length
        if (type.length < 2) {
            errors.push('Device type must be at least 2 characters long');
        }
        if (type.length > 50) {
            errors.push('Device type must be no more than 50 characters long');
        }
        // Check for reserved names
        const reservedNames = ['system', 'admin', 'root', 'config', 'test', 'default'];
        if (reservedNames.includes(type.toLowerCase())) {
            warnings.push('Device type name is reserved and may cause conflicts');
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Validate device ID
 */
function validateDeviceId(id) {
    const errors = [];
    const warnings = [];
    if (!id || typeof id !== 'string') {
        errors.push('Device ID is required and must be a string');
    }
    else {
        // Check for valid characters
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            errors.push('Device ID can only contain alphanumeric characters, underscores, and hyphens');
        }
        // Check length
        if (id.length < 3) {
            errors.push('Device ID must be at least 3 characters long');
        }
        if (id.length > 100) {
            errors.push('Device ID must be no more than 100 characters long');
        }
        // Check for reserved patterns
        if (id.startsWith('_') || id.endsWith('_')) {
            warnings.push('Device ID should not start or end with underscore');
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Validate device name
 */
function validateDeviceName(name) {
    const errors = [];
    const warnings = [];
    if (!name || typeof name !== 'string') {
        errors.push('Device name is required and must be a string');
    }
    else {
        // Check length
        if (name.length < 1) {
            errors.push('Device name cannot be empty');
        }
        if (name.length > 200) {
            errors.push('Device name must be no more than 200 characters long');
        }
        // Check for excessive whitespace
        if (name.trim() !== name) {
            warnings.push('Device name should not have leading or trailing whitespace');
        }
        // Check for multiple consecutive spaces
        if (/\s{2,}/.test(name)) {
            warnings.push('Device name should not have multiple consecutive spaces');
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
//# sourceMappingURL=validation.js.map