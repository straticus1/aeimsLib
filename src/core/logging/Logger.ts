import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export interface LoggerConfig {
  level: string;
  format?: winston.Logform.Format;
  transports?: winston.transport[];
  filename?: string;
  maxSize?: string;
  maxFiles?: string;
  datePattern?: string;
}

export class Logger {
  private logger: winston.Logger;

  constructor(config: LoggerConfig = { level: 'info' }) {
    const defaultTransports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ];

    if (config.filename) {
      const rotateTransport = new DailyRotateFile({
        filename: config.filename,
        datePattern: config.datePattern || 'YYYY-MM-DD',
        maxSize: config.maxSize || '20m',
        maxFiles: config.maxFiles || '14d',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      });
      defaultTransports.push(rotateTransport);
    }

    this.logger = winston.createLogger({
      level: config.level,
      format: config.format || winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: config.transports || defaultTransports
    });
  }

  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  verbose(message: string, meta?: any): void {
    this.logger.verbose(message, meta);
  }
}

export default Logger;