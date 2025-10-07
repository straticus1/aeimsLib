/**
 * Device operational state
 */
export interface DeviceState {
  status: DeviceStatus;
  mode: DeviceMode;
  currentPattern?: string;
  intensity: number;
  batteryLevel?: number;
  temperature?: number;
  lastUpdated: Date;
  isActive: boolean;
  errorState?: ErrorState;
}

/**
 * Device status enumeration
 */
export enum DeviceStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ACTIVE = 'active',
  ERROR = 'error',
  MAINTENANCE = 'maintenance'
}

/**
 * Device operating modes
 */
export enum DeviceMode {
  MANUAL = 'manual',
  PATTERN = 'pattern',
  REMOTE = 'remote',
  AUTOMATIC = 'automatic',
  SYNC = 'sync'
}

/**
 * Error state information
 */
export interface ErrorState {
  code: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

export default DeviceState;