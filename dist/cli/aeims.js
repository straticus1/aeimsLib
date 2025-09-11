#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const DeviceManager_1 = require("../core/DeviceManager");
const DeviceTypes_1 = require("../core/types/DeviceTypes");
const DeviceError_1 = require("../core/errors/DeviceError");
const AuditLogger_1 = require("../core/logging/AuditLogger");
const formatting_1 = require("../util/formatting");
const manager = new DeviceManager_1.DeviceManager();
const logger = new AuditLogger_1.AuditLogger();
commander_1.program
    .name('aeims')
    .description('AEIMS Device Management CLI')
    .version('1.0.0');
commander_1.program
    .option('-m, --mode <mode>', 'operating mode (development|production)', 'development')
    .option('-d, --debug', 'enable debug output', false)
    .hook('preAction', async (thisCommand) => {
    // Validate and set mode
    const mode = thisCommand.opts().mode.toLowerCase();
    if (!['development', 'production'].includes(mode)) {
        console.error(chalk_1.default.red(`Invalid mode: ${mode}`));
        process.exit(1);
    }
    await manager.setMode(mode === 'development' ? DeviceTypes_1.DeviceMode.DEVELOPMENT : DeviceTypes_1.DeviceMode.PRODUCTION);
});
/**
 * Add device
 */
