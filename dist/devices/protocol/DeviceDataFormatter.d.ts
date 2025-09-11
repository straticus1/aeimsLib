import { EventEmitter } from 'events';
import { Logger } from '../../core/logging/Logger';
import { MetricsCollector } from '../../core/metrics/MetricsCollector';
/**
 * Data Format Types
 */
export declare enum DataFormat {
    RAW = "raw",
    JSON = "json",
    XML = "xml",
    CSV = "csv",
    HEX = "hex",
    BASE64 = "base64",
    BINARY = "binary",
    MODBUS = "modbus",
    CANBUS = "canbus",
    TEXT = "text",
    HTML = "html",
    YAML = "yaml",
    CUSTOM = "custom"
}
/**
 * Data Format Schema
 */
export interface DataFormatSchema {
    id: string;
    name: string;
    description?: string;
    format: DataFormat;
    encoding?: string;
    endianness?: 'little' | 'big';
    wordSize?: number;
    byteOrder?: number[];
    fields?: Array<{
        name: string;
        type: string;
        offset?: number;
        length?: number;
        format?: string;
        transform?: string;
        validate?: string;
    }>;
    formatters?: {
        encode?: string;
        decode?: string;
        validate?: string;
    };
}
/**
 * Format Context
 */
export interface FormatContext {
    format: DataFormat;
    schema?: DataFormatSchema;
    data: any;
    options?: {
        encoding?: string;
        strict?: boolean;
        validate?: boolean;
        [key: string]: any;
    };
}
/**
 * Format Result
 */
export interface FormatResult {
    data: any;
    sourceFormat: DataFormat;
    targetFormat: DataFormat;
    schema?: DataFormatSchema;
    success: boolean;
    errors?: string[];
    warnings?: string[];
    metrics?: {
        inputSize: number;
        outputSize: number;
        duration: number;
    };
}
/**
 * Data Formatter Options
 */
interface DataFormatterOptions {
    defaultEncoding?: string;
    defaultByteOrder?: number[];
    strictMode?: boolean;
    validateInput?: boolean;
    validateOutput?: boolean;
    validateSchemas?: boolean;
    cacheEnabled?: boolean;
    cacheTTL?: number;
    cacheSize?: number;
    customFormatters?: {
        [key: string]: {
            encode: (data: any, context: FormatContext) => Promise<any>;
            decode: (data: any, context: FormatContext) => Promise<any>;
        };
    };
}
/**
 * Protocol Data Formatter
 * Handles data format conversion and validation for protocol messages
 */
export declare class DeviceDataFormatter extends EventEmitter {
    private logger;
    private metrics;
    private options;
    private schemas;
    private cache;
    constructor(logger: Logger, metrics: MetricsCollector, options?: DataFormatterOptions);
    /**
     * Register format schema
     */
    registerSchema(schema: DataFormatSchema): void;
    /**
     * Format data between formats
     */
    format(data: any, targetFormat: DataFormat | string, options?: {
        sourceFormat?: DataFormat;
        schema?: string | DataFormatSchema;
        context?: any;
    }): Promise<FormatResult>;
    /**
     * Clear formatter cache
     */
    clearCache(): void;
    /**
     * Initialize options
     */
    private initializeOptions;
    /**
     * Validate format schema
     */
    private validateSchema;
    /**
     * Detect data format
     */
    private detectFormat;
    /**
     * Format data between formats
     */
    private formatData;
    /**
     * Validate formatted data
     */
    private validateData;
    /**
     * Get field value from data
     */
    private getFieldValue;
    /**
     * Validate field type
     */
    private validateFieldType;
    /**
     * Validate field format
     */
    private validateFieldFormat;
    /**
     * Convert array to CSV
     */
    private arrayToCSV;
    /**
     * Escape CSV value
     */
    private escapeCSVValue;
    /**
     * Get data size
     */
    private getDataSize;
    /**
     * Get cache key
     */
    private getCacheKey;
    /**
     * Get cached data
     */
    private getFromCache;
    /**
     * Update cache
     */
    private updateCache;
}
export {};
