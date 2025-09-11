import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
interface AuditOptions {
    storageDir: string;
    maxFileSize?: number;
    maxFiles?: number;
    retentionDays?: number;
    signatureKey?: string;
    encryptionKey?: string;
    batchSize?: number;
    flushInterval?: number;
    compressionLevel?: number;
}
interface AuditEvent {
    id: string;
    type: string;
    timestamp: number;
    actor: {
        id: string;
        type: 'user' | 'device' | 'system';
        ip?: string;
    };
    action: {
        name: string;
        target?: string;
        status: 'success' | 'failure' | 'error';
        details?: any;
    };
    context?: {
        sessionId?: string;
        requestId?: string;
        deviceId?: string;
        location?: string;
        [key: string]: any;
    };
    metadata?: {
        severity?: 'info' | 'warning' | 'error' | 'critical';
        tags?: string[];
        [key: string]: any;
    };
}
interface AuditQuery {
    from?: number;
    to?: number;
    types?: string[];
    actors?: string[];
    actions?: string[];
    status?: ('success' | 'failure' | 'error')[];
    severity?: ('info' | 'warning' | 'error' | 'critical')[];
    tags?: string[];
    limit?: number;
    offset?: number;
}
/**
 * Audit Service
 * Provides comprehensive audit logging with secure storage and querying
 */
export declare class AuditService extends EventEmitter {
    private telemetry;
    private options;
    private eventQueue;
    private flushTimer?;
    constructor(telemetry: TelemetryManager, options: Partial<AuditOptions>);
    /**
     * Log an audit event
     */
    logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<string>;
    /**
     * Query audit events
     */
    queryEvents(query: AuditQuery): Promise<AuditEvent[]>;
    /**
     * Get event by ID
     */
    getEvent(id: string): Promise<AuditEvent | null>;
    /**
     * Archive old events
     */
    archiveEvents(olderThan: number): Promise<number>;
    /**
     * Clean up expired events
     */
    cleanupEvents(): Promise<number>;
    private initializeOptions;
    private startFlushTimer;
    private flush;
    private writeEvents;
    private writeDayEvents;
    private groupEventsByDay;
    private generateEventId;
}
export {};
