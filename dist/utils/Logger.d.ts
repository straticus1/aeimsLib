import 'winston-daily-rotate-file';
declare class Logger {
    private static instance;
    private logger;
    private context;
    private constructor();
    static getInstance(): Logger;
    setContext(context: Record<string, unknown>): void;
    clearContext(): void;
    error(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    http(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
    trace(message: string, meta?: Record<string, unknown>): void;
    private log;
    child(context: Record<string, unknown>): Logger;
}
export declare const defaultLogger: Logger;
export default Logger;
