import { EventEmitter } from 'events';
import { Database } from '../../core/database/Database';
import { Logger } from '../../core/logging/Logger';
import { MetricsCollector } from '../../core/metrics/MetricsCollector';
/**
 * Device Configuration Schema
 */
export interface DeviceConfigSchema {
    id: string;
    name: string;
    version: string;
    description?: string;
    properties: {
        [key: string]: {
            type: 'string' | 'number' | 'boolean' | 'object' | 'array';
            description?: string;
            required?: boolean;
            default?: any;
            enum?: any[];
            minimum?: number;
            maximum?: number;
            minLength?: number;
            maxLength?: number;
            pattern?: string;
            format?: string;
            items?: DeviceConfigSchema;
            properties?: {
                [key: string]: DeviceConfigSchema;
            };
        };
    };
    rules?: Array<{
        condition: string;
        message: string;
    }>;
}
/**
 * Device Configuration
 */
export interface DeviceConfiguration {
    deviceId: string;
    schemaId: string;
    version: string;
    timestamp: number;
    settings: {
        [key: string]: any;
    };
    valid?: boolean;
    errors?: string[];
    lastModified?: number;
    modifiedBy?: string;
    history?: Array<{
        timestamp: number;
        settings: {
            [key: string]: any;
        };
        modifiedBy?: string;
    }>;
}
/**
 * Configuration Manager Options
 */
interface ConfigManagerOptions {
    storagePrefix?: string;
    maxHistory?: number;
    pruneInterval?: number;
    validateOnLoad?: boolean;
    validateOnSave?: boolean;
    strictValidation?: boolean;
    allowUnknownProperties?: boolean;
    schemaVersioning?: boolean;
    schemaMigration?: boolean;
}
/**
 * Device Configuration Manager
 * Manages device configuration schemas, storage, and validation
 */
export declare class DeviceConfigManager extends EventEmitter {
    private database;
    private logger;
    private metrics;
    private options;
    private schemas;
    private configs;
    private pruneTimer?;
    constructor(database: Database, logger: Logger, metrics: MetricsCollector, options?: ConfigManagerOptions);
    /**
     * Initialize configuration manager
     */
    initialize(): Promise<void>;
    /**
     * Get configuration schema
     */
    getSchema(schemaId: string): DeviceConfigSchema | undefined;
    /**
     * Add configuration schema
     */
    addSchema(schema: DeviceConfigSchema): Promise<void>;
    /**
     * Update configuration schema
     */
    updateSchema(schema: DeviceConfigSchema): Promise<void>;
    /**
     * Remove configuration schema
     */
    removeSchema(schemaId: string): Promise<void>;
    /**
     * Get device configuration
     */
    getConfiguration(deviceId: string): DeviceConfiguration | undefined;
    /**
     * Create device configuration
     */
    createConfiguration(deviceId: string, schemaId: string, settings: {
        [key: string]: any;
    }): Promise<DeviceConfiguration>;
    /**
     * Update device configuration
     */
    updateConfiguration(deviceId: string, settings: {
        [key: string]: any;
    }, modifiedBy?: string): Promise<DeviceConfiguration>;
    /**
     * Remove device configuration
     */
    removeConfiguration(deviceId: string): Promise<void>;
    /**
     * Validate configuration against schema
     */
    validateConfiguration(config: DeviceConfiguration): Promise<string[]>;
    /**
     * Initialize options
     */
    private initializeOptions;
    /**
     * Setup pruning timer
     */
    private setupPruning;
    /**
     * Load configuration schemas
     */
    private loadSchemas;
    /**
     * Load device configurations
     */
    private loadConfigurations;
    /**
     * Validate configuration schema
     */
    private validateSchema;
    /**
     * Handle schema version change
     */
    private handleSchemaVersion;
    /**
     * Migrate configuration to new schema version
     */
    private migrateConfiguration;
    /**
     * Validate value type
     */
    private validateType;
    /**
     * Evaluate validation rule
     */
    private evaluateRule;
    /**
     * Persist schema to storage
     */
    private persistSchema;
    /**
     * Persist configuration to storage
     */
    private persistConfiguration;
    /**
     * Prune old configuration history
     */
    private pruneConfigurations;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
export {};
