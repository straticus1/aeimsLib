import winston, { format, transports, Logger as WinstonLogger } from 'winston';
import 'winston-daily-rotate-file';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { TransformableInfo } from 'logform';

const { combine, timestamp, printf, colorize, json } = format;

// Define log levels
enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  DEBUG = 'debug',
  TRACE = 'trace'
}

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
winston.addColors(colors);

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }: TransformableInfo) => {
  const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${timestamp} [${level}]: ${message}${metaString}`;
});

// Request ID for correlating logs
const requestId = uuidv4();
const hostname = os.hostname();

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
  const transportList: winston.transport[] = [
    // Console transport for development
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      ),
      level: 'debug',
      handleExceptions: true
    })
  ];

  // File transport for production
  if (process.env.NODE_ENV === 'production') {
    transportList.push(
      new transports.DailyRotateFile({
        filename: 'logs/application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: combine(
          timestamp(),
          json()
        ),
        level: 'info'
      }),
      new transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: combine(
          timestamp(),
          json()
        )
      })
    );
  }

  return transportList;
};

// Create logger instance
const logger: WinstonLogger = winston.createLogger({
  ...baseLoggerConfig,
  transports: createTransports(),
  exceptionHandlers: [
    new transports.File({ filename: 'logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new transports.File({ filename: 'logs/rejections.log' })
  ]
});

// Add request context to logs
class Logger {
  private logger: WinstonLogger;
  private context: Record<string, unknown> = {};

  constructor() {
    this.logger = logger;
  }

  // Add contextual information to all subsequent logs
  public setContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }

  // Clear the current context
  public clearContext(): void {
    this.context = {};
  }

  // Log methods with different levels
  public error(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  public http(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.HTTP, message, meta);
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  public trace(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, meta);
  }

  // Generic log method
  private log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    const logData = {
      ...this.context,
      ...meta,
      requestId,
      timestamp: new Date().toISOString()
    };

    this.logger.log(level, message, logData);
  }

  // Create a child logger with additional context
  public child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger();
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }
}

// Create a default logger instance
export const defaultLogger = new Logger();

export default Logger;
