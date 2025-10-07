// Core exports
export * from './interfaces/device';
export * from './interfaces/patterns';
export * from './interfaces/websocket';
export * from './interfaces/monitoring';
export * from './interfaces/security';

// Types
export * from './core/types/DeviceTypes';
export * from './core/types/DeviceMode';
export * from './core/types/DeviceFeature';
export * from './core/types/DevicePricing';
export * from './core/types/DeviceState';

// Patterns
export * from './patterns/Pattern';
export { BasePattern } from './patterns/BasePattern';
export { ConstantPattern } from './patterns/ConstantPattern';
export { WavePattern } from './patterns/WavePattern';
export { PulsePattern } from './patterns/PulsePattern';
export { EscalationPattern } from './patterns/EscalationPattern';

// Device Management
export { DeviceManager } from './device/DeviceManager';
export { BaseProtocolAdapter } from './device/BaseProtocolAdapter';
export { WebSocketProtocol } from './device/WebSocketProtocol';

// Security
export { SecurityService } from './security/SecurityService';

// Core Components
export { DeviceManager as CoreDeviceManager } from './core/DeviceManager';

// Default export
export { DeviceManager as default } from './device/DeviceManager';