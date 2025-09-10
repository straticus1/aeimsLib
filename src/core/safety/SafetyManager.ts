import { EventEmitter } from 'events';
import { DeviceManager } from '../DeviceManager';
import { AuditLogger } from '../logging/AuditLogger';

interface SafetyThresholds {
  maxIntensity: number;
  maxDuration: number;
  maxContinuousDuration: number;
  minCooldown: number;
  maxSessionsPerDay: number;
  maxTotalDurationPerDay: number;
}

interface ConsentRecord {
  userId: string;
  deviceId: string;
  grantedAt: number;
  expiresAt: number;
  scope: string[];
  revocable: boolean;
  restrictions?: {
    maxIntensity?: number;
    maxDuration?: number;
    allowedPatterns?: string[];
    blockedPatterns?: string[];
    timeRestrictions?: {
      allowedHours?: number[];
      blockedDays?: string[];
    };
  };
}

interface SafetyZone {
  id: string;
  name: string;
  type: 'intensity' | 'duration' | 'pattern' | 'time';
  conditions: {
    maxIntensity?: number;
    maxDuration?: number;
    allowedPatterns?: string[];
    allowedTimeRanges?: {
      start: number;
      end: number;
    }[];
  };
  actions: {
    reduceIntensity?: number;
    pauseDuration?: number;
    stopPattern?: boolean;
    notifyUser?: boolean;
    requireReauthorization?: boolean;
  };
}

/**
 * Safety and Consent Manager
 * 
 * Handles comprehensive safety features including:
 * - Device safety thresholds
 * - User consent management
 * - Safety zones and boundaries
 * - Emergency stops and cooldowns
 * - Usage limits and restrictions
 */
export class SafetyManager extends EventEmitter {
  private deviceManager: DeviceManager;
  private logger: AuditLogger;

  private activeConsent: Map<string, ConsentRecord> = new Map();
  private safetyZones: Map<string, SafetyZone> = new Map();
  private deviceUsage: Map<string, {
    sessionCount: number;
    totalDuration: number;
    lastSessionEnd: number;
  }> = new Map();

  private defaultThresholds: SafetyThresholds = {
    maxIntensity: 100,
    maxDuration: 3600000,        // 1 hour
    maxContinuousDuration: 1800000, // 30 minutes
    minCooldown: 300000,         // 5 minutes
    maxSessionsPerDay: 12,
    maxTotalDurationPerDay: 14400000 // 4 hours
  };

  constructor(
    deviceManager: DeviceManager,
    logger: AuditLogger
  ) {
    super();
    this.deviceManager = deviceManager;
    this.logger = logger;

    this.initializeDefaultSafetyZones();
    this.initializeListeners();
  }

