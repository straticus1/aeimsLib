import { DeviceMode } from '../types/DeviceTypes';
/**
 * Audit Logger
 * Handles secure logging of all device operations
 */
export declare class AuditLogger {
    private logDir;
    private currentLogFile;
    private rotationSize;
    private maxLogFiles;
    constructor();
    /**
     * Initialize logging system
     */
    private initialize;
    /**
     * Get current log file name
     */
    private getLogFileName;
    /**
     * Log a device operation
     */
    logDeviceOperation(operation: string, deviceId: string, metadata?: Record<string, any>): Promise<void>;
    /**
     * Log mode changes
     */
    logModeChange(mode: DeviceMode): Promise<void>;
    /**
     * Log errors
     */
    logError(message: string, error: Error, metadata?: Record<string, any>): Promise<void>;
    /**
     * Write log entry
     */
    private writeLog;
    /**
     * Check if log rotation is needed
     */
    private checkRotation;
}