commander_1.program
    .command('add')
    .description('Add a new device')
    .argument('<type>', 'device type')
    .argument('<name>', 'device name')
    .argument('[id]', 'device ID (optional, will be generated if not provided)')
    .action(async (type, name, id) => {
    const spinner = (0, ora_1.default)('Adding device...').start();
    try {
        // Generate ID if not provided
        const deviceId = id || `${type}_${Date.now()}`;
        // Add device
        const device = await manager.addDevice({
            id: deviceId,
            name,
            type
        });
        spinner.succeed('Device added successfully');
        // Display device info
        console.log('\nDevice Details:');
        console.log(chalk_1.default.bold('ID: ') + device.id);
        console.log(chalk_1.default.bold('Name: ') + device.name);
        console.log(chalk_1.default.bold('Type: ') + device.type);
        console.log(chalk_1.default.bold('Mode: ') + device.mode);
        console.log('\nFeatures:');
        device.features.forEach(feature => {
            console.log(`- ${feature.name}`);
            if (feature.experimental) {
                console.log(chalk_1.default.yellow('  (Experimental)'));
            }
        });
        console.log('\nPricing:');
        console.log(chalk_1.default.bold('Base Rate: ') + (0, formatting_1.formatPrice)(device.pricing.baseRate, device.pricing.currency));
        console.log(chalk_1.default.bold('Billing Period: ') + device.pricing.billingPeriod);
        if (device.isDefault) {
            console.log(chalk_1.default.green('\nThis is now the default device'));
        }
    }
    catch (error) {
        spinner.fail(error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to add device');
        if (commander_1.program.opts().debug) {
            console.error(error);
        }
        process.exit(1);
    }
});
/**
 * List devices
 */
commander_1.program
    .command('list')
    .description('List registered devices')
    .option('-t, --type <type>', 'filter by device type')
    .option('-f, --features <features>', 'filter by required features (comma-separated)')
    .action(async (options) => {
    try {
        // Parse filters
        const filter = {};
        if (options.type) {
            filter.type = options.type;
        }
        if (options.features) {
            filter.features = options.features.split(',');
        }
        const devices = manager.listDevices(filter);
        if (devices.length === 0) {
            console.log(chalk_1.default.yellow('No devices found'));
            return;
        }
        console.log(chalk_1.default.bold('\nRegistered Devices:'));
        console.log('===================\n');
        devices.forEach(device => {
            console.log(chalk_1.default.bold(device.name) +
                (device.isDefault ? chalk_1.default.green(' (Default)') : ''));
            console.log(chalk_1.default.gray(`ID: ${device.id}`));
            console.log(chalk_1.default.gray(`Type: ${device.type}`));
            console.log(chalk_1.default.gray(`Mode: ${device.mode}`));
            console.log('\nFeatures:');
            device.features.forEach(feature => {
                console.log(`- ${feature.name}`);
                if (feature.experimental) {
                    console.log(chalk_1.default.yellow('  (Experimental)'));
                }
            });
            console.log('\nPricing:');
            console.log(`Base Rate: ${(0, formatting_1.formatPrice)(device.pricing.baseRate, device.pricing.currency)}`);
            console.log(`Billing Period: ${device.pricing.billingPeriod}`);
            console.log('\n-------------------\n');
        });
    }
    catch (error) {
        console.error(chalk_1.default.red(error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to list devices'));
        if (commander_1.program.opts().debug) {
            console.error(error);
        }
        process.exit(1);
    }
});
/**
 * Delete device
 */
commander_1.program
    .command('delete')
    .description('Delete a device')
    .argument('<id>', 'device ID')
    .option('-f, --force', 'force deletion without confirmation')
    .action(async (id, options) => {
    try {
        // Get device first
        const device = manager.listDevices().find(d => d.id === id);
        if (!device) {
            console.error(chalk_1.default.red(`Device ${id} not found`));
            process.exit(1);
        }
        // Confirm deletion unless forced
        if (!options.force) {
            console.log(chalk_1.default.yellow('Warning: This action cannot be undone.'));
            console.log(`\nDevice to delete:`);
            console.log(chalk_1.default.bold('Name: ') + device.name);
            console.log(chalk_1.default.bold('ID: ') + device.id);
            console.log(chalk_1.default.bold('Type: ') + device.type);
            if (device.isDefault) {
                console.log(chalk_1.default.yellow('\nThis is currently the default device.'));
            }
            const confirmed = await confirm('Are you sure you want to delete this device?');
            if (!confirmed) {
                console.log('Operation cancelled');
                return;
            }
        }
        const spinner = (0, ora_1.default)('Deleting device...').start();
        await manager.deleteDevice(id);
        spinner.succeed('Device deleted successfully');
    }
    catch (error) {
        console.error(chalk_1.default.red(error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to delete device'));
        if (commander_1.program.opts().debug) {
            console.error(error);
        }
        process.exit(1);
    }
});
/**
 * Promote device
 */
commander_1.program
    .command('promote')
    .description('Set a device as the default')
    .argument('<id>', 'device ID')
    .action(async (id) => {
    const spinner = (0, ora_1.default)('Promoting device...').start();
    try {
        const device = await manager.promoteDevice(id);
        spinner.succeed('Device promoted successfully');
        console.log('\nNew Default Device:');
        console.log(chalk_1.default.bold('Name: ') + device.name);
        console.log(chalk_1.default.bold('ID: ') + device.id);
        console.log(chalk_1.default.bold('Type: ') + device.type);
    }
    catch (error) {
        spinner.fail(error instanceof DeviceError_1.DeviceError ? error.message : 'Failed to promote device');
        if (commander_1.program.opts().debug) {
            console.error(error);
        }
        process.exit(1);
    }
});
/**
 * Debug commands (only available in development mode)
 */
if (process.env.NODE_ENV === 'development') {
    commander_1.program
        .command('debug')
        .description('Debug commands (development only)')
        .command('features <type>')
        .description('List all features for a device type')
        .action(async (type) => {
        try {
            const features = await manager.getAvailableFeatures(type);
            console.log(chalk_1.default.bold(`\nFeatures for ${type}:`));
            features.forEach(feature => {
                console.log(`\n${chalk_1.default.bold(feature.name)}`);
                console.log(chalk_1.default.gray(feature.description));
                if (feature.experimental) {
                    console.log(chalk_1.default.yellow('(Experimental)'));
                }
                if (feature.requiresAuth) {
                    console.log(chalk_1.default.red('(Requires Authentication)'));
                }
                if (feature.parameters && feature.parameters.length > 0) {
                    console.log('\nParameters:');
                    feature.parameters.forEach(param => {
                        console.log(`- ${param.name} (${param.type})`);
                        if (param.min !== undefined || param.max !== undefined) {
                            console.log(chalk_1.default.gray(`  Range: ${param.min || '-∞'} to ${param.max || '∞'}`));
                        }
                    });
                }
            });
        }
        catch (error) {
            console.error(chalk_1.default.red(error instanceof DeviceError_1.DeviceError ? error.message : 'Command failed'));
            if (commander_1.program.opts().debug) {
                console.error(error);
            }
            process.exit(1);
        }
    });
    commander_1.program
        .command('debug')
        .command('pricing <type>')
        .description('Show pricing details for a device type')
        .action(async (type) => {
        try {
            const pricing = await manager.getPricing(type);
            console.log(chalk_1.default.bold(`\nPricing for ${type}:`));
            console.log(chalk_1.default.bold('Base Rate: ') +
                (0, formatting_1.formatPrice)(pricing.baseRate, pricing.currency));
            console.log(chalk_1.default.bold('Billing Period: ') + pricing.billingPeriod);
            if (pricing.minimumCharge) {
                console.log(chalk_1.default.bold('Minimum Charge: ') +
                    (0, formatting_1.formatPrice)(pricing.minimumCharge, pricing.currency));
            }
            if (pricing.enterpriseDiscount) {
                console.log(chalk_1.default.bold('Enterprise Discount: ') +
                    `${pricing.enterpriseDiscount * 100}%`);
            }
            console.log('\nFeature Rates:');
            Object.entries(pricing.featureRates).forEach(([feature, rate]) => {
                console.log(`${feature}: ${(0, formatting_1.formatPrice)(rate, pricing.currency)}`);
            });
        }
        catch (error) {
            console.error(chalk_1.default.red(error instanceof DeviceError_1.DeviceError ? error.message : 'Command failed'));
            if (commander_1.program.opts().debug) {
                console.error(error);
            }
            process.exit(1);
        }
    });
}
// Helper for prompting confirmation
async function confirm(message) {
    const { default: inquirer } = await Promise.resolve().then(() => __importStar(require('inquirer')));
    const answers = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmed',
            message,
            default: false
        }]);
    return answers.confirmed;
}
commander_1.program.parse();
//# sourceMappingURL=aeims.js.map