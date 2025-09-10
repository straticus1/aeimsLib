#!/usr/bin/env node

import { program } from 'commander';
import { DeviceManager } from '../../devices/DeviceManager';
import { DeviceMonitoring } from '../../monitoring';
import { PatternDesigner } from '../gui/PatternDesigner';
import { DeviceSimulator, SimulatorConfig } from '../simulator/DeviceSimulator';
import { ProtocolAnalyzer } from '../analyzer/ProtocolAnalyzer';
import { createDevicePattern } from '../../devices/experimental/patterns';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

program
  .name('aeims')
  .description('AeimsLib Command Line Interface')
  .version('2.2.0');

/**
 * Device Management Commands
 */
program
  .command('devices')
  .description('List available devices')
  .option('-t, --type <type>', 'Filter by device type')
  .option('-s, --status <status>', 'Filter by connection status')
  .action(async (options) => {
    const manager = DeviceManager.getInstance();
    const devices = manager.getDevices().filter(device => {
      if (options.type && device.info.type !== options.type) return false;
      if (options.status === 'connected' && !device.isConnected()) return false;
      if (options.status === 'disconnected' && device.isConnected()) return false;
      return true;
    });

    console.log('\nAvailable Devices:');
    devices.forEach(device => {
      const status = device.isConnected() ?
        chalk.green('Connected') :
        chalk.red('Disconnected');
      console.log(`- ${device.info.name} (${device.info.id}): ${status}`);
    });
  });

program
  .command('connect <deviceId>')
  .description('Connect to a device')
  .option('-t, --type <type>', 'Device type for new connections')
  .action(async (deviceId, options) => {
    const spinner = ora('Connecting to device...').start();
    try {
      const manager = DeviceManager.getInstance();
      const device = manager.getDevice(deviceId) ||
        await manager.createDevice(deviceId, options.type);

      await device.connect();
      spinner.succeed(`Connected to ${device.info.name}`);

      const monitor = new DeviceMonitoring(deviceId);
      monitor.onConnect();
    } catch (error) {
      spinner.fail(`Failed to connect: ${error.message}`);
    }
  });

program
  .command('disconnect <deviceId>')
  .description('Disconnect from a device')
  .action(async (deviceId) => {
    const spinner = ora('Disconnecting device...').start();
    try {
      const manager = DeviceManager.getInstance();
      const device = manager.getDevice(deviceId);
      if (!device) {
        spinner.fail('Device not found');
        return;
      }

      await device.disconnect();
      spinner.succeed('Device disconnected');

      const monitor = new DeviceMonitoring(deviceId);
      monitor.onDisconnect();
    } catch (error) {
      spinner.fail(`Failed to disconnect: ${error.message}`);
    }
  });

/**
 * Pattern Management Commands
 */
program
  .command('pattern')
  .description('Pattern management commands')
  .addCommand(
    program
      .command('create')
      .description('Create a new pattern')
      .option('-t, --type <type>', 'Pattern type')
      .option('-d, --device <device>', 'Target device type')
      .option('-p, --params <params>', 'Pattern parameters (JSON)')
      .action(async (options) => {
        try {
          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'type',
              message: 'Select pattern type:',
              choices: ['wave', 'sequence', 'ramp', 'custom'],
              when: !options.type
            },
            {
              type: 'input',
              name: 'device',
              message: 'Enter target device type:',
              when: !options.device
            }
          ]);

          const type = options.type || answers.type;
          const device = options.device || answers.device;
          const params = options.params ? JSON.parse(options.params) : {};

          const pattern = createDevicePattern(device, type, params);
          console.log('\nPattern created:');
          console.log(JSON.stringify(pattern, null, 2));
        } catch (error) {
          console.error(chalk.red(`Error creating pattern: ${error.message}`));
        }
      })
  )
  .addCommand(
    program
      .command('validate')
      .description('Validate a pattern')
      .argument('<pattern>', 'Pattern JSON or file path')
      .action((pattern) => {
        try {
          const designer = new PatternDesigner();
          const patternObj = typeof pattern === 'string' ?
            JSON.parse(pattern) : pattern;

          const validation = designer.validatePattern();
          if (validation.valid) {
            console.log(chalk.green('Pattern is valid ✓'));
          } else {
            console.log(chalk.red('Pattern validation failed:'));
            validation.errors.forEach(error => {
              console.log(chalk.red(`- ${error}`));
            });
          }

          if (validation.warnings.length > 0) {
            console.log(chalk.yellow('\nWarnings:'));
            validation.warnings.forEach(warning => {
              console.log(chalk.yellow(`- ${warning}`));
            });
          }
        } catch (error) {
          console.error(chalk.red(`Error validating pattern: ${error.message}`));
        }
      })
  );

/**
 * Device Simulation Commands
 */
program
  .command('simulate')
  .description('Device simulation commands')
  .addCommand(
    program
      .command('start')
      .description('Start device simulation')
      .argument('<deviceType>', 'Type of device to simulate')
      .option('-c, --config <config>', 'Simulator configuration (JSON)')
      .action(async (deviceType, options) => {
        try {
          const config: SimulatorConfig = options.config ?
            JSON.parse(options.config) : {};

          const simulator = new DeviceSimulator({
            id: `sim_${Date.now()}`,
            name: `Simulated ${deviceType}`,
            type: deviceType
          }, config);

          console.log('\nStarting device simulation...');
          await simulator.connect();

          simulator.on('stateChanged', state => {
            console.clear();
            console.log('Device State:');
            console.log('--------------');
            console.log(`Connected: ${state.connected}`);
            console.log(`Battery: ${state.batteryLevel}%`);
            console.log('\nMetrics:');
            console.log(`Commands: ${state.metrics.commandsReceived}`);
            console.log(`Success Rate: ${
              (state.metrics.commandsSucceeded / state.metrics.commandsReceived * 100).toFixed(1)
            }%`);
            console.log(`Avg Latency: ${
              (state.metrics.totalLatency / state.metrics.commandsSucceeded).toFixed(2)
            }ms`);
          });

          process.on('SIGINT', async () => {
            console.log('\nStopping simulation...');
            await simulator.disconnect();
            process.exit();
          });
        } catch (error) {
          console.error(chalk.red(`Error starting simulation: ${error.message}`));
        }
      })
  );

