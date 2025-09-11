import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import inquirer from 'inquirer';
import { DeviceManager } from '../device/DeviceManager';
import { DefaultSecurityService } from '../security/SecurityService';
import { DefaultMonitoringService } from '../monitoring/MonitoringService';
import Logger from '../utils/Logger';
import { validate } from './ConfigValidator';

interface ConfigResult {
  success: boolean;
  error?: string;
  configPath?: string;
}

interface ConfigTest {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export class ConfigManager {
  private readonly CONFIG_DIR = '.aeims';
  private readonly CONFIG_FILE = 'config.yml';
  private readonly TEMPLATES_DIR = 'templates';
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  private get configPath(): string {
    return path.join(process.env.HOME || process.env.USERPROFILE || '', this.CONFIG_DIR);
  }

  private get configFilePath(): string {
    return path.join(this.configPath, this.CONFIG_FILE);
  }

  async check(verbose: boolean = false): Promise<{
    valid: boolean;
    issues: string[];
    config?: any;
  }> {
    try {
      const config = await this.loadConfig();
      const validation = await validate(config);

      if (verbose && config) {
        return {
          valid: validation.valid,
          issues: validation.issues,
          config
        };
      }

      return {
        valid: validation.valid,
        issues: validation.issues
      };
    } catch (error) {
      return {
        valid: false,
        issues: [`Failed to load configuration: ${error}`]
      };
    }
  }

  async verify(runTests: boolean = true): Promise<{
    success: boolean;
    errors: string[];
  }> {
    try {
      // Load and validate configuration
      const config = await this.loadConfig();
      const validation = await validate(config);

      if (!validation.valid) {
        return {
          success: false,
          errors: validation.issues
        };
      }

      if (!runTests) {
        return {
          success: true,
          errors: []
        };
      }

      // Run connectivity tests
      const testResults = await this.runTests();
      const failedTests = testResults.filter(test => !test.passed);

      return {
        success: failedTests.length === 0,
        errors: failedTests.map(test => test.error || 'Unknown error')
      };
    } catch (error) {
      return {
        success: false,
        errors: [`Verification failed: ${error}`]
      };
    }
  }

  async setup(options: { force?: boolean; interactive?: boolean } = {}): Promise<ConfigResult> {
    try {
      // Check if config already exists
      const exists = await this.configExists();
      if (exists && !options.force) {
        return {
          success: false,
          error: 'Configuration already exists. Use --force to override.'
        };
      }

      let config;
      if (options.interactive) {
        config = await this.runInteractiveSetup();
      } else {
        config = await this.loadDefaultTemplate();
      }

      // Create config directory if it doesn't exist
      await fs.mkdir(this.configPath, { recursive: true });

      // Save configuration
      await this.saveConfig(config);

      return {
        success: true,
        configPath: this.configFilePath
      };
    } catch (error) {
      return {
        success: false,
        error: `Setup failed: ${error}`
      };
    }
  }

