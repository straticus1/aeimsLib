import { DeviceManager } from '../core/DeviceManager';
import { DeviceMode } from '../core/types/DeviceTypes';
import { DeviceError } from '../core/errors/DeviceError';
import { formatPrice } from '../util/formatting';

/**
 * Device Management Integration
 * 
 * This module provides integration points for the SexaComms CLI to interact with
 * the device management system. It uses the existing CLI architecture while
 * exposing device management capabilities.
 */
export class DeviceManagementIntegration {
  private manager: DeviceManager;

  constructor(mode: DeviceMode = DeviceMode.DEVELOPMENT) {
    this.manager = new DeviceManager(mode);
  }

  /**
   * Register device management commands with the CLI
   */
  static register(program: any) {
    const integration = new DeviceManagementIntegration();

    // Device management commands
    program
      .command('device:add <type> <name> [id]')
      .description('Add a new device')
      .action(async (type: string, name: string, id?: string) => {
        try {
          const device = await integration.addDevice(type, name, id);
          return {
            success: true,
            data: device,
            message: 'Device added successfully'
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof DeviceError ? error.message : 'Failed to add device',
            details: error
          };
        }
      });

    program
      .command('device:list')
      .description('List registered devices')
      .option('-t, --type <type>', 'filter by device type')
      .option('-f, --features <features>', 'filter by required features (comma-separated)')
      .action(async (options: any) => {
        try {
          const filter: any = {};
          if (options.type) filter.type = options.type;
          if (options.features) filter.features = options.features.split(',');

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
                baseRate: formatPrice(device.pricing.baseRate, device.pricing.currency),
                billingPeriod: device.pricing.billingPeriod
              }
            }))
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof DeviceError ? error.message : 'Failed to list devices',
            details: error
          };
        }
      });

    program
      .command('device:delete <id>')
      .description('Delete a device')
      .option('-f, --force', 'force deletion without confirmation')
      .action(async (id: string, options: any) => {
        try {
          await integration.deleteDevice(id, options.force);
          return {
            success: true,
            message: 'Device deleted successfully'
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof DeviceError ? error.message : 'Failed to delete device',
            details: error
          };
        }
      });

    program
      .command('device:promote <id>')
      .description('Set a device as the default')
      .action(async (id: string) => {
        try {
          const device = await integration.promoteDevice(id);
          return {
            success: true,
            data: device,
            message: 'Device promoted successfully'
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof DeviceError ? error.message : 'Failed to promote device',
            details: error
          };
        }
      });

    // Development mode commands
    program
      .command('device:features <type>')
      .description('List all features for a device type (development only)')
      .action(async (type: string) => {
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
        } catch (error) {
          return {
            success: false,
            error: error instanceof DeviceError ? error.message : 'Failed to get features',
            details: error
          };
        }
      });

    program
      .command('device:pricing <type>')
      .description('Show pricing details for a device type (development only)')
      .action(async (type: string) => {
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
              baseRate: formatPrice(pricing.baseRate, pricing.currency),
              billingPeriod: pricing.billingPeriod,
              featureRates: Object.fromEntries(
                Object.entries(pricing.featureRates).map(([k, v]) => [
                  k,
                  formatPrice(v, pricing.currency)
                ])
              ),
              minimumCharge: pricing.minimumCharge ? 
                formatPrice(pricing.minimumCharge, pricing.currency) : null,
              enterpriseDiscount: pricing.enterpriseDiscount ? 
                `${pricing.enterpriseDiscount * 100}%` : null
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof DeviceError ? error.message : 'Failed to get pricing',
            details: error
          };
        }
      });
  }

  /**
   * Add a new device
   */
  async addDevice(type: string, name: string, id?: string) {
    return await this.manager.addDevice({
      id: id || `${type}_${Date.now()}`,
      name,
      type
    });
  }

  /**
   * List devices with optional filtering
   */
  listDevices(filter?: any) {
    return this.manager.listDevices(filter);
  }

  /**
   * Delete a device
   */
  async deleteDevice(id: string, force: boolean = false) {
    // In non-force mode, device validation is done by the manager
    await this.manager.deleteDevice(id);
  }

  /**
   * Promote a device to default
   */
  async promoteDevice(id: string) {
    return await this.manager.promoteDevice(id);
  }

  /**
   * Get available features for a device type
   */
  async getFeatures(type: string) {
    return await this.manager.getAvailableFeatures(type);
  }

  /**
   * Get pricing for a device type
   */
  async getPricing(type: string) {
    return await this.manager.getPricing(type);
  }
}