/**
 * Protocol Analysis Commands
 */
program
  .command('analyze')
  .description('Protocol analysis commands')
  .addCommand(
    program
      .command('capture')
      .description('Capture and analyze device communication')
      .argument('<deviceId>', 'Device ID to analyze')
      .option('-d, --duration <seconds>', 'Capture duration', '60')
      .option('-i, --interval <ms>', 'Analysis interval', '1000')
      .action(async (deviceId, options) => {
        const analyzer = new ProtocolAnalyzer();
        const monitor = new DeviceMonitoring(deviceId);
        let analysisCount = 0;

        console.log(`\nStarting protocol analysis for device ${deviceId}...`);
        console.log(`Duration: ${options.duration}s`);
        console.log(`Analysis interval: ${options.interval}ms\n`);

        analyzer.on('message', message => {
          const type = chalk.blue(message.type);
          const size = chalk.yellow(`${message.raw.length} bytes`);
          console.log(`[${new Date().toISOString()}] ${type} - ${size}`);
        });

        analyzer.on('analysis', analysis => {
          analysisCount++;
          console.clear();
          console.log(`Analysis #${analysisCount}:`);
          console.log('-----------------');

          if (analysis.anomalies.length > 0) {
            console.log(chalk.red('\nAnomalies Detected:'));
            analysis.anomalies.forEach(anomaly => {
              console.log(`- ${anomaly.message}`);
            });
          }

          if (analysis.patternDetection.repeatingSequences.length > 0) {
            console.log(chalk.green('\nCommon Patterns:'));
            analysis.patternDetection.repeatingSequences.forEach(sequence => {
              console.log(`- ${sequence.join(' → ')}`);
            });
          }

          console.log('\nTiming Analysis:');
          console.log(`Avg Interval: ${
            analysis.timingAnalysis.averageInterval.toFixed(2)
          }ms`);
          console.log(`Burst Detected: ${
            analysis.timingAnalysis.burstDetected ? 'Yes' : 'No'
          }`);
        });

        analyzer.startAnalysis(parseInt(options.interval));

        // Attach to device events
        const manager = DeviceManager.getInstance();
        const device = manager.getDevice(deviceId);
        if (device) {
          device.on('command', (command: any) => {
            analyzer.recordCommand(command, JSON.stringify(command));
          });
        }

        // Run for specified duration
        await new Promise(resolve => 
          setTimeout(resolve, parseInt(options.duration) * 1000)
        );

        analyzer.stopAnalysis();
        console.log('\nAnalysis complete!');

        const stats = analyzer.getStats();
        console.log('\nFinal Statistics:');
        console.log(`Total Messages: ${stats.messageCount}`);
        console.log(`Command Success Rate: ${
          (stats.commandStats.succeeded / stats.commandStats.total * 100).toFixed(1)
        }%`);
        console.log(`Average Latency: ${
          stats.commandStats.avgLatency.toFixed(2)
        }ms`);
        console.log(`Error Rate: ${
          (stats.errorCount / stats.messageCount * 100).toFixed(1)
        }%`);
      })
  );

/**
 * Monitoring Commands
 */
program
  .command('monitor')
  .description('Device monitoring commands')
  .addCommand(
    program
      .command('stats')
      .description('Show device statistics')
      .argument('[deviceId]', 'Device ID (optional)')
      .action((deviceId) => {
        if (deviceId) {
          const monitor = new DeviceMonitoring(deviceId);
          const stats = monitor.getDeviceStats();
          if (stats) {
            console.log(`\nStatistics for device ${deviceId}:`);
            console.log(`Total Connections: ${stats.totalConnections}`);
            console.log(`Commands Sent: ${stats.totalCommandsSent}`);
            console.log(`Commands Failed: ${stats.totalCommandsFailed}`);
            console.log(`Pattern Runs: ${stats.totalPatternRuns}`);
            console.log(`Average Session Duration: ${
              (stats.averageSessionDuration / 1000).toFixed(2)
            }s`);

            if (stats.topFeatures.length > 0) {
              console.log('\nTop Features:');
              stats.topFeatures.forEach(feature => {
                console.log(`- ${feature.feature}: ${feature.count} uses`);
              });
            }

            if (Object.keys(stats.errorRates).length > 0) {
              console.log('\nError Distribution:');
              Object.entries(stats.errorRates).forEach(([type, count]) => {
                console.log(`- ${type}: ${count} occurrences`);
              });
            }
          } else {
            console.log(chalk.yellow('No statistics available for this device.'));
          }
        } else {
          const manager = DeviceManager.getInstance();
          const devices = manager.getDevices();

          console.log('\nDevice Statistics Overview:');
          devices.forEach(device => {
            const monitor = new DeviceMonitoring(device.info.id);
            const stats = monitor.getDeviceStats();
            if (stats) {
              console.log(`\n${device.info.name} (${device.info.id}):`);
              console.log(`- Commands: ${stats.totalCommandsSent}`);
              console.log(`- Success Rate: ${
                ((1 - stats.totalCommandsFailed / stats.totalCommandsSent) * 100).toFixed(1)
              }%`);
            }
          });
        }
      })
  );

program.parse();
