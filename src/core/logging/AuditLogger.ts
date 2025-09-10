import { appendFile, mkdir, readdir, stat, rename, unlink } from 'fs/promises';
import { join } from 'path';
import { DeviceMode } from '../types/DeviceTypes';

interface AuditLogEntry {
  timestamp: number;
  operation: string;
  deviceId?: string;
  mode?: DeviceMode;
  metadata?: Record<string, any>;
  userId?: string;
  ipAddress?: string;
}

/**
 * Audit Logger
 * Handles secure logging of all device operations
 */
export class AuditLogger {
  private logDir: string;
  private currentLogFile: string;
  private rotationSize: number = 10 * 1024 * 1024; // 10MB
  private maxLogFiles: number = 10;

  constructor() {
    this.logDir = process.env.AEIMS_LOG_DIR ||
      join(process.cwd(), '.aeims', 'logs');
    this.currentLogFile = this.getLogFileName();
    this.initialize();
  }

  /**
   * Initialize logging system
   */
  private async initialize() {
    try {
      await mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize audit logging:', error);
      // Don't throw - logging should not block operations
    }
  }

  /**
   * Get current log file name
   */
  private getLogFileName(): string {
    const date = new Date();
    return join(
      this.logDir,
      `audit_${date.getFullYear()}${
        String(date.getMonth() + 1).padStart(2, '0')
      }${
        String(date.getDate()).padStart(2, '0')
      }.log`
    );
  }

  /**
   * Log a device operation
   */
  async logDeviceOperation(
    operation: string,
    deviceId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const entry: AuditLogEntry = {
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
  async logModeChange(mode: DeviceMode): Promise<void> {
    const entry: AuditLogEntry = {
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
  async logError(
    message: string,
    error: Error,
    metadata?: Record<string, any>
  ): Promise<void> {
    const entry: AuditLogEntry = {
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
  private async writeLog(entry: AuditLogEntry): Promise<void> {
    try {
      // Format log entry
      const logLine = JSON.stringify({
        ...entry,
        timestamp: new Date(entry.timestamp).toISOString()
      }) + '\n';

      // Write to current log file
      await appendFile(this.currentLogFile, logLine);

      // Check if rotation needed
      await this.checkRotation();
      
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Don't throw - logging should not block operations
    }
  }

  /**
   * Check if log rotation is needed
   */
  private async checkRotation(): Promise<void> {
    try {
      const stats = await stat(this.currentLogFile);
      
      if (stats.size >= this.rotationSize) {
        const oldPath = this.currentLogFile;
        this.currentLogFile = this.getLogFileName();
        
        // Rotate file
        await rename(
          oldPath,
          `${oldPath}.${Date.now()}`
        );

        // Clean old files
        const files = await readdir(this.logDir);
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
            await unlink(join(this.logDir, logFiles[i]));
          }
        }
      }
    } catch (error) {
      console.error('Failed to rotate audit logs:', error);
      // Don't throw - logging should not block operations
    }
  }
}
