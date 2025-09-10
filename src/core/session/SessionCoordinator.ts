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
export class SessionCoordinator extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private deviceSessions: Map<string, string> = new Map();

  constructor(
    private deviceManager: DeviceManager,
    private telemetry: TelemetryManager
  ) {
    super();
  }

  /**
   * Create a new session
   */
  async createSession(
    name: string,
    type: Session['type'],
    creator: {
      userId: string;
      deviceIds: string[];
      role: Participant['role'];
    },
    settings: Session['settings'] = {}
  ): Promise<Session> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const session: Session = {
      id: sessionId,
      name,
      type,
      status: 'pending',
      participants: new Map(),
      activePatterns: new Map(),
      settings
    };

    // Add creator as first participant
    session.participants.set(creator.userId, {
      userId: creator.userId,
      role: creator.role,
      deviceIds: creator.deviceIds,
      permissions: this.getDefaultPermissions(creator.role),
      tips: {
        total: 0,
        currency: 'USD'
      }
    });

    // Track session associations
    this.sessions.set(sessionId, session);
    this.updateUserSessionMapping(creator.userId, sessionId, 'add');
    creator.deviceIds.forEach(deviceId => 
      this.deviceSessions.set(deviceId, sessionId)
    );

    await this.telemetry.track({
      type: 'session_created',
      timestamp: Date.now(),
      sessionId,
      data: {
        name,
        type,
        creatorId: creator.userId
      }
    });

    this.emit('sessionCreated', { sessionId, session });
    return session;
  }

  /**
   * Join an existing session
   */
  async joinSession(
    sessionId: string,
    participant: {
      userId: string;
      deviceIds: string[];
      role: Participant['role'];
    }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status === 'ended') {
      throw new Error('Session has ended');
    }

    if (session.settings.maxParticipants && 
        session.participants.size >= session.settings.maxParticipants) {
      throw new Error('Session is full');
    }

    // Add participant
    session.participants.set(participant.userId, {
      userId: participant.userId,
      role: participant.role,
      deviceIds: participant.deviceIds,
      permissions: this.getDefaultPermissions(participant.role),
      tips: {
        total: 0,
        currency: 'USD'
      }
    });

    // Track associations
    this.updateUserSessionMapping(participant.userId, sessionId, 'add');
    participant.deviceIds.forEach(deviceId => 
      this.deviceSessions.set(deviceId, sessionId)
    );

    await this.telemetry.track({
      type: 'session_joined',
      timestamp: Date.now(),
      sessionId,
      data: {
        userId: participant.userId,
        role: participant.role
      }
    });

    this.emit('participantJoined', {
      sessionId,
      participant: session.participants.get(participant.userId)
    });

    // Sync active patterns if enabled
    if (session.settings.autoSync) {
      await this.syncParticipantPatterns(sessionId, participant.userId);
    }
  }

  /**
   * Leave a session
   */
  async leaveSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const participant = session.participants.get(userId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Stop patterns on participant's devices
    for (const deviceId of participant.deviceIds) {
      await this.deviceManager.stopPattern(deviceId);
      this.deviceSessions.delete(deviceId);
    }

    // Remove participant
    session.participants.delete(userId);
    this.updateUserSessionMapping(userId, sessionId, 'remove');

    await this.telemetry.track({
      type: 'session_left',
      timestamp: Date.now(),
      sessionId,
      data: {
        userId,
        role: participant.role
      }
    });

    this.emit('participantLeft', {
      sessionId,
      participant
    });

    // End session if no participants left
    if (session.participants.size === 0) {
      await this.endSession(sessionId);
    }
  }

  /**
   * Start a session
   */
  async startSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'active';
    session.startTime = Date.now();

    await this.telemetry.track({
      type: 'session_started',
      timestamp: session.startTime,
      sessionId
    });

    this.emit('sessionStarted', { sessionId, session });
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'ended';
    session.endTime = Date.now();

    // Stop all patterns
    for (const participant of session.participants.values()) {
      for (const deviceId of participant.deviceIds) {
        await this.deviceManager.stopPattern(deviceId);
        this.deviceSessions.delete(deviceId);
      }
      this.updateUserSessionMapping(participant.userId, sessionId, 'remove');
    }

    // Clear session data
    session.activePatterns.clear();
    session.participants.clear();
    this.sessions.delete(sessionId);

    await this.telemetry.track({
      type: 'session_ended',
      timestamp: session.endTime,
      sessionId,
      durationMs: session.startTime ? session.endTime - session.startTime : 0
    });

    this.emit('sessionEnded', { sessionId, session });
  }

  /**
   * Send a tip to a participant
   */
  async sendTip(
    sessionId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const recipient = session.participants.get(toUserId);
    if (!recipient) {
      throw new Error('Recipient not found');
    }

    if (!session.settings.allowTips) {
      throw new Error('Tips are not allowed in this session');
    }

    // Update tip stats
    recipient.tips = recipient.tips || {
      total: 0,
      currency
    };
    recipient.tips.total += amount;
    recipient.tips.lastTip = {
      amount,
      timestamp: Date.now()
    };

    await this.telemetry.track({
      type: 'tip_sent',
      timestamp: Date.now(),
      sessionId,
      data: {
        fromUserId,
        toUserId,
        amount,
        currency
      }
    });

    this.emit('tipSent', {
      sessionId,
      fromUserId,
      toUserId,
      amount,
      currency
    });
  }

  /**
   * Start a pattern for session participants
   */
  async startPattern(
    sessionId: string,
    pattern: Pattern,
    targetUserIds?: string[]
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'active') {
      throw new Error('Session is not active');
    }

    const targetDevices: string[] = [];
    const targets = targetUserIds || Array.from(session.participants.keys());

    // Collect target devices
    for (const userId of targets) {
      const participant = session.participants.get(userId);
      if (participant) {
        targetDevices.push(...participant.deviceIds);
      }
    }

    // Start pattern on all target devices
    const startTime = Date.now();
    for (const deviceId of targetDevices) {
      await this.deviceManager.startPattern(deviceId, pattern);
    }

    // Track active pattern
    session.activePatterns.set(pattern.id, {
      pattern,
      targetDevices,
      startTime
    });

    await this.telemetry.track({
      type: 'pattern_started',
      timestamp: startTime,
      sessionId,
      data: {
        patternId: pattern.id,
        targetUsers: targets,
        targetDevices
      }
    });

    this.emit('patternStarted', {
      sessionId,
      pattern,
      targetDevices,
      startTime
    });
  }

  /**
   * Stop a pattern for session participants
   */
  async stopPattern(
    sessionId: string,
    patternId: string,
    targetUserIds?: string[]
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const activePattern = session.activePatterns.get(patternId);
    if (!activePattern) {
      throw new Error('Pattern not active');
    }

    const targetDevices = targetUserIds
      ? activePattern.targetDevices.filter(deviceId => {
          const participant = this.findParticipantByDevice(session, deviceId);
          return participant && targetUserIds.includes(participant.userId);
        })
      : activePattern.targetDevices;

    // Stop pattern on target devices
    for (const deviceId of targetDevices) {
      await this.deviceManager.stopPattern(deviceId);
    }

    const endTime = Date.now();
    await this.telemetry.track({
      type: 'pattern_stopped',
      timestamp: endTime,
      sessionId,
      data: {
        patternId,
        targetDevices,
        durationMs: endTime - activePattern.startTime
      }
    });

    // Remove pattern if all devices stopped
    const remainingDevices = activePattern.targetDevices
      .filter(d => !targetDevices.includes(d));
    
    if (remainingDevices.length === 0) {
      session.activePatterns.delete(patternId);
    } else {
      activePattern.targetDevices = remainingDevices;
    }

    this.emit('patternStopped', {
      sessionId,
      patternId,
      targetDevices,
      endTime
    });
  }

  private getDefaultPermissions(role: Participant['role']): string[] {
    switch (role) {
      case 'performer':
        return [
          'pattern:start',
          'pattern:stop',
          'pattern:modify',
          'session:pause',
          'session:resume',
          'chat:send',
          'chat:receive'
        ];
      case 'audience':
        return [
          'tip:send',
          'chat:send',
          'chat:receive'
        ];
      case 'moderator':
        return [
          'session:manage',
          'participant:manage',
          'pattern:manage',
          'chat:manage'
        ];
      default:
        return [];
    }
  }

  private updateUserSessionMapping(
    userId: string,
    sessionId: string,
    operation: 'add' | 'remove'
  ) {
    let sessions = this.userSessions.get(userId);
    
    if (operation === 'add') {
      if (!sessions) {
        sessions = new Set();
        this.userSessions.set(userId, sessions);
      }
      sessions.add(sessionId);
    } else {
      if (sessions) {
        sessions.delete(sessionId);
        if (sessions.size === 0) {
          this.userSessions.delete(userId);
        }
      }
    }
  }

  private async syncParticipantPatterns(
    sessionId: string,
    userId: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    const participant = session?.participants.get(userId);
    if (!session || !participant) return;

    // Start all active patterns on participant's devices
    for (const [patternId, data] of session.activePatterns.entries()) {
      for (const deviceId of participant.deviceIds) {
        try {
          await this.deviceManager.startPattern(
            deviceId,
            data.pattern,
            { startTime: data.startTime }
          );
          data.targetDevices.push(deviceId);
        } catch (error) {
          this.emit('error', {
            type: 'pattern_sync_failed',
            sessionId,
            userId,
            deviceId,
            patternId,
            error
          });
        }
      }
    }
  }

  private findParticipantByDevice(
    session: Session,
    deviceId: string
  ): Participant | undefined {
    for (const participant of session.participants.values()) {
      if (participant.deviceIds.includes(deviceId)) {
        return participant;
      }
    }
    return undefined;
  }
}
