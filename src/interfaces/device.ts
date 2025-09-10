/**
 * Device connection status
 */
export interface DeviceStatus {
  connected: boolean;
  lastSeen: Date;
  batteryLevel?: number;
  error?: string;
}

/**
 * Device settings and configuration
 */
export interface DeviceSettings {
  rate_per_minute: number;
  maxDuration: number;
  intensityLimit: number;
  allowIntensityOverride: boolean;
  allowedPatterns: string[];
}

/**
 * Device capabilities and features
 */
export interface DeviceCapabilities {
  supportedPatterns: string[];
  maxIntensity: number;
  hasBattery: boolean;
  hasWirelessControl: boolean;
  supportsEncryption: boolean;
}

/**
 * Core device information
 */
export interface DeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  protocol: string;
  capabilities: DeviceCapabilities;
}

/**
 * Complete device interface
 */
export interface Device {
  info: DeviceInfo;
  status: DeviceStatus;
  settings: DeviceSettings;
  currentPattern?: string;
  currentIntensity?: number;
}

/**
 * Device command interface
 */
export interface DeviceCommand {
  type: string;
  intensity: number;
  pattern?: string;
  speed?: number;
  duration?: number;
}

/**
 * Device command result
 */
export interface CommandResult {
  success: boolean;
  error?: string;
  timestamp: Date;
  command: DeviceCommand;
}

/**
 * Device event types
 */
export enum DeviceEventType {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  STATUS_CHANGED = 'status_changed',
  COMMAND_RECEIVED = 'command_received',
  COMMAND_EXECUTED = 'command_executed',
  ERROR = 'error'
}

/**
 * Device event interface
 */
export interface DeviceEvent {
  type: DeviceEventType;
  deviceId: string;
  timestamp: Date;
  data?: any;
}

/**
 * Device protocol interface
 */
export interface DeviceProtocol {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendCommand(command: DeviceCommand): Promise<CommandResult>;
  getStatus(): Promise<DeviceStatus>;
  subscribe(callback: (event: DeviceEvent) => void): void;
  unsubscribe(callback: (event: DeviceEvent) => void): void;
}
