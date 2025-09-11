#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from './ConfigManager';
import Logger from '../utils/Logger';

const program = new Command();
const logger = Logger.getInstance();
const config = new ConfigManager();

program
  .name('aeims-config')
  .description('AEIMS Library Configuration Management Utility')
  .version('1.0.0');

program
  .command('check')
  .description('Check current configuration status')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    const spinner = ora('Checking configuration...').start();
    try {
      const status = await config.check(options.verbose);
      spinner.stop();
      
      if (status.valid) {
        console.log(chalk.green('✓ Configuration is valid'));
      } else {
        console.log(chalk.red('✗ Configuration has issues:'));
        status.issues.forEach(issue => {
          console.log(chalk.yellow(`  - ${issue}`));
        });
      }

      if (options.verbose) {
        console.log('\nCurrent Configuration:');
        console.log(JSON.stringify(status.config, null, 2));
      }
    } catch (error) {
      spinner.fail('Failed to check configuration');
      logger.error(`Configuration check failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('Verify configuration and test connectivity')
  .option('-s, --skip-tests', 'Skip running tests')
  .action(async (options) => {
    const spinner = ora('Verifying configuration...').start();
    try {
      const result = await config.verify(!options.skipTests);
      spinner.stop();

      if (result.success) {
        console.log(chalk.green('✓ Configuration verified successfully'));
      } else {
        console.log(chalk.red('✗ Configuration verification failed:'));
        result.errors.forEach(error => {
          console.log(chalk.yellow(`  - ${error}`));
        });
      }
    } catch (error) {
      spinner.fail('Failed to verify configuration');
      logger.error(`Configuration verification failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Setup initial configuration')
  .option('-f, --force', 'Force setup even if configuration exists')
  .option('-i, --interactive', 'Run setup in interactive mode')
  .action(async (options) => {
    const spinner = ora('Setting up configuration...').start();
    try {
      const result = await config.setup(options);
      spinner.stop();

      if (result.success) {
        console.log(chalk.green('✓ Configuration setup completed'));
        console.log('\nConfiguration saved to:', result.configPath);
      } else {
        console.log(chalk.red('✗ Configuration setup failed:'));
        console.log(chalk.yellow(`  ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Failed to setup configuration');
      logger.error(`Configuration setup failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('configure')
  .description('Configure specific settings')
  .option('-s, --setting <setting>', 'Setting to configure')
  .option('-v, --value <value>', 'Value to set')
  .option('-i, --interactive', 'Configure in interactive mode')
  .action(async (options) => {
    try {
      if (options.interactive) {
        await config.configureInteractive();
      } else if (options.setting && options.value) {
        const result = await config.configure(options.setting, options.value);
        if (result.success) {
          console.log(chalk.green(`✓ Setting '${options.setting}' updated`));
        } else {
          console.log(chalk.red(`✗ Failed to update setting: ${result.error}`));
          process.exit(1);
        }
      } else {
        console.log(chalk.yellow('Please provide --setting and --value or use --interactive'));
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Configuration failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Run configuration tests')
  .option('-t, --test <test>', 'Specific test to run')
  .option('-v, --verbose', 'Show detailed test output')
  .action(async (options) => {
    const spinner = ora('Running tests...').start();
    try {
      const results = await config.runTests(options.test, options.verbose);
      spinner.stop();

      console.log('\nTest Results:');
      results.forEach(result => {
        if (result.passed) {
          console.log(chalk.green(`✓ ${result.name}`));
        } else {
          console.log(chalk.red(`✗ ${result.name}`));
          console.log(chalk.yellow(`  ${result.error}`));
        }

        if (options.verbose && result.details) {
          console.log(chalk.gray(JSON.stringify(result.details, null, 2)));
        }
      });

      if (results.some(r => !r.passed)) {
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Tests failed');
      logger.error(`Test execution failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('remove')
  .description('Remove specific configuration')
  .argument('<setting>', 'Setting to remove')
  .option('-f, --force', 'Force removal without confirmation')
  .action(async (setting, options) => {
    try {
      if (!options.force) {
        // Add confirmation prompt
      }
      
      const result = await config.remove(setting);
      if (result.success) {
        console.log(chalk.green(`✓ Setting '${setting}' removed`));
      } else {
        console.log(chalk.red(`✗ Failed to remove setting: ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Removal failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('install')
  .description('Install configuration from template or file')
  .argument('<source>', 'Template name or file path')
  .option('-f, --force', 'Force install even if configuration exists')
  .action(async (source, options) => {
    const spinner = ora('Installing configuration...').start();
    try {
      const result = await config.install(source, options);
      spinner.stop();

      if (result.success) {
        console.log(chalk.green('✓ Configuration installed successfully'));
        console.log('\nInstalled from:', source);
        console.log('Configuration path:', result.configPath);
      } else {
        console.log(chalk.red('✗ Installation failed:'));
        console.log(chalk.yellow(`  ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Installation failed');
      logger.error(`Configuration installation failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('uninstall')
  .description('Uninstall configuration')
  .option('-f, --force', 'Force uninstall without confirmation')
  .action(async (options) => {
    try {
      if (!options.force) {
        // Add confirmation prompt
      }

      const spinner = ora('Uninstalling configuration...').start();
      const result = await config.uninstall();
      spinner.stop();

      if (result.success) {
        console.log(chalk.green('✓ Configuration uninstalled successfully'));
      } else {
        console.log(chalk.red('✗ Uninstallation failed:'));
        console.log(chalk.yellow(`  ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Uninstallation failed: ${error}`);
      process.exit(1);
    }
  });

// Add help command with detailed documentation
program
  .command('help [command]')
  .description('Display help information')
  .action((commandName) => {
    if (commandName) {
      const command = program.commands.find(cmd => cmd.name() === commandName);
      if (command) {
        command.help();
      } else {
        console.log(chalk.red(`Unknown command: ${commandName}`));
        program.help();
      }
    } else {
      program.help();
    }
  });

program.parse();
