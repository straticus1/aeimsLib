"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceConfigManager = void 0;
const events_1 = require("events");
const ValidationError_1 = require("../../core/errors/ValidationError");
/**
 * Device Configuration Manager
 * Manages device configuration schemas, storage, and validation
 */
class DeviceConfigManager extends events_1.EventEmitter {
    constructor(database, logger, metrics, options = {}) {
        super();
        this.database = database;
        this.logger = logger;
        this.metrics = metrics;
        this.schemas = new Map();
        this.configs = new Map();
        this.options = this.initializeOptions(options);
        this.setupPruning();
    }
    /**
     * Initialize configuration manager
     */
    async initialize() {
        try {
            // Load schemas
            await this.loadSchemas();
            // Load configurations
            await this.loadConfigurations();
            // Validate configurations if enabled
            if (this.options.validateOnLoad) {
                for (const config of this.configs.values()) {
                    await this.validateConfiguration(config);
                }
            }
        }
        catch (error) {
            this.logger.error('Failed to initialize config manager:', error);
            throw error;
        }
    }
    /**
     * Get configuration schema
     */
    getSchema(schemaId) {
        return this.schemas.get(schemaId);
    }
    /**
     * Add configuration schema
     */
    async addSchema(schema) {
        // Validate schema
        this.validateSchema(schema);
        // Check for existing schema
        const existing = this.schemas.get(schema.id);
        if (existing) {
            if (this.options.schemaVersioning &&
                existing.version !== schema.version) {
                // Handle schema versioning
                await this.handleSchemaVersion(existing, schema);
            }
            else {
                throw new Error(`Schema ${schema.id} already exists`);
            }
        }
        // Store schema
        this.schemas.set(schema.id, schema);
        await this.persistSchema(schema);
        // Emit event
        this.emit('schemaAdded', schema);
    }
    /**
     * Update configuration schema
     */
    async updateSchema(schema) {
        // Validate schema
        this.validateSchema(schema);
        // Check schema exists
        const existing = this.schemas.get(schema.id);
        if (!existing) {
            throw new Error(`Schema ${schema.id} not found`);
        }
        // Handle schema versioning
        if (this.options.schemaVersioning &&
            existing.version !== schema.version) {
            await this.handleSchemaVersion(existing, schema);
        }
        // Update schema
        this.schemas.set(schema.id, schema);
        await this.persistSchema(schema);
        // Emit event
        this.emit('schemaUpdated', schema);
    }
    /**
     * Remove configuration schema
     */
    async removeSchema(schemaId) {
        // Check schema exists
        const schema = this.schemas.get(schemaId);
        if (!schema) {
            return;
        }
        // Check for configurations using this schema
        const configs = Array.from(this.configs.values())
            .filter(c => c.schemaId === schemaId);
        if (configs.length > 0) {
            throw new Error(`Cannot remove schema ${schemaId} - in use by ${configs.length} configurations`);
        }
        // Remove schema
        this.schemas.delete(schemaId);
        await this.database.delete(`${this.options.storagePrefix}:schema:${schemaId}`);
        // Emit event
        this.emit('schemaRemoved', schemaId);
    }
    /**
     * Get device configuration
     */
    getConfiguration(deviceId) {
        return this.configs.get(deviceId);
    }
    /**
     * Create device configuration
     */
    async createConfiguration(deviceId, schemaId, settings) {
        // Check schema exists
        const schema = this.schemas.get(schemaId);
        if (!schema) {
            throw new Error(`Schema ${schemaId} not found`);
        }
        // Create configuration
        const config = {
            deviceId,
            schemaId,
            version: schema.version,
            timestamp: Date.now(),
            settings,
            history: []
        };
        // Validate configuration
        if (this.options.validateOnSave) {
            await this.validateConfiguration(config);
        }
        // Store configuration
        this.configs.set(deviceId, config);
        await this.persistConfiguration(config);
        // Emit event
        this.emit('configAdded', config);
        return config;
    }
    /**
     * Update device configuration
     */
    async updateConfiguration(deviceId, settings, modifiedBy) {
        // Check configuration exists
        const config = this.configs.get(deviceId);
        if (!config) {
            throw new Error(`Configuration for device ${deviceId} not found`);
        }
        // Add current settings to history
        if (!config.history) {
            config.history = [];
        }
        config.history.push({
            timestamp: config.lastModified || config.timestamp,
            settings: { ...config.settings },
            modifiedBy: config.modifiedBy
        });
        // Prune history if needed
        if (config.history.length > this.options.maxHistory) {
            config.history = config.history.slice(-this.options.maxHistory);
        }
        // Update settings
        config.settings = settings;
        config.lastModified = Date.now();
        config.modifiedBy = modifiedBy;
        // Validate configuration
        if (this.options.validateOnSave) {
            await this.validateConfiguration(config);
        }
        // Store configuration
        await this.persistConfiguration(config);
        // Emit event
        this.emit('configUpdated', config);
        return config;
    }
    /**
     * Remove device configuration
     */
    async removeConfiguration(deviceId) {
        // Check configuration exists
        const config = this.configs.get(deviceId);
        if (!config) {
            return;
        }
        // Remove configuration
        this.configs.delete(deviceId);
        await this.database.delete(`${this.options.storagePrefix}:config:${deviceId}`);
        // Emit event
        this.emit('configRemoved', deviceId);
    }
    /**
     * Validate configuration against schema
     */
    async validateConfiguration(config) {
        const schema = this.schemas.get(config.schemaId);
        if (!schema) {
            throw new Error(`Schema ${config.schemaId} not found`);
        }
        const errors = [];
        // Validate required properties
        for (const [key, prop] of Object.entries(schema.properties)) {
            if (prop.required && config.settings[key] === undefined) {
                errors.push(`Missing required property: ${key}`);
                continue;
            }
            const value = config.settings[key];
            if (value === undefined) {
                continue;
            }
            // Validate type
            if (!this.validateType(value, prop.type)) {
                errors.push(`Invalid type for ${key}: expected ${prop.type}`);
                continue;
            }
            // Validate constraints
            switch (prop.type) {
                case 'number':
                    if (prop.minimum !== undefined && value < prop.minimum) {
                        errors.push(`${key} below minimum: ${prop.minimum}`);
                    }
                    if (prop.maximum !== undefined && value > prop.maximum) {
                        errors.push(`${key} above maximum: ${prop.maximum}`);
                    }
                    break;
                case 'string':
                    if (prop.minLength !== undefined && value.length < prop.minLength) {
                        errors.push(`${key} below minimum length: ${prop.minLength}`);
                    }
                    if (prop.maxLength !== undefined && value.length > prop.maxLength) {
                        errors.push(`${key} above maximum length: ${prop.maxLength}`);
                    }
                    if (prop.pattern && !new RegExp(prop.pattern).test(value)) {
                        errors.push(`${key} does not match pattern: ${prop.pattern}`);
                    }
                    if (prop.enum && !prop.enum.includes(value)) {
                        errors.push(`${key} not in allowed values: ${prop.enum.join(', ')}`);
                    }
                    break;
                case 'array':
                    if (prop.items) {
                        for (const item of value) {
                            if (!this.validateType(item, prop.items.type)) {
                                errors.push(`Invalid array item type in ${key}: expected ${prop.items.type}`);
                            }
                        }
                    }
                    break;
                case 'object':
                    if (prop.properties) {
                        for (const [subKey, subProp] of Object.entries(prop.properties)) {
                            const subValue = value[subKey];
                            if (subProp.required && subValue === undefined) {
                                errors.push(`Missing required nested property: ${key}.${subKey}`);
                            }
                            if (subValue !== undefined && !this.validateType(subValue, subProp.type)) {
                                errors.push(`Invalid type for ${key}.${subKey}: expected ${subProp.type}`);
                            }
                        }
                    }
                    break;
            }
        }
        // Check for unknown properties
        if (!this.options.allowUnknownProperties) {
            const knownProps = new Set(Object.keys(schema.properties));
            for (const key of Object.keys(config.settings)) {
                if (!knownProps.has(key)) {
                    errors.push(`Unknown property: ${key}`);
                }
            }
        }
        // Validate custom rules
        if (schema.rules) {
            for (const rule of schema.rules) {
                try {
                    const valid = await this.evaluateRule(rule.condition, config.settings);
                    if (!valid) {
                        errors.push(rule.message);
                    }
                }
                catch (error) {
                    this.logger.error(`Error evaluating rule for ${config.deviceId}:`, error);
                    if (this.options.strictValidation) {
                        errors.push(`Rule evaluation failed: ${rule.condition}`);
                    }
                }
            }
        }
        // Update configuration state
        config.valid = errors.length === 0;
        config.errors = errors;
        // Emit validation errors
        if (errors.length > 0) {
            this.emit('validationError', config.deviceId, errors);
        }
        return errors;
    }
    /**
     * Initialize options
     */
    initializeOptions(options) {
        return {
            storagePrefix: options.storagePrefix || 'config',
            maxHistory: options.maxHistory || 10,
            pruneInterval: options.pruneInterval || 3600000, // 1 hour
            validateOnLoad: options.validateOnLoad !== false,
            validateOnSave: options.validateOnSave !== false,
            strictValidation: options.strictValidation !== false,
            allowUnknownProperties: options.allowUnknownProperties === true,
            schemaVersioning: options.schemaVersioning !== false,
            schemaMigration: options.schemaMigration !== false
        };
    }
    /**
     * Setup pruning timer
     */
    setupPruning() {
        this.pruneTimer = setInterval(() => this.pruneConfigurations(), this.options.pruneInterval);
    }
    /**
     * Load configuration schemas
     */
    async loadSchemas() {
        try {
            const prefix = `${this.options.storagePrefix}:schema:`;
            const keys = await this.database.keys(prefix);
            for (const key of keys) {
                const data = await this.database.get(key);
                if (!data)
                    continue;
                const schema = JSON.parse(data);
                this.validateSchema(schema);
                this.schemas.set(schema.id, schema);
            }
        }
        catch (error) {
            this.logger.error('Failed to load schemas:', error);
            throw error;
        }
    }
    /**
     * Load device configurations
     */
    async loadConfigurations() {
        try {
            const prefix = `${this.options.storagePrefix}:config:`;
            const keys = await this.database.keys(prefix);
            for (const key of keys) {
                const data = await this.database.get(key);
                if (!data)
                    continue;
                const config = JSON.parse(data);
                this.configs.set(config.deviceId, config);
            }
        }
        catch (error) {
            this.logger.error('Failed to load configurations:', error);
            throw error;
        }
    }
    /**
     * Validate configuration schema
     */
    validateSchema(schema) {
        if (!schema.id) {
            throw new ValidationError_1.ValidationError('Schema must have an ID');
        }
        if (!schema.name) {
            throw new ValidationError_1.ValidationError('Schema must have a name');
        }
        if (!schema.version) {
            throw new ValidationError_1.ValidationError('Schema must have a version');
        }
        if (!schema.properties || Object.keys(schema.properties).length === 0) {
            throw new ValidationError_1.ValidationError('Schema must have properties');
        }
        // Validate property definitions
        for (const [key, prop] of Object.entries(schema.properties)) {
            if (!prop.type) {
                throw new ValidationError_1.ValidationError(`Property ${key} must have a type`);
            }
            // Validate nested schema
            if (prop.type === 'object' && prop.properties) {
                for (const [subKey, subProp] of Object.entries(prop.properties)) {
                    if (!subProp.type) {
                        throw new ValidationError_1.ValidationError(`Nested property ${key}.${subKey} must have a type`);
                    }
                }
            }
            // Validate array items
            if (prop.type === 'array' && prop.items) {
                if (!prop.items.type) {
                    throw new ValidationError_1.ValidationError(`Array items in ${key} must have a type`);
                }
            }
        }
        // Validate rules
        if (schema.rules) {
            for (const rule of schema.rules) {
                if (!rule.condition) {
                    throw new ValidationError_1.ValidationError('Rule must have a condition');
                }
                if (!rule.message) {
                    throw new ValidationError_1.ValidationError('Rule must have an error message');
                }
            }
        }
    }
    /**
     * Handle schema version change
     */
    async handleSchemaVersion(oldSchema, newSchema) {
        // Find affected configurations
        const affected = Array.from(this.configs.values())
            .filter(c => c.schemaId === oldSchema.id);
        if (affected.length === 0) {
            return;
        }
        // Migrate configurations if enabled
        if (this.options.schemaMigration) {
            for (const config of affected) {
                try {
                    // Perform migration
                    const migrated = await this.migrateConfiguration(config, oldSchema, newSchema);
                    // Update configuration
                    config.version = newSchema.version;
                    config.settings = migrated;
                    config.lastModified = Date.now();
                    // Validate migrated configuration
                    if (this.options.validateOnSave) {
                        await this.validateConfiguration(config);
                    }
                    // Store updated configuration
                    await this.persistConfiguration(config);
                }
                catch (error) {
                    this.logger.error(`Failed to migrate configuration ${config.deviceId}:`, error);
                    throw error;
                }
            }
        }
        else {
            // Mark configurations as invalid
            for (const config of affected) {
                config.valid = false;
                config.errors = [`Schema version mismatch: ${config.version} != ${newSchema.version}`];
                await this.persistConfiguration(config);
            }
        }
    }
    /**
     * Migrate configuration to new schema version
     */
    async migrateConfiguration(config, oldSchema, newSchema) {
        const migrated = {};
        // Copy existing properties that exist in new schema
        for (const [key, prop] of Object.entries(newSchema.properties)) {
            if (config.settings[key] !== undefined) {
                // Validate value against new schema
                if (this.validateType(config.settings[key], prop.type)) {
                    migrated[key] = config.settings[key];
                }
                else if (prop.default !== undefined) {
                    migrated[key] = prop.default;
                }
            }
            else if (prop.default !== undefined) {
                migrated[key] = prop.default;
            }
        }
        return migrated;
    }
    /**
     * Validate value type
     */
    validateType(value, type) {
        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'object':
                return typeof value === 'object' && value !== null;
            case 'array':
                return Array.isArray(value);
            default:
                return false;
        }
    }
    /**
     * Evaluate validation rule
     */
    async evaluateRule(condition, context) {
        // Simple expression evaluator - replace with proper evaluator
        try {
            return new Function('context', `return ${condition}`)(context);
        }
        catch (error) {
            throw new Error(`Invalid rule condition: ${condition}`);
        }
    }
    /**
     * Persist schema to storage
     */
    async persistSchema(schema) {
        const key = `${this.options.storagePrefix}:schema:${schema.id}`;
        await this.database.set(key, JSON.stringify(schema));
    }
    /**
     * Persist configuration to storage
     */
    async persistConfiguration(config) {
        const key = `${this.options.storagePrefix}:config:${config.deviceId}`;
        await this.database.set(key, JSON.stringify(config));
    }
    /**
     * Prune old configuration history
     */
    async pruneConfigurations() {
        for (const config of this.configs.values()) {
            if (!config.history)
                continue;
            const originalLength = config.history.length;
            config.history = config.history.slice(-this.options.maxHistory);
            if (config.history.length !== originalLength) {
                await this.persistConfiguration(config);
            }
        }
    }
    /**
     * Cleanup resources
     */
    destroy() {
        if (this.pruneTimer) {
            clearInterval(this.pruneTimer);
        }
    }
}
exports.DeviceConfigManager = DeviceConfigManager;
//# sourceMappingURL=DeviceConfigManager.js.map