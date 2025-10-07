import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { DeviceFeature, DevicePricing } from '../types/DeviceTypes';
import { validateConfig } from './validation';
import { DeviceError, ErrorType } from '../errors/DeviceError';

// Re-export types for external use
export { DeviceFeature, DevicePricing };

/**
 * Device configuration interface
 */
export interface DeviceTypeConfig {
  type: string;
  name: string;
  description: string;
  version: string;
  features: DeviceFeature[];
  pricing: DevicePricing;
  requirements?: {
    minFirmware?: string;
    maxFirmware?: string;
    dependencies?: string[];
  };
}

/**
 * Device configuration manager
 */
export class DeviceConfig {
  private static configCache: Map<string, DeviceTypeConfig> = new Map();
  private static configPath: string = process.env.DEVICE_CONFIG_PATH || 
    join(process.cwd(), 'config', 'devices');

  /**
   * Load and validate device configuration
   */
  static async getDeviceConfig(type: string): Promise<DeviceTypeConfig> {
    // Check cache first
    const cached = this.configCache.get(type);
    if (cached) return cached;

    try {
      // Load configuration file
      const configFile = join(this.configPath, `${type}.json`);
      const configData = await readFile(configFile, 'utf8');
      const config: DeviceTypeConfig = JSON.parse(configData);

      // Validate configuration
      const validationResult = validateConfig(config);
      if (!validationResult.valid) {
        throw new DeviceError(
          ErrorType.CONFIGURATION_ERROR,
          `Invalid configuration for device type ${type}: ${validationResult.errors.join(', ')}`
        );
      }

      // Cache and return
      this.configCache.set(type, config);
      return config;

    } catch (error) {
      if (error instanceof DeviceError) throw error;
      
      throw new DeviceError(
        ErrorType.CONFIGURATION_ERROR,
        `Failed to load configuration for device type ${type}: ${error.message}`
      );
    }
  }

  /**
   * Get all available device types
   */
  static async getAvailableDeviceTypes(): Promise<string[]> {
    try {
      const files = await readdir(this.configPath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      throw new DeviceError(
        ErrorType.CONFIGURATION_ERROR,
        `Failed to list device configurations: ${(error as Error).message}`
      );
    }
  }

  /**
   * Set custom configuration path
   */
  static setConfigPath(path: string) {
    this.configPath = path;
    this.configCache.clear();
  }

  /**
   * Clear configuration cache
   */
  static clearCache() {
    this.configCache.clear();
  }
}
