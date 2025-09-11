import { EventEmitter } from 'events';
import { DeviceManager } from '../DeviceManager';
import { TelemetryManager } from '../telemetry/TelemetryManager';
import { Pattern } from '../patterns/Pattern';
interface Participant {
    userId: string;
    role: 'performer' | 'audience' | 'moderator';
    deviceIds: string[];
    permissions: string[];
    tips?: {
        total: number;
        currency: string;
        lastTip?: {
            amount: number;
            timestamp: number;
        };
    };
}
interface Session {
    id: string;
    name: string;
    type: 'performance' | 'interactive' | 'private';
    status: 'pending' | 'active' | 'paused' | 'ended';
    startTime?: number;
    endTime?: number;
    participants: Map<string, Participant>;
    activePatterns: Map<string, {
        pattern: Pattern;
        targetDevices: string[];
        startTime: number;
    }>;
    settings: {
        maxParticipants?: number;
        allowTips?: boolean;
        allowAudienceControl?: boolean;
        requireConsent?: boolean;
        autoSync?: boolean;
    };
}
/**
 * SessionCoordinator
 * Manages multi-user sessions with synchronization and interaction.
 */
export declare class SessionCoordinator extends EventEmitter {
    private deviceManager;
    private telemetry;
    private sessions;
    private userSessions;
    private deviceSessions;
    constructor(deviceManager: DeviceManager, telemetry: TelemetryManager);
    /**
     * Create a new session
     */
    createSession(name: string, type: Session['type'], creator: {
        userId: string;
        deviceIds: string[];
        role: Participant['role'];
    }, settings?: Session['settings']): Promise<Session>;
    /**
     * Join an existing session
     */
    joinSession(sessionId: string, participant: {
        userId: string;
        deviceIds: string[];
        role: Participant['role'];
    }): Promise<void>;
    /**
     * Leave a session
     */
    leaveSession(sessionId: string, userId: string): Promise<void>;
    /**
     * Start a session
     */
    startSession(sessionId: string): Promise<void>;
    /**
     * End a session
     */
    endSession(sessionId: string): Promise<void>;
    /**
     * Send a tip to a participant
     */
    sendTip(sessionId: string, fromUserId: string, toUserId: string, amount: number, currency?: string): Promise<void>;
    /**
     * Start a pattern for session participants
     */
    startPattern(sessionId: string, pattern: Pattern, targetUserIds?: string[]): Promise<void>;
    /**
     * Stop a pattern for session participants
     */
    stopPattern(sessionId: string, patternId: string, targetUserIds?: string[]): Promise<void>;
    private getDefaultPermissions;
    private updateUserSessionMapping;
    private syncParticipantPatterns;
    private findParticipantByDevice;
}
export {};
