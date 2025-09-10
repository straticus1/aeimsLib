import { DeviceTypeConfig } from './DeviceConfig';
import { DeviceFeature, DevicePricing } from '../types/DeviceTypes';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate device type configuration
 */
export function validateConfig(config: DeviceTypeConfig): ValidationResult {
  const errors: string[] = [];

  // Basic field validation
  validateRequiredFields(config, errors);
  
  // Feature validation
  validateFeatures(config.features, errors);
  
  // Pricing validation
  validatePricing(config.pricing, errors);
  
  // Version validation
  validateVersion(config.version, errors);

  // Requirements validation if present
  if (config.requirements) {
    validateRequirements(config.requirements, errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateRequiredFields(config: DeviceTypeConfig, errors: string[]) {
  const requiredFields = ['type', 'name', 'description', 'version', 'features', 'pricing'];
  
  for (const field of requiredFields) {
    if (!config[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof config.type !== 'string' || config.type.length === 0) {
    errors.push('Invalid type field');
  }

  if (typeof config.name !== 'string' || config.name.length === 0) {
    errors.push('Invalid name field');
  }

  if (typeof config.description !== 'string' || config.description.length === 0) {
    errors.push('Invalid description field');
  }
}

function validateFeatures(features: DeviceFeature[], errors: string[]) {
  if (!Array.isArray(features)) {
    errors.push('Features must be an array');
    return;
  }

  if (features.length === 0) {
    errors.push('Device must have at least one feature');
    return;
  }

  const featureIds = new Set<string>();

  for (const feature of features) {
    // Check required fields
    if (!feature.id || typeof feature.id !== 'string') {
      errors.push('Feature must have a valid ID');
      continue;
    }

    if (!feature.name || typeof feature.name !== 'string') {
      errors.push(`Feature ${feature.id} must have a valid name`);
    }

    if (!feature.description || typeof feature.description !== 'string') {
      errors.push(`Feature ${feature.id} must have a valid description`);
    }

    // Check for duplicate IDs
    if (featureIds.has(feature.id)) {
      errors.push(`Duplicate feature ID: ${feature.id}`);
    }
    featureIds.add(feature.id);

    // Validate parameters if present
    if (feature.parameters) {
      if (!Array.isArray(feature.parameters)) {
        errors.push(`Feature ${feature.id} parameters must be an array`);
        continue;
      }

      const paramIds = new Set<string>();
      for (const param of feature.parameters) {
        if (!param.id || typeof param.id !== 'string') {
          errors.push(`Feature ${feature.id} parameter must have a valid ID`);
          continue;
        }

        if (!param.name || typeof param.name !== 'string') {
          errors.push(`Feature ${feature.id} parameter ${param.id} must have a valid name`);
        }

        if (!param.type || !['number', 'string', 'boolean'].includes(param.type)) {
          errors.push(`Feature ${feature.id} parameter ${param.id} must have a valid type`);
        }

        if (param.type === 'number') {
          if (param.min !== undefined && typeof param.min !== 'number') {
            errors.push(`Feature ${feature.id} parameter ${param.id} min must be a number`);
          }
          if (param.max !== undefined && typeof param.max !== 'number') {
            errors.push(`Feature ${feature.id} parameter ${param.id} max must be a number`);
          }
          if (param.min !== undefined && param.max !== undefined && param.min > param.max) {
            errors.push(`Feature ${feature.id} parameter ${param.id} min cannot be greater than max`);
          }
        }

        // Check for duplicate parameter IDs
        if (paramIds.has(param.id)) {
          errors.push(`Feature ${feature.id} has duplicate parameter ID: ${param.id}`);
        }
        paramIds.add(param.id);
      }
    }
  }
}

function validatePricing(pricing: DevicePricing, errors: string[]) {
  if (typeof pricing !== 'object') {
    errors.push('Pricing must be an object');
    return;
  }

  if (typeof pricing.baseRate !== 'number' || pricing.baseRate < 0) {
    errors.push('Pricing baseRate must be a non-negative number');
  }

  if (typeof pricing.featureRates !== 'object') {
    errors.push('Pricing featureRates must be an object');
    return;
  }

  for (const [feature, rate] of Object.entries(pricing.featureRates)) {
    if (typeof rate !== 'number' || rate < 0) {
      errors.push(`Pricing featureRate for ${feature} must be a non-negative number`);
    }
  }

  if (!pricing.currency || typeof pricing.currency !== 'string') {
    errors.push('Pricing must have a valid currency');
  }

  if (!pricing.billingPeriod || 
      !['hourly', 'daily', 'monthly'].includes(pricing.billingPeriod)) {
    errors.push('Pricing must have a valid billingPeriod');
  }

  if (pricing.minimumCharge !== undefined && 
      (typeof pricing.minimumCharge !== 'number' || pricing.minimumCharge < 0)) {
    errors.push('Pricing minimumCharge must be a non-negative number');
  }

  if (pricing.enterpriseDiscount !== undefined && 
      (typeof pricing.enterpriseDiscount !== 'number' || 
       pricing.enterpriseDiscount < 0 || 
       pricing.enterpriseDiscount > 1)) {
    errors.push('Pricing enterpriseDiscount must be a number between 0 and 1');
  }
}

function validateVersion(version: string, errors: string[]) {
  if (!version || typeof version !== 'string') {
    errors.push('Version must be a string');
    return;
  }

  // Validate semantic version format (major.minor.patch)
  const versionRegex = /^\d+\.\d+\.\d+$/;
  if (!versionRegex.test(version)) {
    errors.push('Version must be in semantic version format (e.g., 1.0.0)');
  }
}

function validateRequirements(requirements: any, errors: string[]) {
  if (requirements.minFirmware && typeof requirements.minFirmware !== 'string') {
    errors.push('Requirements minFirmware must be a string');
  }

  if (requirements.maxFirmware && typeof requirements.maxFirmware !== 'string') {
    errors.push('Requirements maxFirmware must be a string');
  }

  if (requirements.dependencies) {
    if (!Array.isArray(requirements.dependencies)) {
      errors.push('Requirements dependencies must be an array');
    } else {
      for (const dep of requirements.dependencies) {
        if (typeof dep !== 'string') {
          errors.push('Each dependency must be a string');
        }
      }
    }
  }

  // Validate firmware version format if present
  const firmwareRegex = /^\d+\.\d+\.\d+$/;
  if (requirements.minFirmware && !firmwareRegex.test(requirements.minFirmware)) {
    errors.push('Requirements minFirmware must be in semantic version format');
  }
  if (requirements.maxFirmware && !firmwareRegex.test(requirements.maxFirmware)) {
    errors.push('Requirements maxFirmware must be in semantic version format');
  }

  // Validate min/max firmware relationship
  if (requirements.minFirmware && requirements.maxFirmware) {
    const min = requirements.minFirmware.split('.').map(Number);
    const max = requirements.maxFirmware.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (min[i] > max[i]) {
        errors.push('Requirements minFirmware cannot be greater than maxFirmware');
        break;
      }
      if (min[i] < max[i]) break;
    }
  }
}
