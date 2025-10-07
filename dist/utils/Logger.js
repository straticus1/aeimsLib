"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultLogger = void 0;
const winston_1 = __importStar(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const uuid_1 = require("uuid");
const os_1 = __importDefault(require("os"));
const { combine, timestamp, printf, colorize, json } = winston_1.format;
// Define log levels
var LogLevel;
(function (LogLevel) {
    LogLevel["ERROR"] = "error";
    LogLevel["WARN"] = "warn";
    LogLevel["INFO"] = "info";
    LogLevel["HTTP"] = "http";
    LogLevel["DEBUG"] = "debug";
    LogLevel["TRACE"] = "trace";
})(LogLevel || (LogLevel = {}));
// Define log colors
const colors = {
    [LogLevel.ERROR]: 'red',
    [LogLevel.WARN]: 'yellow',
    [LogLevel.INFO]: 'green',
    [LogLevel.HTTP]: 'magenta',
    [LogLevel.DEBUG]: 'blue',
    [LogLevel.TRACE]: 'gray'
};
// Add colors to winston
winston_1.default.addColors(colors);
// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaString}`;
});
// Request ID for correlating logs
const requestId = (0, uuid_1.v4)();
const hostname = os_1.default.hostname();
// Base logger configuration
const baseLoggerConfig = {
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
        service: 'aeimslib',
        environment: process.env.NODE_ENV || 'development',
        hostname,
        pid: process.pid
    },
    exitOnError: false
};
// Create transports based on environment
const createTransports = () => {
    const transportList = [
        // Console transport for development
        new winston_1.transports.Console({
            format: combine(colorize({ all: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), consoleFormat),
            level: 'debug',
            handleExceptions: true
        })
    ];
    // File transport for production
    if (process.env.NODE_ENV === 'production') {
        transportList.push(new winston_daily_rotate_file_1.default({
            filename: 'logs/application-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: combine(timestamp(), json()),
            level: 'info'
        }), new winston_1.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: combine(timestamp(), json())
        }));
    }
    return transportList;
};
// Create logger instance
const logger = winston_1.default.createLogger({
    ...baseLoggerConfig,
    transports: createTransports(),
    exceptionHandlers: [
        new winston_1.transports.File({ filename: 'logs/exceptions.log' })
    ],
    rejectionHandlers: [
        new winston_1.transports.File({ filename: 'logs/rejections.log' })
    ]
});
// Add request context to logs
class Logger {
    constructor() {
        this.context = {};
        this.logger = logger;
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    // Add contextual information to all subsequent logs
    setContext(context) {
        this.context = { ...this.context, ...context };
    }
    // Clear the current context
    clearContext() {
        this.context = {};
    }
    // Log methods with different levels
    error(message, meta) {
        this.log(LogLevel.ERROR, message, meta);
    }
    warn(message, meta) {
        this.log(LogLevel.WARN, message, meta);
    }
    info(message, meta) {
        this.log(LogLevel.INFO, message, meta);
    }
    http(message, meta) {
        this.log(LogLevel.HTTP, message, meta);
    }
    debug(message, meta) {
        this.log(LogLevel.DEBUG, message, meta);
    }
    trace(message, meta) {
        this.log(LogLevel.TRACE, message, meta);
    }
    // Generic log method
    log(level, message, meta = {}) {
        const logData = {
            ...this.context,
            ...meta,
            requestId,
            timestamp: new Date().toISOString()
        };
        this.logger.log(level, message, logData);
    }
    // Create a child logger with additional context
    child(context) {
        const childLogger = Logger.getInstance();
        childLogger.setContext({ ...this.context, ...context });
        return childLogger;
    }
}
// Create a default logger instance
exports.defaultLogger = Logger.getInstance();
exports.default = Logger;
//# sourceMappingURL=Logger.js.map