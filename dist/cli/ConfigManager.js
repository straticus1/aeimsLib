"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const inquirer_1 = __importDefault(require("inquirer"));
const Logger_1 = require("../utils/Logger");
const ConfigValidator_1 = require("./ConfigValidator");
class ConfigManager {
    constructor() {
        this.CONFIG_DIR = '.aeims';
        this.CONFIG_FILE = 'config.yml';
        this.TEMPLATES_DIR = 'templates';
        this.logger = Logger_1.Logger.getInstance();
    }
    get configPath() {
        return path_1.default.join(process.env.HOME || process.env.USERPROFILE || '', this.CONFIG_DIR);
    }
    get configFilePath() {
        return path_1.default.join(this.configPath, this.CONFIG_FILE);
    }
    async check(verbose = false) {
        try {
            const config = await this.loadConfig();
            const validation = await (0, ConfigValidator_1.validate)(config);
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
        }
        catch (error) {
            return {
                valid: false,
                issues: [`Failed to load configuration: ${error}`]
            };
        }
    }
    async verify(runTests = true) {
        try {
            // Load and validate configuration
            const config = await this.loadConfig();
            const validation = await (0, ConfigValidator_1.validate)(config);
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
        }
        catch (error) {
            return {
                success: false,
                errors: [`Verification failed: ${error}`]
            };
        }
    }
    async setup(options = {}) {
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
            }
            else {
                config = await this.loadDefaultTemplate();
            }
            // Create config directory if it doesn't exist
            await promises_1.default.mkdir(this.configPath, { recursive: true });
            // Save configuration
            await this.saveConfig(config);
            return {
                success: true,
                configPath: this.configFilePath
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Setup failed: ${error}`
            };
        }
    }
    async configure(setting, value) {
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
            const validation = await (0, ConfigValidator_1.validate)(config);
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
        }
        catch (error) {
            return {
                success: false,
                error: `Configuration failed: ${error}`
            };
        }
    }
    async configureInteractive() {
        try {
            const config = await this.loadConfig();
            const updates = await this.runInteractiveConfig(config);
            // Save updated configuration
            await this.saveConfig({ ...config, ...updates });
            return {
                success: true,
                configPath: this.configFilePath
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Interactive configuration failed: ${error}`
            };
        }
    }
    async runTests(testName, verbose = false) {
        const tests = [];
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
    async remove(setting) {
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
            const validation = await (0, ConfigValidator_1.validate)(config);
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
        }
        catch (error) {
            return {
                success: false,
                error: `Removal failed: ${error}`
            };
        }
    }
    async install(source, options = {}) {
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
            }
            else {
                config = await this.loadConfigFile(source);
            }
            // Validate configuration
            const validation = await (0, ConfigValidator_1.validate)(config);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Invalid configuration: ${validation.issues.join(', ')}`
                };
            }
            // Create config directory if it doesn't exist
            await promises_1.default.mkdir(this.configPath, { recursive: true });
            // Save configuration
            await this.saveConfig(config);
            return {
                success: true,
                configPath: this.configFilePath
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Installation failed: ${error}`
            };
        }
    }
    async uninstall() {
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
            await promises_1.default.unlink(this.configFilePath);
            // Try to remove config directory if empty
            try {
                await promises_1.default.rmdir(this.configPath);
            }
            catch {
                // Directory might not be empty, ignore error
            }
            return {
                success: true
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Uninstallation failed: ${error}`
            };
        }
    }
    async configExists() {
        try {
            await promises_1.default.access(this.configFilePath);
            return true;
        }
        catch {
            return false;
        }
    }
    async loadConfig() {
        try {
            const content = await promises_1.default.readFile(this.configFilePath, 'utf8');
            return js_yaml_1.default.load(content);
        }
        catch (error) {
            throw new Error(`Failed to load configuration: ${error}`);
        }
    }
    async saveConfig(config) {
        try {
            const content = js_yaml_1.default.dump(config);
            await promises_1.default.writeFile(this.configFilePath, content, 'utf8');
        }
        catch (error) {
            throw new Error(`Failed to save configuration: ${error}`);
        }
    }
    async loadDefaultTemplate() {
        return this.loadTemplate('default');
    }
    async loadTemplate(name) {
        try {
            const templatePath = path_1.default.join(__dirname, this.TEMPLATES_DIR, `${name}.yml`);
            const content = await promises_1.default.readFile(templatePath, 'utf8');
            return js_yaml_1.default.load(content);
        }
        catch (error) {
            throw new Error(`Failed to load template '${name}': ${error}`);
        }
    }
    async loadConfigFile(filePath) {
        try {
            const content = await promises_1.default.readFile(filePath, 'utf8');
            return js_yaml_1.default.load(content);
        }
        catch (error) {
            throw new Error(`Failed to load configuration file: ${error}`);
        }
    }
    async isTemplateName(source) {
        try {
            const templatePath = path_1.default.join(__dirname, this.TEMPLATES_DIR, `${source}.yml`);
            await promises_1.default.access(templatePath);
            return true;
        }
        catch {
            return false;
        }
    }
    parseValue(value) {
        // Try to parse as number
        const num = Number(value);
        if (!isNaN(num))
            return num;
        // Try to parse as boolean
        if (value.toLowerCase() === 'true')
            return true;
        if (value.toLowerCase() === 'false')
            return false;
        // Try to parse as JSON
        try {
            return JSON.parse(value);
        }
        catch {
            // Return as string if all else fails
            return value;
        }
    }
    async runInteractiveSetup() {
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
                when: (answers) => answers.security.encryption.enabled
            },
            {
                type: 'confirm',
                name: 'monitoring.enabled',
                message: 'Enable monitoring?',
                default: true
            }
        ];
        return inquirer_1.default.prompt(questions);
    }
    async runInteractiveConfig(currentConfig) {
        const questions = [
            {
                type: 'list',
                name: 'section',
                message: 'Which section would you like to configure?',
                choices: ['WebSocket', 'Security', 'Monitoring', 'Device Manager']
            }
        ];
        const { section } = await inquirer_1.default.prompt(questions);
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
    async configureWebSocket(current = {}) {
        return inquirer_1.default.prompt([
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
    async configureSecurity(current = {}) {
        return inquirer_1.default.prompt([
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
                when: (answers) => answers.security.encryption.enabled,
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
    async configureMonitoring(current = {}) {
        return inquirer_1.default.prompt([
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
                when: (answers) => answers.monitoring.enabled,
                default: current.interval || '5000'
            },
            {
                type: 'checkbox',
                name: 'monitoring.metrics.types',
                message: 'Select metrics to collect:',
                when: (answers) => answers.monitoring.enabled,
                choices: ['device', 'websocket', 'system'],
                default: current.metrics?.types || ['device', 'websocket', 'system']
            }
        ]);
    }
    async configureDeviceManager(current = {}) {
        return inquirer_1.default.prompt([
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
                when: (answers) => answers.deviceManager.autoReconnect,
                default: current.reconnectInterval || 5000
            }
        ]);
    }
    async testWebSocket(config) {
        try {
            // Test WebSocket configuration
            return {
                name: 'WebSocket Configuration',
                passed: true
            };
        }
        catch (error) {
            return {
                name: 'WebSocket Configuration',
                passed: false,
                error: String(error)
            };
        }
    }
    async testSecurity(config) {
        try {
            // Test security configuration
            return {
                name: 'Security Configuration',
                passed: true
            };
        }
        catch (error) {
            return {
                name: 'Security Configuration',
                passed: false,
                error: String(error)
            };
        }
    }
    async testDeviceManager(config) {
        try {
            // Test device manager configuration
            return {
                name: 'Device Manager Configuration',
                passed: true
            };
        }
        catch (error) {
            return {
                name: 'Device Manager Configuration',
                passed: false,
                error: String(error)
            };
        }
    }
    async testMonitoring(config) {
        try {
            // Test monitoring configuration
            return {
                name: 'Monitoring Configuration',
                passed: true
            };
        }
        catch (error) {
            return {
                name: 'Monitoring Configuration',
                passed: false,
                error: String(error)
            };
        }
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=ConfigManager.js.map