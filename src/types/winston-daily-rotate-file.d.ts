declare module 'winston-daily-rotate-file' {
  import { TransportStreamOptions } from 'winston-transport';

  interface DailyRotateFileTransportOptions extends TransportStreamOptions {
    filename?: string;
    datePattern?: string;
    zippedArchive?: boolean;
    maxSize?: string | number;
    maxFiles?: string | number;
    options?: any;
    auditFile?: string;
    frequency?: string;
    utc?: boolean;
    extension?: string;
    createSymlink?: boolean;
    symlinkName?: string;
  }

  class DailyRotateFile {
    constructor(options?: DailyRotateFileTransportOptions);
  }

  export = DailyRotateFile;
}