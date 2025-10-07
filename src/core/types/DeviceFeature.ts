/**
 * Device feature configuration
 */
export interface DeviceFeature {
  id: string;
  name: string;
  enabled: boolean;
  parameters?: Record<string, any>;
  description?: string;
}

/**
 * Standard device features
 */
export enum StandardFeatures {
  VIBRATION = 'vibration',
  ROTATION = 'rotation',
  HEATING = 'heating',
  PRESSURE = 'pressure',
  SUCTION = 'suction',
  AUDIO_SYNC = 'audio_sync',
  PATTERN_SYNC = 'pattern_sync',
  REMOTE_CONTROL = 'remote_control'
}

export default DeviceFeature;