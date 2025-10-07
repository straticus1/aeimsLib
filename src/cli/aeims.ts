#!/usr/bin/env node
import { Command } from 'commander';
const program = new Command();
import chalk from 'chalk';
import ora from 'ora';
import { DeviceManager } from '../core/DeviceManager';
import { DeviceMode } from '../core/types/DeviceTypes';
import { DeviceError } from '../core/errors/DeviceError';
import { AuditLogger } from '../core/logging/AuditLogger';
import { formatPrice } from '../util/formatting';

const manager = new DeviceManager();
const logger = new AuditLogger();

program
  .name('aeims')
  .description('AEIMS Device Management CLI')
  .version('1.0.0');

program
  .option('-m, --mode <mode>', 'operating mode (development|production)', 'development')
  .option('-d, --debug', 'enable debug output', false)
  .hook('preAction', async (thisCommand) => {
    // Validate and set mode
    const mode = thisCommand.opts().mode.toLowerCase();
    if (!['development', 'production'].includes(mode)) {
      console.error(chalk.red(`Invalid mode: ${mode}`));
      process.exit(1);
    }
    
    await manager.setMode(mode === 'development' ? DeviceMode.DEVELOPMENT : DeviceMode.PRODUCTION);
  });

/**
 * Add device
 */
program
  .command('add')
  .description('Add a new device')
  .argument('<type>', 'device type')
  .argument('<name>', 'device name')
  .argument('[id]', 'device ID (optional, will be generated if not provided)')
  .action(async (type: string, name: string, id?: string) => {
    const spinner = ora('Adding device...').start();
    
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
      console.log(chalk.bold('ID: ') + device.id);
      console.log(chalk.bold('Name: ') + device.name);
      console.log(chalk.bold('Type: ') + device.type);
      console.log(chalk.bold('Mode: ') + device.mode);
      
      console.log('\nFeatures:');
      device.features.forEach(feature => {
        console.log(`- ${feature.name}`);
        if (feature.experimental) {
          console.log(chalk.yellow('  (Experimental)'));
        }
      });

      console.log('\nPricing:');
      console.log(chalk.bold('Base Rate: ') + formatPrice(device.pricing.baseRate, device.pricing.currency));
      console.log(chalk.bold('Billing Period: ') + device.pricing.billingPeriod);
      
      if (device.isDefault) {
        console.log(chalk.green('\nThis is now the default device'));
      }

    } catch (error) {
      spinner.fail(error instanceof DeviceError ? error.message : 'Failed to add device');
      if (program.opts().debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });

/**
 * List devices
 */
program
  .command('list')
  .description('List registered devices')
  .option('-t, --type <type>', 'filter by device type')
  .option('-f, --features <features>', 'filter by required features (comma-separated)')
  .action(async (options) => {
    try {
      // Parse filters
      const filter: any = {};
      if (options.type) {
        filter.type = options.type;
      }
      if (options.features) {
        filter.features = options.features.split(',');
      }

      const devices = manager.listDevices(filter);

      if (devices.length === 0) {
        console.log(chalk.yellow('No devices found'));
        return;
      }

      console.log(chalk.bold('\nRegistered Devices:'));
      console.log('===================\n');

      devices.forEach(device => {
        console.log(
          chalk.bold(device.name) +
          (device.isDefault ? chalk.green(' (Default)') : '')
        );
        console.log(chalk.gray(`ID: ${device.id}`));
        console.log(chalk.gray(`Type: ${device.type}`));
        console.log(chalk.gray(`Mode: ${device.mode}`));
        
        console.log('\nFeatures:');
        device.features.forEach(feature => {
          console.log(`- ${feature.name}`);
          if (feature.experimental) {
            console.log(chalk.yellow('  (Experimental)'));
          }
        });

        console.log('\nPricing:');
        console.log(`Base Rate: ${formatPrice(device.pricing.baseRate, device.pricing.currency)}`);
        console.log(`Billing Period: ${device.pricing.billingPeriod}`);
        
        console.log('\n-------------------\n');
      });

    } catch (error) {
      console.error(chalk.red(error instanceof DeviceError ? error.message : 'Failed to list devices'));
      if (program.opts().debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });

/**
 * Delete device
 */
program
  .command('delete')
  .description('Delete a device')
  .argument('<id>', 'device ID')
  .option('-f, --force', 'force deletion without confirmation')
  .action(async (id: string, options) => {
    try {
      // Get device first
      const device = manager.listDevices().find(d => d.id === id);
      if (!device) {
        console.error(chalk.red(`Device ${id} not found`));
        process.exit(1);
      }

      // Confirm deletion unless forced
      if (!options.force) {
        console.log(chalk.yellow('Warning: This action cannot be undone.'));
        console.log(`\nDevice to delete:`);
        console.log(chalk.bold('Name: ') + device.name);
        console.log(chalk.bold('ID: ') + device.id);
        console.log(chalk.bold('Type: ') + device.type);
        
        if (device.isDefault) {
          console.log(chalk.yellow('\nThis is currently the default device.'));
        }

        const confirmed = await confirm('Are you sure you want to delete this device?');
        if (!confirmed) {
          console.log('Operation cancelled');
          return;
        }
      }

      const spinner = ora('Deleting device...').start();
      await manager.deleteDevice(id);
      spinner.succeed('Device deleted successfully');

    } catch (error) {
      console.error(chalk.red(error instanceof DeviceError ? error.message : 'Failed to delete device'));
      if (program.opts().debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });

/**
 * Promote device
 */
program
  .command('promote')
  .description('Set a device as the default')
  .argument('<id>', 'device ID')
  .action(async (id: string) => {
    const spinner = ora('Promoting device...').start();
    
    try {
      const device = await manager.promoteDevice(id);
      spinner.succeed('Device promoted successfully');
      
      console.log('\nNew Default Device:');
      console.log(chalk.bold('Name: ') + device.name);
      console.log(chalk.bold('ID: ') + device.id);
      console.log(chalk.bold('Type: ') + device.type);

    } catch (error) {
      spinner.fail(error instanceof DeviceError ? error.message : 'Failed to promote device');
      if (program.opts().debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });

/**
 * Debug commands (only available in development mode)
 */
if (process.env.NODE_ENV === 'development') {
  program
    .command('debug')
    .description('Debug commands (development only)')
    .command('features <type>')
    .description('List all features for a device type')
    .action(async (type: string) => {
      try {
        const features = await manager.getAvailableFeatures(type);
        
        console.log(chalk.bold(`\nFeatures for ${type}:`));
        features.forEach(feature => {
          console.log(`\n${chalk.bold(feature.name)}`);
          console.log(chalk.gray(feature.description));
          
          if (feature.experimental) {
            console.log(chalk.yellow('(Experimental)'));
          }
          if (feature.requiresAuth) {
            console.log(chalk.red('(Requires Authentication)'));
          }

          if (feature.parameters && feature.parameters.length > 0) {
            console.log('\nParameters:');
            feature.parameters.forEach(param => {
              console.log(`- ${param.name} (${param.type})`);
              if (param.min !== undefined || param.max !== undefined) {
                console.log(
                  chalk.gray(`  Range: ${param.min || '-∞'} to ${param.max || '∞'}`)
                );
              }
            });
          }
        });

      } catch (error) {
        console.error(chalk.red(error instanceof DeviceError ? error.message : 'Command failed'));
        if (program.opts().debug) {
          console.error(error);
        }
        process.exit(1);
      }
    });

  program
    .command('debug')
    .command('pricing <type>')
    .description('Show pricing details for a device type')
    .action(async (type: string) => {
      try {
        const pricing = await manager.getPricing(type);
        
        console.log(chalk.bold(`\nPricing for ${type}:`));
        console.log(chalk.bold('Base Rate: ') + 
          formatPrice(pricing.baseRate, pricing.currency));
        console.log(chalk.bold('Billing Period: ') + pricing.billingPeriod);
        
        if (pricing.minimumCharge) {
          console.log(chalk.bold('Minimum Charge: ') + 
            formatPrice(pricing.minimumCharge, pricing.currency));
        }
        
        if (pricing.enterpriseDiscount) {
          console.log(chalk.bold('Enterprise Discount: ') + 
            `${pricing.enterpriseDiscount * 100}%`);
        }

        console.log('\nFeature Rates:');
        Object.entries(pricing.featureRates).forEach(([feature, rate]) => {
          console.log(`${feature}: ${formatPrice(rate, pricing.currency)}`);
        });

      } catch (error) {
        console.error(chalk.red(error instanceof DeviceError ? error.message : 'Command failed'));
        if (program.opts().debug) {
          console.error(error);
        }
        process.exit(1);
      }
    });
}

// Helper for prompting confirmation
async function confirm(message: string): Promise<boolean> {
  const { default: inquirer } = await import('inquirer');
  const answers = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message,
    default: false
  }]);
  return answers.confirmed;
}

program.parse();