  /**
   * Grant consent for device usage
   */
  async grantConsent(
    userId: string,
    deviceId: string,
    scope: string[],
    duration: number = 3600000, // 1 hour default
    restrictions?: ConsentRecord['restrictions']
  ): Promise<void> {
    // Validate user and device
    const device = this.deviceManager.getDevice(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    // Create consent record
    const consent: ConsentRecord = {
      userId,
      deviceId,
      grantedAt: Date.now(),
      expiresAt: Date.now() + duration,
      scope,
      revocable: true,
      restrictions
    };

    // Store consent
    this.activeConsent.set(`${userId}_${deviceId}`, consent);

    // Log consent grant
    await this.logger.logDeviceOperation(
      'consent_granted',
      deviceId,
      {
        userId,
        scope,
        duration,
        restrictions
      }
    );

    this.emit('consentGranted', {
      userId,
      deviceId,
      consent
    });
  }

  /**
   * Revoke consent
   */
  async revokeConsent(
    userId: string,
    deviceId: string,
    reason: string
  ): Promise<void> {
    const consentKey = `${userId}_${deviceId}`;
    const consent = this.activeConsent.get(consentKey);

    if (!consent) {
      throw new Error('No active consent found');
    }

    if (!consent.revocable) {
      throw new Error('Consent is not revocable');
    }

    // Remove consent
    this.activeConsent.delete(consentKey);

    // Stop any active patterns
    await this.deviceManager.stopPattern(deviceId);

    // Log revocation
    await this.logger.logDeviceOperation(
      'consent_revoked',
      deviceId,
      {
        userId,
        reason
      }
    );

    this.emit('consentRevoked', {
      userId,
      deviceId,
      reason
    });
  }

  /**
   * Add safety zone
   */
  addSafetyZone(zone: SafetyZone): void {
    this.validateSafetyZone(zone);
    this.safetyZones.set(zone.id, zone);

    this.emit('safetyZoneAdded', zone);
  }

  /**
   * Remove safety zone
   */
  removeSafetyZone(zoneId: string): void {
    this.safetyZones.delete(zoneId);
    this.emit('safetyZoneRemoved', zoneId);
  }

  /**
   * Check if operation is safe
   */
  async validateOperation(
    userId: string,
    deviceId: string,
    operation: {
      type: string;
      intensity?: number;
      duration?: number;
      pattern?: string;
    }
  ): Promise<boolean> {
    // Check consent
    const consent = this.activeConsent.get(`${userId}_${deviceId}`);
    if (!consent) {
      throw new Error('No active consent');
    }

    if (consent.expiresAt < Date.now()) {
      throw new Error('Consent has expired');
    }

    // Check usage limits
    const usage = this.deviceUsage.get(deviceId);
    if (usage) {
      const dayStart = new Date().setHours(0, 0, 0, 0);
      if (usage.sessionCount >= this.defaultThresholds.maxSessionsPerDay) {
        throw new Error('Maximum daily sessions exceeded');
      }
      if (usage.totalDuration >= this.defaultThresholds.maxTotalDurationPerDay) {
        throw new Error('Maximum daily duration exceeded');
      }
      if (usage.lastSessionEnd) {
        const cooldown = Date.now() - usage.lastSessionEnd;
        if (cooldown < this.defaultThresholds.minCooldown) {
          throw new Error('Device is in cooldown period');
        }
      }
    }

    // Check restrictions
    if (consent.restrictions) {
      if (operation.intensity !== undefined &&
          consent.restrictions.maxIntensity !== undefined &&
          operation.intensity > consent.restrictions.maxIntensity) {
        throw new Error('Operation exceeds intensity restrictions');
      }

      if (operation.duration !== undefined &&
          consent.restrictions.maxDuration !== undefined &&
          operation.duration > consent.restrictions.maxDuration) {
        throw new Error('Operation exceeds duration restrictions');
      }

      if (operation.pattern) {
        if (consent.restrictions.blockedPatterns?.includes(operation.pattern)) {
          throw new Error('Pattern is blocked');
        }
        if (consent.restrictions.allowedPatterns &&
            !consent.restrictions.allowedPatterns.includes(operation.pattern)) {
          throw new Error('Pattern is not allowed');
        }
      }

      if (consent.restrictions.timeRestrictions) {
        const now = new Date();
        const hour = now.getHours();
        const day = now.toLocaleDateString('en-US', { weekday: 'long' });

        if (consent.restrictions.timeRestrictions.allowedHours &&
            !consent.restrictions.timeRestrictions.allowedHours.includes(hour)) {
          throw new Error('Operation not allowed during this hour');
        }

        if (consent.restrictions.timeRestrictions.blockedDays?.includes(day)) {
          throw new Error('Operation not allowed on this day');
        }
      }
    }

    // Check safety zones
    for (const zone of this.safetyZones.values()) {
      if (!this.checkSafetyZone(zone, operation)) {
        throw new Error(`Operation violates safety zone: ${zone.name}`);
      }
    }

    return true;
  }

  /**
   * Emergency stop for device
   */
  async emergencyStop(
    deviceId: string,
    reason: string
  ): Promise<void> {
    // Immediately stop device
    await this.deviceManager.stopPattern(deviceId);

    // Clear active consent
    for (const [key, consent] of this.activeConsent.entries()) {
      if (consent.deviceId === deviceId) {
        this.activeConsent.delete(key);
      }
    }

    // Log emergency stop
    await this.logger.logDeviceOperation(
      'emergency_stop',
      deviceId,
      { reason }
    );

    // Update device usage
    const usage = this.deviceUsage.get(deviceId);
    if (usage) {
      usage.lastSessionEnd = Date.now();
    }

    this.emit('emergencyStop', {
      deviceId,
      reason,
      timestamp: Date.now()
    });
  }

  /**
   * Get safety status
   */
  getSafetyStatus(deviceId: string) {
    const usage = this.deviceUsage.get(deviceId);
    const consents = Array.from(this.activeConsent.values())
      .filter(c => c.deviceId === deviceId);

    return {
      deviceId,
      usage: {
        sessionCount: usage?.sessionCount || 0,
        totalDuration: usage?.totalDuration || 0,
        lastSessionEnd: usage?.lastSessionEnd
      },
      activeConsents: consents,
      safetyZones: Array.from(this.safetyZones.values())
    };
  }

  private initializeDefaultSafetyZones(): void {
    // Intensity safety zone
    this.addSafetyZone({
      id: 'default_intensity',
      name: 'Default Intensity Limits',
      type: 'intensity',
      conditions: {
        maxIntensity: this.defaultThresholds.maxIntensity
      },
      actions: {
        reduceIntensity: 50,
        notifyUser: true
      }
    });

    // Duration safety zone
    this.addSafetyZone({
      id: 'default_duration',
      name: 'Default Duration Limits',
      type: 'duration',
      conditions: {
        maxDuration: this.defaultThresholds.maxDuration
      },
      actions: {
        stopPattern: true,
        notifyUser: true
      }
    });

    // Time-based safety zone
    this.addSafetyZone({
      id: 'default_time',
      name: 'Default Time Restrictions',
      type: 'time',
      conditions: {
        allowedTimeRanges: [
          { start: 7, end: 23 } // 7 AM to 11 PM
        ]
      },
      actions: {
        stopPattern: true,
        notifyUser: true
      }
    });
  }

  private initializeListeners(): void {
    // Monitor pattern starts
    this.deviceManager.on('patternStarted', async (data) => {
      const { deviceId } = data;
      const usage = this.deviceUsage.get(deviceId) || {
        sessionCount: 0,
        totalDuration: 0,
        lastSessionEnd: 0
      };

      usage.sessionCount++;
      this.deviceUsage.set(deviceId, usage);
    });

    // Monitor pattern stops
    this.deviceManager.on('patternStopped', async (data) => {
      const { deviceId, duration } = data;
      const usage = this.deviceUsage.get(deviceId);
      if (usage) {
        usage.totalDuration += duration;
        usage.lastSessionEnd = Date.now();
        this.deviceUsage.set(deviceId, usage);
      }
    });

    // Monitor safety events
    this.on('safetyViolation', async (data) => {
      const { deviceId, violation, action } = data;
      await this.logger.logDeviceOperation(
        'safety_violation',
        deviceId,
        { violation, action }
      );
    });
  }

  private validateSafetyZone(zone: SafetyZone): void {
    if (!zone.id || !zone.name || !zone.type) {
      throw new Error('Invalid safety zone configuration');
    }

    if (!zone.conditions || Object.keys(zone.conditions).length === 0) {
      throw new Error('Safety zone must have at least one condition');
    }

    if (!zone.actions || Object.keys(zone.actions).length === 0) {
      throw new Error('Safety zone must have at least one action');
    }
  }

  private checkSafetyZone(
    zone: SafetyZone,
    operation: {
      type: string;
      intensity?: number;
      duration?: number;
      pattern?: string;
    }
  ): boolean {
    switch (zone.type) {
      case 'intensity':
        if (operation.intensity !== undefined &&
            zone.conditions.maxIntensity !== undefined &&
            operation.intensity > zone.conditions.maxIntensity) {
          return false;
        }
        break;

      case 'duration':
        if (operation.duration !== undefined &&
            zone.conditions.maxDuration !== undefined &&
            operation.duration > zone.conditions.maxDuration) {
          return false;
        }
        break;

      case 'pattern':
        if (operation.pattern &&
            zone.conditions.allowedPatterns &&
            !zone.conditions.allowedPatterns.includes(operation.pattern)) {
          return false;
        }
        break;

      case 'time':
        if (zone.conditions.allowedTimeRanges) {
          const now = new Date();
          const hour = now.getHours();
          const isAllowed = zone.conditions.allowedTimeRanges.some(
            range => hour >= range.start && hour <= range.end
          );
          if (!isAllowed) return false;
        }
        break;
    }

    return true;
  }
}
