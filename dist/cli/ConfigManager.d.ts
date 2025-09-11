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
export declare class ConfigManager {
    private readonly CONFIG_DIR;
    private readonly CONFIG_FILE;
    private readonly TEMPLATES_DIR;
    private logger;
    constructor();
    private get configPath();
    private get configFilePath();
    check(verbose?: boolean): Promise<{
        valid: boolean;
        issues: string[];
        config?: any;
    }>;
    verify(runTests?: boolean): Promise<{
        success: boolean;
        errors: string[];
    }>;
    setup(options?: {
        force?: boolean;
        interactive?: boolean;
    }): Promise<ConfigResult>;
    configure(setting: string, value: string): Promise<ConfigResult>;
    configureInteractive(): Promise<ConfigResult>;
    runTests(testName?: string, verbose?: boolean): Promise<ConfigTest[]>;
    remove(setting: string): Promise<ConfigResult>;
    install(source: string, options?: {
        force?: boolean;
    }): Promise<ConfigResult>;
    uninstall(): Promise<ConfigResult>;
    private configExists;
    private loadConfig;
    private saveConfig;
    private loadDefaultTemplate;
    private loadTemplate;
    private loadConfigFile;
    private isTemplateName;
    private parseValue;
    private runInteractiveSetup;
    private runInteractiveConfig;
    private configureWebSocket;
    private configureSecurity;
    private configureMonitoring;
    private configureDeviceManager;
    private testWebSocket;
    private testSecurity;
    private testDeviceManager;
    private testMonitoring;
}
export {};
