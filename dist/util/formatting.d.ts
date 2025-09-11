/**
 * Utility functions for formatting data
 */
/**
 * Format price with currency
 */
export declare function formatPrice(amount: number, currency?: string): string;
/**
 * Format percentage
 */
export declare function formatPercentage(value: number, decimals?: number): string;
/**
 * Format duration in milliseconds to human readable format
 */
export declare function formatDuration(ms: number): string;
/**
 * Format file size in bytes to human readable format
 */
export declare function formatFileSize(bytes: number): string;
/**
 * Format timestamp to relative time
 */
export declare function formatRelativeTime(timestamp: number | Date): string;
/**
 * Format timestamp to ISO string with timezone
 */
export declare function formatTimestamp(timestamp: number | Date, includeTime?: boolean): string;
/**
 * Format device ID for display
 */
export declare function formatDeviceId(deviceId: string, maxLength?: number): string;
/**
 * Format error message for display
 */
export declare function formatErrorMessage(error: Error | string): string;
/**
 * Format JSON for display
 */
export declare function formatJSON(data: any, indent?: number): string;
/**
 * Format array as comma-separated list
 */
export declare function formatList(items: string[], maxItems?: number): string;
/**
 * Format boolean as yes/no
 */
export declare function formatBoolean(value: boolean, format?: 'yes/no' | 'on/off' | 'enabled/disabled'): string;
/**
 * Format number with thousands separator
 */
export declare function formatNumber(value: number, decimals?: number): string;
/**
 * Format bytes per second
 */
export declare function formatBytesPerSecond(bytesPerSecond: number): string;
/**
 * Format intensity percentage
 */
export declare function formatIntensity(intensity: number, maxIntensity?: number): string;
/**
 * Format device status
 */
export declare function formatDeviceStatus(status: string): string;
/**
 * Format connection status
 */
export declare function formatConnectionStatus(connected: boolean): string;
/**
 * Format battery level
 */
export declare function formatBatteryLevel(level: number): string;
