"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceConfig = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const validation_1 = require("./validation");
const DeviceError_1 = require("../errors/DeviceError");
/**
 * Device configuration manager
 */
class DeviceConfig {
    /**
     * Load and validate device configuration
     */
    static async getDeviceConfig(type) {
        // Check cache first
        const cached = this.configCache.get(type);
        if (cached)
            return cached;
        try {
            // Load configuration file
            const configFile = (0, path_1.join)(this.configPath, `${type}.json`);
            const configData = await (0, promises_1.readFile)(configFile, 'utf8');
            const config = JSON.parse(configData);
            // Validate configuration
            const validationResult = (0, validation_1.validateConfig)(config);
            if (!validationResult.valid) {
                throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.CONFIGURATION_ERROR, `Invalid configuration for device type ${type}: ${validationResult.errors.join(', ')}`);
            }
            // Cache and return
            this.configCache.set(type, config);
            return config;
        }
        catch (error) {
            if (error instanceof DeviceError_1.DeviceError)
                throw error;
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.CONFIGURATION_ERROR, `Failed to load configuration for device type ${type}: ${error.message}`);
        }
    }
    /**
     * Get all available device types
     */
    static async getAvailableDeviceTypes() {
        try {
            const files = await (0, promises_1.readFile)(this.configPath);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
        }
        catch (error) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.CONFIGURATION_ERROR, `Failed to list device configurations: ${error.message}`);
        }
    }
    /**
     * Set custom configuration path
     */
    static setConfigPath(path) {
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
exports.DeviceConfig = DeviceConfig;
DeviceConfig.configCache = new Map();
DeviceConfig.configPath = process.env.DEVICE_CONFIG_PATH ||
    (0, path_1.join)(process.cwd(), 'config', 'devices');
//# sourceMappingURL=DeviceConfig.js.map