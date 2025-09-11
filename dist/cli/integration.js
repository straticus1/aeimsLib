"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceManagementIntegration = void 0;
const DeviceManager_1 = require("../core/DeviceManager");
const DeviceTypes_1 = require("../core/types/DeviceTypes");
const DeviceError_1 = require("../core/errors/DeviceError");
const formatting_1 = require("../util/formatting");
/**
 * Device Management Integration
 *
 * This module provides integration points for the SexaComms CLI to interact with
 * the device management system. It uses the existing CLI architecture while
 * exposing device management capabilities.
 */
class DeviceManagementIntegration {
    constructor(mode = DeviceTypes_1.DeviceMode.DEVELOPMENT) {
        this.manager = new DeviceManager_1.DeviceManager(mode);
    }
    /**
     * Register device management commands with the CLI
     */
    static register(program) {
        const integration = new DeviceManagementIntegration();
        // Device management commands
        program
            .command('device:add <type> <name> [id]')
            .description('Add a new device')
            .action(async (type, name, id) => {
            try {
                const device = await integration.addDevice(type, name, id);
                return {
                    success: true,
                    data: device,
                    message: 'Device added successfully'
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to add device',
                    details: error
                };
            }
        });
        program
            .command('device:list')
            .description('List registered devices')
            .option('-t, --type <type>', 'filter by device type')
            .option('-f, --features <features>', 'filter by required features (comma-separated)')
            .action(async (options) => {
            try {
                const filter = {};
                if (options.type)
                    filter.type = options.type;
                if (options.features)
                    filter.features = options.features.split(',');
                const devices = integration.listDevices(filter);
                return {
                    success: true,
                    data: devices.map(device => ({
                        id: device.id,
                        name: device.name,
                        type: device.type,
                        mode: device.mode,
                        isDefault: device.isDefault,
                        features: device.features.map(f => ({
                            id: f.id,
                            name: f.name,
                            experimental: f.experimental
                        })),
                        pricing: {
                            baseRate: (0, formatting_1.formatPrice)(device.pricing.baseRate, device.pricing.currency),
                            billingPeriod: device.pricing.billingPeriod
                        }
                    }))
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to list devices',
                    details: error
                };
            }
        });
        program
            .command('device:delete <id>')
            .description('Delete a device')
            .option('-f, --force', 'force deletion without confirmation')
            .action(async (id, options) => {
            try {
                await integration.deleteDevice(id, options.force);
                return {
                    success: true,
                    message: 'Device deleted successfully'
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to delete device',
                    details: error
                };
            }
        });
        program
            .command('device:promote <id>')
            .description('Set a device as the default')
            .action(async (id) => {
            try {
                const device = await integration.promoteDevice(id);
                return {
                    success: true,
                    data: device,
                    message: 'Device promoted successfully'
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to promote device',
                    details: error
                };
            }
        });
        // Development mode commands
        program
            .command('device:features <type>')
            .description('List all features for a device type (development only)')
            .action(async (type) => {
            if (process.env.NODE_ENV !== 'development') {
                return {
                    success: false,
                    error: 'This command is only available in development mode'
                };
            }
            try {
                const features = await integration.getFeatures(type);
                return {
                    success: true,
                    data: features
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to get features',
                    details: error
                };
            }
        });
        program
            .command('device:pricing <type>')
            .description('Show pricing details for a device type (development only)')
            .action(async (type) => {
            if (process.env.NODE_ENV !== 'development') {
                return {
                    success: false,
                    error: 'This command is only available in development mode'
                };
            }
            try {
                const pricing = await integration.getPricing(type);
                return {
                    success: true,
                    data: {
                        baseRate: (0, formatting_1.formatPrice)(pricing.baseRate, pricing.currency),
                        billingPeriod: pricing.billingPeriod,
                        featureRates: Object.fromEntries(Object.entries(pricing.featureRates).map(([k, v]) => [
                            k,
                            (0, formatting_1.formatPrice)(v, pricing.currency)
                        ])),
                        minimumCharge: pricing.minimumCharge ?
                            (0, formatting_1.formatPrice)(pricing.minimumCharge, pricing.currency) : null,
                        enterpriseDiscount: pricing.enterpriseDiscount ?
                            `${pricing.enterpriseDiscount * 100}%` : null
                    }
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to get pricing',
                    details: error
                };
            }
        });
    }
    /**
     * Add a new device
     */
    async addDevice(type, name, id) {
        return await this.manager.addDevice({
            id: id || `${type}_${Date.now()}`,
            name,
            type
        });
    }
    /**
     * List devices with optional filtering
     */
    listDevices(filter) {
        return this.manager.listDevices(filter);
    }
    /**
     * Delete a device
     */
    async deleteDevice(id, force = false) {
        // In non-force mode, device validation is done by the manager
        await this.manager.deleteDevice(id);
    }
    /**
     * Promote a device to default
     */
    async promoteDevice(id) {
        return await this.manager.promoteDevice(id);
    }
    /**
     * Get available features for a device type
     */
    async getFeatures(type) {
        return await this.manager.getAvailableFeatures(type);
    }
    /**
     * Get pricing for a device type
     */
    async getPricing(type) {
        return await this.manager.getPricing(type);
    }
}
exports.DeviceManagementIntegration = DeviceManagementIntegration;
//# sourceMappingURL=integration.js.map