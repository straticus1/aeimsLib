"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
/**
 * Audit Logger
 * Handles secure logging of all device operations
 */
class AuditLogger {
    constructor() {
        this.rotationSize = 10 * 1024 * 1024; // 10MB
        this.maxLogFiles = 10;
        this.logDir = process.env.AEIMS_LOG_DIR ||
            (0, path_1.join)(process.cwd(), '.aeims', 'logs');
        this.currentLogFile = this.getLogFileName();
        this.initialize();
    }
    /**
     * Initialize logging system
     */
    async initialize() {
        try {
            await (0, promises_1.mkdir)(this.logDir, { recursive: true });
        }
        catch (error) {
            console.error('Failed to initialize audit logging:', error);
            // Don't throw - logging should not block operations
        }
    }
    /**
     * Get current log file name
     */
    getLogFileName() {
        const date = new Date();
        return (0, path_1.join)(this.logDir, `audit_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}.log`);
    }
    /**
     * Log a device operation
     */
    async logDeviceOperation(operation, deviceId, metadata) {
        const entry = {
            timestamp: Date.now(),
            operation,
            deviceId,
            metadata,
            userId: process.env.AEIMS_USER_ID,
            ipAddress: process.env.AEIMS_CLIENT_IP
        };
        await this.writeLog(entry);
    }
    /**
     * Log mode changes
     */
    async logModeChange(mode) {
        const entry = {
            timestamp: Date.now(),
            operation: 'mode_change',
            mode,
            userId: process.env.AEIMS_USER_ID,
            ipAddress: process.env.AEIMS_CLIENT_IP
        };
        await this.writeLog(entry);
    }
    /**
     * Log errors
     */
    async logError(message, error, metadata) {
        const entry = {
            timestamp: Date.now(),
            operation: 'error',
            metadata: {
                message,
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                },
                ...metadata
            },
            userId: process.env.AEIMS_USER_ID,
            ipAddress: process.env.AEIMS_CLIENT_IP
        };
        await this.writeLog(entry);
    }
    /**
     * Write log entry
     */
    async writeLog(entry) {
        try {
            // Format log entry
            const logLine = JSON.stringify({
                ...entry,
                timestamp: new Date(entry.timestamp).toISOString()
            }) + '\n';
            // Write to current log file
            await (0, promises_1.appendFile)(this.currentLogFile, logLine);
            // Check if rotation needed
            await this.checkRotation();
        }
        catch (error) {
            console.error('Failed to write audit log:', error);
            // Don't throw - logging should not block operations
        }
    }
    /**
     * Check if log rotation is needed
     */
    async checkRotation() {
        try {
            const stats = await (0, promises_1.stat)(this.currentLogFile);
            if (stats.size >= this.rotationSize) {
                const oldPath = this.currentLogFile;
                this.currentLogFile = this.getLogFileName();
                // Rotate file
                await (0, promises_1.rename)(oldPath, `${oldPath}.${Date.now()}`);
                // Clean old files
                const files = await (0, promises_1.readdir)(this.logDir);
                const logFiles = files
                    .filter(f => f.startsWith('audit_'))
                    .sort((a, b) => {
                    const timeA = parseInt(a.split('.')[1] || '0');
                    const timeB = parseInt(b.split('.')[1] || '0');
                    return timeB - timeA;
                });
                // Delete oldest files if we have too many
                if (logFiles.length > this.maxLogFiles) {
                    for (let i = this.maxLogFiles; i < logFiles.length; i++) {
                        await (0, promises_1.unlink)((0, path_1.join)(this.logDir, logFiles[i]));
                    }
                }
            }
        }
        catch (error) {
            console.error('Failed to rotate audit logs:', error);
            // Don't throw - logging should not block operations
        }
    }
}
exports.AuditLogger = AuditLogger;
//# sourceMappingURL=AuditLogger.js.map