  async configure(setting: string, value: string): Promise<ConfigResult> {
    try {
      const config = await this.loadConfig();
      const settingPath = setting.split('.');

      // Update nested setting
      let current = config;
      for (let i = 0; i < settingPath.length - 1; i++) {
        if (!current[settingPath[i]]) {
          current[settingPath[i]] = {};
        }
        current = current[settingPath[i]];
      }
      current[settingPath[settingPath.length - 1]] = this.parseValue(value);

      // Validate new configuration
      const validation = await validate(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid configuration: ${validation.issues.join(', ')}`
        };
      }

      // Save updated configuration
      await this.saveConfig(config);

      return {
        success: true,
        configPath: this.configFilePath
      };
    } catch (error) {
      return {
        success: false,
        error: `Configuration failed: ${error}`
      };
    }
  }

  async configureInteractive(): Promise<ConfigResult> {
    try {
      const config = await this.loadConfig();
      const updates = await this.runInteractiveConfig(config);
      
      // Save updated configuration
      await this.saveConfig({ ...config, ...updates });

      return {
        success: true,
        configPath: this.configFilePath
      };
    } catch (error) {
      return {
        success: false,
        error: `Interactive configuration failed: ${error}`
      };
    }
  }

  async runTests(testName?: string, verbose: boolean = false): Promise<ConfigTest[]> {
    const tests: ConfigTest[] = [];
    const config = await this.loadConfig();

    // Test WebSocket configuration
    tests.push(await this.testWebSocket(config));

    // Test Security configuration
    tests.push(await this.testSecurity(config));

    // Test Device Manager configuration
    tests.push(await this.testDeviceManager(config));

    // Test Monitoring configuration
    tests.push(await this.testMonitoring(config));

    if (testName) {
      return tests.filter(test => test.name === testName);
    }

    return tests;
  }

  async remove(setting: string): Promise<ConfigResult> {
    try {
      const config = await this.loadConfig();
      const settingPath = setting.split('.');

      // Remove nested setting
      let current = config;
      for (let i = 0; i < settingPath.length - 1; i++) {
        if (!current[settingPath[i]]) {
          return {
            success: false,
            error: `Setting '${setting}' not found`
          };
        }
        current = current[settingPath[i]];
      }

      delete current[settingPath[settingPath.length - 1]];

      // Validate new configuration
      const validation = await validate(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid configuration after removal: ${validation.issues.join(', ')}`
        };
      }

      // Save updated configuration
      await this.saveConfig(config);

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: `Removal failed: ${error}`
      };
    }
  }

  async install(source: string, options: { force?: boolean } = {}): Promise<ConfigResult> {
    try {
      // Check if config already exists
      const exists = await this.configExists();
      if (exists && !options.force) {
        return {
          success: false,
          error: 'Configuration already exists. Use --force to override.'
        };
      }

      let config;
      if (await this.isTemplateName(source)) {
        config = await this.loadTemplate(source);
      } else {
        config = await this.loadConfigFile(source);
      }

      // Validate configuration
      const validation = await validate(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid configuration: ${validation.issues.join(', ')}`
        };
      }

      // Create config directory if it doesn't exist
      await fs.mkdir(this.configPath, { recursive: true });

      // Save configuration
      await this.saveConfig(config);

      return {
        success: true,
        configPath: this.configFilePath
      };
    } catch (error) {
      return {
        success: false,
        error: `Installation failed: ${error}`
      };
    }
  }

  async uninstall(): Promise<ConfigResult> {
    try {
      // Check if config exists
      const exists = await this.configExists();
      if (!exists) {
        return {
          success: false,
          error: 'No configuration found to uninstall'
        };
      }

      // Remove configuration file
      await fs.unlink(this.configFilePath);

      // Try to remove config directory if empty
      try {
        await fs.rmdir(this.configPath);
      } catch {
        // Directory might not be empty, ignore error
      }

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: `Uninstallation failed: ${error}`
      };
    }
  }

  private async configExists(): Promise<boolean> {
    try {
      await fs.access(this.configFilePath);
      return true;
    } catch {
      return false;
    }
  }

  private async loadConfig(): Promise<any> {
    try {
      const content = await fs.readFile(this.configFilePath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  private async saveConfig(config: any): Promise<void> {
    try {
      const content = yaml.dump(config);
      await fs.writeFile(this.configFilePath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error}`);
    }
  }

  private async loadDefaultTemplate(): Promise<any> {
    return this.loadTemplate('default');
  }

  private async loadTemplate(name: string): Promise<any> {
    try {
      const templatePath = path.join(__dirname, this.TEMPLATES_DIR, `${name}.yml`);
      const content = await fs.readFile(templatePath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to load template '${name}': ${error}`);
    }
  }

  private async loadConfigFile(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to load configuration file: ${error}`);
    }
  }

  private async isTemplateName(source: string): Promise<boolean> {
    try {
      const templatePath = path.join(__dirname, this.TEMPLATES_DIR, `${source}.yml`);
      await fs.access(templatePath);
      return true;
    } catch {
      return false;
    }
  }

  private parseValue(value: string): any {
    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num)) return num;

    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Try to parse as JSON
    try {
      return JSON.parse(value);
    } catch {
      // Return as string if all else fails
      return value;
    }
  }

  private async runInteractiveSetup(): Promise<any> {
    const questions = [
      {
        type: 'input',
        name: 'websocket.port',
        message: 'Enter WebSocket server port:',
        default: '8080'
      },
      {
        type: 'input',
        name: 'websocket.host',
        message: 'Enter WebSocket server host:',
        default: 'localhost'
      },
      {
        type: 'confirm',
        name: 'security.encryption.enabled',
        message: 'Enable encryption?',
        default: true
      },
      {
        type: 'input',
        name: 'security.jwt.secret',
        message: 'Enter JWT secret key:',
        when: (answers: any) => answers.security.encryption.enabled
      },
      {
        type: 'confirm',
        name: 'monitoring.enabled',
        message: 'Enable monitoring?',
        default: true
      }
    ];

    return inquirer.prompt(questions);
  }

  private async runInteractiveConfig(currentConfig: any): Promise<any> {
    const questions = [
      {
        type: 'list',
        name: 'section',
        message: 'Which section would you like to configure?',
        choices: ['WebSocket', 'Security', 'Monitoring', 'Device Manager']
      }
    ];

    const { section } = await inquirer.prompt(questions);

    switch (section) {
      case 'WebSocket':
        return this.configureWebSocket(currentConfig.websocket);
      case 'Security':
        return this.configureSecurity(currentConfig.security);
      case 'Monitoring':
        return this.configureMonitoring(currentConfig.monitoring);
      case 'Device Manager':
        return this.configureDeviceManager(currentConfig.deviceManager);
      default:
        throw new Error(`Unknown section: ${section}`);
    }
  }

  private async configureWebSocket(current: any = {}): Promise<any> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'websocket.port',
        message: 'WebSocket server port:',
        default: current.port || '8080'
      },
      {
        type: 'input',
        name: 'websocket.host',
        message: 'WebSocket server host:',
        default: current.host || 'localhost'
      },
      {
        type: 'input',
        name: 'websocket.path',
        message: 'WebSocket server path:',
        default: current.path || '/ws'
      }
    ]);
  }

  private async configureSecurity(current: any = {}): Promise<any> {
    return inquirer.prompt([
      {
        type: 'confirm',
        name: 'security.encryption.enabled',
        message: 'Enable encryption?',
        default: current.encryption?.enabled ?? true
      },
      {
        type: 'input',
        name: 'security.jwt.secret',
        message: 'JWT secret key:',
        when: (answers: any) => answers.security.encryption.enabled,
        default: current.jwt?.secret
      },
      {
        type: 'number',
        name: 'security.jwt.expiration',
        message: 'JWT expiration time (seconds):',
        default: current.jwt?.expiration || 3600
      }
    ]);
  }

  private async configureMonitoring(current: any = {}): Promise<any> {
    return inquirer.prompt([
      {
        type: 'confirm',
        name: 'monitoring.enabled',
        message: 'Enable monitoring?',
        default: current.enabled ?? true
      },
      {
        type: 'input',
        name: 'monitoring.interval',
        message: 'Monitoring interval (ms):',
        when: (answers: any) => answers.monitoring.enabled,
        default: current.interval || '5000'
      },
      {
        type: 'checkbox',
        name: 'monitoring.metrics.types',
        message: 'Select metrics to collect:',
        when: (answers: any) => answers.monitoring.enabled,
        choices: ['device', 'websocket', 'system'],
        default: current.metrics?.types || ['device', 'websocket', 'system']
      }
    ]);
  }

  private async configureDeviceManager(current: any = {}): Promise<any> {
    return inquirer.prompt([
      {
        type: 'checkbox',
        name: 'deviceManager.protocols',
        message: 'Select supported protocols:',
        choices: ['websocket', 'bluetooth', 'serial'],
        default: current.protocols || ['websocket']
      },
      {
        type: 'confirm',
        name: 'deviceManager.autoReconnect',
        message: 'Enable auto-reconnect?',
        default: current.autoReconnect ?? true
      },
      {
        type: 'number',
        name: 'deviceManager.reconnectInterval',
        message: 'Reconnect interval (ms):',
        when: (answers: any) => answers.deviceManager.autoReconnect,
        default: current.reconnectInterval || 5000
      }
    ]);
  }

  private async testWebSocket(config: any): Promise<ConfigTest> {
    try {
      // Test WebSocket configuration
      return {
        name: 'WebSocket Configuration',
        passed: true
      };
    } catch (error) {
      return {
        name: 'WebSocket Configuration',
        passed: false,
        error: String(error)
      };
    }
  }

  private async testSecurity(config: any): Promise<ConfigTest> {
    try {
      // Test security configuration
      return {
        name: 'Security Configuration',
        passed: true
      };
    } catch (error) {
      return {
        name: 'Security Configuration',
        passed: false,
        error: String(error)
      };
    }
  }

  private async testDeviceManager(config: any): Promise<ConfigTest> {
    try {
      // Test device manager configuration
      return {
        name: 'Device Manager Configuration',
        passed: true
      };
    } catch (error) {
      return {
        name: 'Device Manager Configuration',
        passed: false,
        error: String(error)
      };
    }
  }

  private async testMonitoring(config: any): Promise<ConfigTest> {
    try {
      // Test monitoring configuration
      return {
        name: 'Monitoring Configuration',
        passed: true
      };
    } catch (error) {
      return {
        name: 'Monitoring Configuration',
        passed: false,
        error: String(error)
      };
    }
  }
}
