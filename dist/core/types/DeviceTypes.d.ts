/**
 * Device operating modes
 */
export declare enum DeviceMode {
    DEVELOPMENT = "development",
    PRODUCTION = "production"
}
/**
 * Device feature configuration
 */
export interface DeviceFeature {
    id: string;
    name: string;
    description: string;
    experimental?: boolean;
    requiresAuth?: boolean;
    parameters?: {
        id: string;
        name: string;
        type: 'number' | 'string' | 'boolean';
        min?: number;
        max?: number;
        default?: any;
    }[];
}
/**
 * Device pricing configuration
 */
export interface DevicePricing {
    baseRate: number;
    featureRates: Record<string, number>;
    currency: string;
    billingPeriod: 'hourly' | 'daily' | 'monthly';
    minimumCharge?: number;
    enterpriseDiscount?: number;
}
/**
 * Device operating states
 */
export declare enum DeviceState {
    INITIALIZED = "initialized",
    CONNECTED = "connected",
    DISCONNECTED = "disconnected",
    ERROR = "error",
    UPDATING = "updating"
}
/**
 * Device error types
 */
export declare enum ErrorType {
    INVALID_OPERATION = "INVALID_OPERATION",
    DEVICE_NOT_FOUND = "DEVICE_NOT_FOUND",
    DUPLICATE_DEVICE = "DUPLICATE_DEVICE",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    STATE_LOAD_ERROR = "STATE_LOAD_ERROR",
    PERSISTENCE_ERROR = "PERSISTENCE_ERROR",
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
    AUTH_ERROR = "AUTH_ERROR",
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
}
