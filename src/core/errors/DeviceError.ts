import { ErrorType } from '../types/DeviceTypes';

/**
 * Device-specific error class
 */
export class DeviceError extends Error {
  public readonly code: ErrorType;
  public readonly deviceId?: string;
  public readonly context: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    code: ErrorType,
    message: string,
    deviceId?: string,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'DeviceError';
    this.code = code;
    this.deviceId = deviceId;
    this.context = context;
    this.timestamp = new Date();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DeviceError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      deviceId: this.deviceId,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Device validation error
 */
export class DeviceValidationError extends DeviceError {
  constructor(
    message: string,
    field?: string,
    value?: any,
    deviceId?: string
  ) {
    super(
      ErrorType.VALIDATION_ERROR,
      message,
      deviceId,
      { field, value }
    );
    this.name = 'DeviceValidationError';
  }
}

/**
 * Device connection error
 */
export class DeviceConnectionError extends DeviceError {
  constructor(
    message: string,
    deviceId?: string,
    endpoint?: string
  ) {
    super(
      ErrorType.CONNECTION_ERROR,
      message,
      deviceId,
      { endpoint }
    );
    this.name = 'DeviceConnectionError';
  }
}

/**
 * Device authentication error
 */
export class DeviceAuthError extends DeviceError {
  constructor(
    message: string,
    deviceId?: string,
    userId?: string
  ) {
    super(
      ErrorType.AUTH_ERROR,
      message,
      deviceId,
      { userId }
    );
    this.name = 'DeviceAuthError';
  }
}

/**
 * Device quota exceeded error
 */
export class DeviceQuotaError extends DeviceError {
  constructor(
    message: string,
    deviceId?: string,
    quota?: number,
    current?: number
  ) {
    super(
      ErrorType.QUOTA_EXCEEDED,
      message,
      deviceId,
      { quota, current }
    );
    this.name = 'DeviceQuotaError';
  }
}

/**
 * Device persistence error
 */
export class DevicePersistenceError extends DeviceError {
  constructor(
    message: string,
    deviceId?: string,
    operation?: string
  ) {
    super(
      ErrorType.PERSISTENCE_ERROR,
      message,
      deviceId,
      { operation }
    );
    this.name = 'DevicePersistenceError';
  }
}

/**
 * Device configuration error
 */
export class DeviceConfigError extends DeviceError {
  constructor(
    message: string,
    deviceId?: string,
    configKey?: string
  ) {
    super(
      ErrorType.CONFIGURATION_ERROR,
      message,
      deviceId,
      { configKey }
    );
    this.name = 'DeviceConfigError';
  }
}

/**
 * Device state error
 */
export class DeviceStateError extends DeviceError {
  constructor(
    message: string,
    deviceId?: string,
    currentState?: string,
    expectedState?: string
  ) {
    super(
      ErrorType.STATE_LOAD_ERROR,
      message,
      deviceId,
      { currentState, expectedState }
    );
    this.name = 'DeviceStateError';
  }
}

/**
 * Device operation error
 */
export class DeviceOperationError extends DeviceError {
  constructor(
    message: string,
    deviceId?: string,
    operation?: string
  ) {
    super(
      ErrorType.INVALID_OPERATION,
      message,
      deviceId,
      { operation }
    );
    this.name = 'DeviceOperationError';
  }
}

/**
 * Device not found error
 */
export class DeviceNotFoundError extends DeviceError {
  constructor(
    deviceId: string,
    message?: string
  ) {
    super(
      ErrorType.DEVICE_NOT_FOUND,
      message || `Device ${deviceId} not found`,
      deviceId
    );
    this.name = 'DeviceNotFoundError';
  }
}

/**
 * Duplicate device error
 */
export class DuplicateDeviceError extends DeviceError {
  constructor(
    deviceId: string,
    message?: string
  ) {
    super(
      ErrorType.DUPLICATE_DEVICE,
      message || `Device ${deviceId} already exists`,
      deviceId
    );
    this.name = 'DuplicateDeviceError';
  }
}

// Export all error types
export {
  ErrorType
};

