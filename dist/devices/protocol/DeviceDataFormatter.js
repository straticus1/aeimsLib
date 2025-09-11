"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceDataFormatter = exports.DataFormat = void 0;
const events_1 = require("events");
const ValidationError_1 = require("../../core/errors/ValidationError");
/**
 * Data Format Types
 */
var DataFormat;
(function (DataFormat) {
    // Basic formats
    DataFormat["RAW"] = "raw";
    DataFormat["JSON"] = "json";
    DataFormat["XML"] = "xml";
    DataFormat["CSV"] = "csv";
    DataFormat["HEX"] = "hex";
    DataFormat["BASE64"] = "base64";
    // Binary formats
    DataFormat["BINARY"] = "binary";
    DataFormat["MODBUS"] = "modbus";
    DataFormat["CANBUS"] = "canbus";
    // Text formats
    DataFormat["TEXT"] = "text";
    DataFormat["HTML"] = "html";
    DataFormat["YAML"] = "yaml";
    // Custom formats
    DataFormat["CUSTOM"] = "custom";
})(DataFormat || (exports.DataFormat = DataFormat = {}));
/**
 * Protocol Data Formatter
 * Handles data format conversion and validation for protocol messages
 */
class DeviceDataFormatter extends events_1.EventEmitter {
    constructor(logger, metrics, options = {}) {
        super();
        this.logger = logger;
        this.metrics = metrics;
        this.schemas = new Map();
        this.cache = new Map();
        this.options = this.initializeOptions(options);
    }
    /**
     * Register format schema
     */
    registerSchema(schema) {
        // Validate schema
        this.validateSchema(schema);
        // Store schema
        this.schemas.set(schema.id, schema);
    }
    /**
     * Format data between formats
     */
    async format(data, targetFormat, options = {}) {
        const startTime = Date.now();
        const inputSize = this.getDataSize(data);
        const result = {
            data: null,
            sourceFormat: options.sourceFormat || this.detectFormat(data),
            targetFormat: typeof targetFormat === 'string' ?
                targetFormat :
                targetFormat,
            success: false,
            metrics: {
                inputSize,
                outputSize: 0,
                duration: 0
            }
        };
        try {
            // Get schema if specified
            let schema;
            if (options.schema) {
                schema = typeof options.schema === 'string' ?
                    this.schemas.get(options.schema) :
                    options.schema;
                if (!schema) {
                    throw new Error('Schema not found');
                }
                result.schema = schema;
            }
            // Check cache
            const cacheKey = this.getCacheKey(data, result.targetFormat, schema);
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                result.data = cached;
                result.success = true;
                result.metrics.outputSize = this.getDataSize(cached);
                result.metrics.duration = Date.now() - startTime;
                return result;
            }
            // Create format context
            const context = {
                format: result.sourceFormat,
                schema,
                data,
                options: {
                    encoding: this.options.defaultEncoding,
                    strict: this.options.strictMode,
                    validate: true,
                    context: options.context
                }
            };
            // Validate input if enabled
            if (this.options.validateInput) {
                const errors = await this.validateData(data, context);
                if (errors.length > 0) {
                    result.success = false;
                    result.errors = errors;
                    return result;
                }
            }
            // Format data
            let formatted = await this.formatData(data, result.targetFormat, context);
            // Validate output if enabled
            if (this.options.validateOutput) {
                const errors = await this.validateData(formatted, {
                    ...context,
                    format: result.targetFormat
                });
                if (errors.length > 0) {
                    result.success = false;
                    result.errors = errors;
                    return result;
                }
            }
            // Update cache
            this.updateCache(cacheKey, formatted);
            // Update result
            result.data = formatted;
            result.success = true;
            result.metrics.outputSize = this.getDataSize(formatted);
        }
        catch (error) {
            result.success = false;
            result.errors = [error.message];
            this.logger.error('Format error:', error);
            throw error;
        }
        finally {
            result.metrics.duration = Date.now() - startTime;
            // Track metrics
            this.metrics.track({
                type: 'format_operation',
                timestamp: Date.now(),
                data: {
                    sourceFormat: result.sourceFormat,
                    targetFormat: result.targetFormat,
                    schemaId: result.schema?.id,
                    success: result.success,
                    metrics: result.metrics
                }
            }).catch(() => { });
        }
        return result;
    }
    /**
     * Clear formatter cache
     */
    clearCache() {
        this.cache.clear();
    }
    /**
     * Initialize options
     */
    initializeOptions(options) {
        return {
            defaultEncoding: options.defaultEncoding || 'utf8',
            defaultByteOrder: options.defaultByteOrder || [0, 1, 2, 3],
            strictMode: options.strictMode !== false,
            validateInput: options.validateInput !== false,
            validateOutput: options.validateOutput !== false,
            validateSchemas: options.validateSchemas !== false,
            cacheEnabled: options.cacheEnabled !== false,
            cacheTTL: options.cacheTTL || 300000, // 5 minutes
            cacheSize: options.cacheSize || 1000,
            customFormatters: options.customFormatters || {}
        };
    }
    /**
     * Validate format schema
     */
    validateSchema(schema) {
        if (!schema.id) {
            throw new ValidationError_1.ValidationError('Schema must have an ID');
        }
        if (!schema.name) {
            throw new ValidationError_1.ValidationError('Schema must have a name');
        }
        if (!schema.format) {
            throw new ValidationError_1.ValidationError('Schema must specify a format');
        }
        // Validate field definitions
        if (schema.fields) {
            for (const field of schema.fields) {
                if (!field.name) {
                    throw new ValidationError_1.ValidationError('Field must have a name');
                }
                if (!field.type) {
                    throw new ValidationError_1.ValidationError(`Field ${field.name} must have a type`);
                }
            }
        }
        // Validate custom formatters
        if (schema.formatters) {
            if (schema.formatters.encode) {
                try {
                    new Function('data', 'context', schema.formatters.encode);
                }
                catch (error) {
                    throw new ValidationError_1.ValidationError(`Invalid encode formatter: ${error.message}`);
                }
            }
            if (schema.formatters.decode) {
                try {
                    new Function('data', 'context', schema.formatters.decode);
                }
                catch (error) {
                    throw new ValidationError_1.ValidationError(`Invalid decode formatter: ${error.message}`);
                }
            }
        }
    }
    /**
     * Detect data format
     */
    detectFormat(data) {
        if (data === null || data === undefined) {
            return DataFormat.RAW;
        }
        if (Buffer.isBuffer(data)) {
            return DataFormat.BINARY;
        }
        if (ArrayBuffer.isView(data)) {
            return DataFormat.BINARY;
        }
        if (typeof data === 'string') {
            // Check for JSON
            try {
                JSON.parse(data);
                return DataFormat.JSON;
            }
            catch { }
            // Check for XML
            if (data.trim().startsWith('<?xml') ||
                data.trim().startsWith('<')) {
                return DataFormat.XML;
            }
            // Check for CSV
            if (data.includes(',') &&
                data.split('\n').every(line => line.split(',').length === data.split('\n')[0].split(',').length)) {
                return DataFormat.CSV;
            }
            // Check for hex
            if (/^[0-9A-Fa-f]+$/.test(data)) {
                return DataFormat.HEX;
            }
            // Check for base64
            if (/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
                return DataFormat.BASE64;
            }
            return DataFormat.TEXT;
        }
        if (typeof data === 'object') {
            return DataFormat.JSON;
        }
        return DataFormat.RAW;
    }
    /**
     * Format data between formats
     */
    async formatData(data, targetFormat, context) {
        const sourceFormat = context.format;
        // Check for custom formatter
        const customFormatter = this.options.customFormatters[targetFormat];
        if (customFormatter) {
            if (sourceFormat === targetFormat) {
                return data;
            }
            return customFormatter.encode(data, context);
        }
        // Handle basic format conversions
        switch (targetFormat) {
            case DataFormat.RAW:
                return data;
            case DataFormat.JSON:
                if (sourceFormat === DataFormat.JSON) {
                    return data;
                }
                if (typeof data === 'string') {
                    return JSON.parse(data);
                }
                if (Buffer.isBuffer(data)) {
                    return JSON.parse(data.toString(context.options?.encoding));
                }
                return JSON.parse(JSON.stringify(data));
            case DataFormat.XML:
                if (sourceFormat === DataFormat.XML) {
                    return data;
                }
                // TODO: Implement XML conversion
                throw new Error('XML conversion not implemented');
            case DataFormat.CSV:
                if (sourceFormat === DataFormat.CSV) {
                    return data;
                }
                if (Array.isArray(data)) {
                    return this.arrayToCSV(data);
                }
                throw new Error('Cannot convert to CSV');
            case DataFormat.HEX:
                if (sourceFormat === DataFormat.HEX) {
                    return data;
                }
                if (Buffer.isBuffer(data)) {
                    return data.toString('hex');
                }
                if (typeof data === 'string') {
                    return Buffer.from(data, context.options?.encoding).toString('hex');
                }
                throw new Error('Cannot convert to hex');
            case DataFormat.BASE64:
                if (sourceFormat === DataFormat.BASE64) {
                    return data;
                }
                if (Buffer.isBuffer(data)) {
                    return data.toString('base64');
                }
                if (typeof data === 'string') {
                    return Buffer.from(data, context.options?.encoding).toString('base64');
                }
                throw new Error('Cannot convert to base64');
            case DataFormat.BINARY:
                if (sourceFormat === DataFormat.BINARY) {
                    return data;
                }
                if (typeof data === 'string') {
                    return Buffer.from(data, context.options?.encoding);
                }
                throw new Error('Cannot convert to binary');
            case DataFormat.TEXT:
                if (sourceFormat === DataFormat.TEXT) {
                    return data;
                }
                if (Buffer.isBuffer(data)) {
                    return data.toString(context.options?.encoding);
                }
                return String(data);
            default:
                throw new Error(`Unsupported target format: ${targetFormat}`);
        }
    }
    /**
     * Validate formatted data
     */
    async validateData(data, context) {
        const errors = [];
        // Skip validation if disabled
        if (context.options?.validate === false) {
            return errors;
        }
        // Validate against schema if available
        if (context.schema?.fields) {
            for (const field of context.schema.fields) {
                const value = this.getFieldValue(data, field);
                // Check required fields
                if (value === undefined) {
                    errors.push(`Missing required field: ${field.name}`);
                    continue;
                }
                // Validate type
                if (!this.validateFieldType(value, field.type)) {
                    errors.push(`Invalid type for field ${field.name}: expected ${field.type}`);
                }
                // Validate format if specified
                if (field.format && !this.validateFieldFormat(value, field.format)) {
                    errors.push(`Invalid format for field ${field.name}: ${field.format}`);
                }
                // Execute custom validation if specified
                if (field.validate) {
                    try {
                        const valid = new Function('value', 'context', `return ${field.validate}`)(value, context);
                        if (!valid) {
                            errors.push(`Validation failed for field ${field.name}`);
                        }
                    }
                    catch (error) {
                        errors.push(`Error validating field ${field.name}: ${error.message}`);
                    }
                }
            }
        }
        // Execute schema-level validation if specified
        if (context.schema?.formatters?.validate) {
            try {
                const valid = new Function('data', 'context', context.schema.formatters.validate)(data, context);
                if (!valid) {
                    errors.push('Schema validation failed');
                }
            }
            catch (error) {
                errors.push(`Schema validation error: ${error.message}`);
            }
        }
        return errors;
    }
    /**
     * Get field value from data
     */
    getFieldValue(data, field) {
        if (field.offset !== undefined && Buffer.isBuffer(data)) {
            return data.slice(field.offset, field.offset + (field.length || 1));
        }
        if (typeof data === 'object' && data !== null) {
            return data[field.name];
        }
        return undefined;
    }
    /**
     * Validate field type
     */
    validateFieldType(value, type) {
        switch (type.toLowerCase()) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'buffer':
                return Buffer.isBuffer(value);
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null;
            default:
                return false;
        }
    }
    /**
     * Validate field format
     */
    validateFieldFormat(value, format) {
        switch (format.toLowerCase()) {
            case 'email':
                return /^[^@]+@[^@]+\.[^@]+$/.test(value);
            case 'url':
                try {
                    new URL(value);
                    return true;
                }
                catch {
                    return false;
                }
            case 'date':
                return !isNaN(Date.parse(value));
            case 'hex':
                return /^[0-9A-Fa-f]+$/.test(value);
            case 'base64':
                return /^[A-Za-z0-9+/]*={0,2}$/.test(value);
            case 'uuid':
                return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
            default:
                return true;
        }
    }
    /**
     * Convert array to CSV
     */
    arrayToCSV(data) {
        if (data.length === 0) {
            return '';
        }
        // Get headers from first row
        const headers = Object.keys(data[0]);
        // Build CSV rows
        const rows = [
            headers.join(','),
            ...data.map(row => headers.map(header => this.escapeCSVValue(row[header])).join(','))
        ];
        return rows.join('\n');
    }
    /**
     * Escape CSV value
     */
    escapeCSVValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    }
    /**
     * Get data size
     */
    getDataSize(data) {
        if (Buffer.isBuffer(data)) {
            return data.length;
        }
        if (typeof data === 'string') {
            return data.length;
        }
        if (ArrayBuffer.isView(data)) {
            return data.byteLength;
        }
        if (typeof data === 'object') {
            return JSON.stringify(data).length;
        }
        return String(data).length;
    }
    /**
     * Get cache key
     */
    getCacheKey(data, format, schema) {
        if (Buffer.isBuffer(data)) {
            return `${data.toString('hex')}:${format}:${schema?.id}`;
        }
        if (typeof data === 'object') {
            return `${JSON.stringify(data)}:${format}:${schema?.id}`;
        }
        return `${data}:${format}:${schema?.id}`;
    }
    /**
     * Get cached data
     */
    getFromCache(key) {
        if (!this.options.cacheEnabled) {
            return undefined;
        }
        const cached = this.cache.get(key);
        if (!cached) {
            return undefined;
        }
        // Check TTL
        if (Date.now() - cached.timestamp > this.options.cacheTTL) {
            this.cache.delete(key);
            return undefined;
        }
        return cached.data;
    }
    /**
     * Update cache
     */
    updateCache(key, data) {
        if (!this.options.cacheEnabled) {
            return;
        }
        // Prune cache if needed
        if (this.cache.size >= this.options.cacheSize) {
            const oldest = Array.from(this.cache.entries())
                .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];
            if (oldest) {
                this.cache.delete(oldest[0]);
            }
        }
        // Update cache
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
}
exports.DeviceDataFormatter = DeviceDataFormatter;
//# sourceMappingURL=DeviceDataFormatter.js.map