"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultLogger = void 0;
var winston_1 = __importStar(require("winston"));
var winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
var uuid_1 = require("uuid");
var os_1 = __importDefault(require("os"));
var combine = winston_1.format.combine, timestamp = winston_1.format.timestamp, printf = winston_1.format.printf, colorize = winston_1.format.colorize, json = winston_1.format.json;
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
var colors = (_a = {},
    _a[LogLevel.ERROR] = 'red',
    _a[LogLevel.WARN] = 'yellow',
    _a[LogLevel.INFO] = 'green',
    _a[LogLevel.HTTP] = 'magenta',
    _a[LogLevel.DEBUG] = 'blue',
    _a[LogLevel.TRACE] = 'gray',
    _a);
// Add colors to winston
winston_1.default.addColors(colors);
// Custom format for console output
var consoleFormat = printf(function (_a) {
    var level = _a.level, message = _a.message, timestamp = _a.timestamp, meta = __rest(_a, ["level", "message", "timestamp"]);
    var metaString = Object.keys(meta).length ? "\n".concat(JSON.stringify(meta, null, 2)) : '';
    return "".concat(timestamp, " [").concat(level, "]: ").concat(message).concat(metaString);
});
// Request ID for correlating logs
var requestId = (0, uuid_1.v4)();
var hostname = os_1.default.hostname();
// Base logger configuration
var baseLoggerConfig = {
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
        service: 'aeimslib',
        environment: process.env.NODE_ENV || 'development',
        hostname: hostname,
        pid: process.pid
    },
    exitOnError: false
};
// Create transports based on environment
var createTransports = function () {
    var transportList = [
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
var logger = winston_1.default.createLogger(__assign(__assign({}, baseLoggerConfig), { transports: createTransports(), exceptionHandlers: [
        new winston_1.transports.File({ filename: 'logs/exceptions.log' })
    ], rejectionHandlers: [
        new winston_1.transports.File({ filename: 'logs/rejections.log' })
    ] }));
// Add request context to logs
var Logger = /** @class */ (function () {
    function Logger() {
        this.context = {};
        this.logger = logger;
    }
    Logger.getInstance = function () {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    };
    // Add contextual information to all subsequent logs
    Logger.prototype.setContext = function (context) {
        this.context = __assign(__assign({}, this.context), context);
    };
    // Clear the current context
    Logger.prototype.clearContext = function () {
        this.context = {};
    };
    // Log methods with different levels
    Logger.prototype.error = function (message, meta) {
        this.log(LogLevel.ERROR, message, meta);
    };
    Logger.prototype.warn = function (message, meta) {
        this.log(LogLevel.WARN, message, meta);
    };
    Logger.prototype.info = function (message, meta) {
        this.log(LogLevel.INFO, message, meta);
    };
    Logger.prototype.http = function (message, meta) {
        this.log(LogLevel.HTTP, message, meta);
    };
    Logger.prototype.debug = function (message, meta) {
        this.log(LogLevel.DEBUG, message, meta);
    };
    Logger.prototype.trace = function (message, meta) {
        this.log(LogLevel.TRACE, message, meta);
    };
    // Generic log method
    Logger.prototype.log = function (level, message, meta) {
        if (meta === void 0) { meta = {}; }
        var logData = __assign(__assign(__assign({}, this.context), meta), { requestId: requestId, timestamp: new Date().toISOString() });
        this.logger.log(level, message, logData);
    };
    // Create a child logger with additional context
    Logger.prototype.child = function (context) {
        var childLogger = Logger.getInstance();
        childLogger.setContext(__assign(__assign({}, this.context), context));
        return childLogger;
    };
    return Logger;
}());
// Create a default logger instance
exports.defaultLogger = Logger.getInstance();
exports.default = Logger;
