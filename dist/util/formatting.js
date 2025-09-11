"use strict";
/**
 * Utility functions for formatting data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPrice = formatPrice;
exports.formatPercentage = formatPercentage;
exports.formatDuration = formatDuration;
exports.formatFileSize = formatFileSize;
exports.formatRelativeTime = formatRelativeTime;
exports.formatTimestamp = formatTimestamp;
exports.formatDeviceId = formatDeviceId;
exports.formatErrorMessage = formatErrorMessage;
exports.formatJSON = formatJSON;
exports.formatList = formatList;
exports.formatBoolean = formatBoolean;
exports.formatNumber = formatNumber;
exports.formatBytesPerSecond = formatBytesPerSecond;
exports.formatIntensity = formatIntensity;
exports.formatDeviceStatus = formatDeviceStatus;
exports.formatConnectionStatus = formatConnectionStatus;
exports.formatBatteryLevel = formatBatteryLevel;
/**
 * Format price with currency
 */
function formatPrice(amount, currency = 'USD') {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return formatter.format(amount);
}
/**
 * Format percentage
 */
function formatPercentage(value, decimals = 1) {
    return `${value.toFixed(decimals)}%`;
}
/**
 * Format duration in milliseconds to human readable format
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    else {
        return `${seconds}s`;
    }
}
/**
 * Format file size in bytes to human readable format
 */
function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}
/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp) {
    const now = Date.now();
    const time = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
    const diff = now - time;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (years > 0) {
        return `${years} year${years > 1 ? 's' : ''} ago`;
    }
    else if (months > 0) {
        return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    else if (weeks > 0) {
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    else if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    else {
        return 'Just now';
    }
}
/**
 * Format timestamp to ISO string with timezone
 */
function formatTimestamp(timestamp, includeTime = true) {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
    if (includeTime) {
        return date.toISOString();
    }
    else {
        return date.toISOString().split('T')[0];
    }
}
/**
 * Format device ID for display
 */
function formatDeviceId(deviceId, maxLength = 12) {
    if (deviceId.length <= maxLength) {
        return deviceId;
    }
    const start = deviceId.substring(0, Math.floor(maxLength / 2));
    const end = deviceId.substring(deviceId.length - Math.floor(maxLength / 2));
    return `${start}...${end}`;
}
/**
 * Format error message for display
 */
function formatErrorMessage(error) {
    if (typeof error === 'string') {
        return error;
    }
    return error.message || 'An unknown error occurred';
}
/**
 * Format JSON for display
 */
function formatJSON(data, indent = 2) {
    return JSON.stringify(data, null, indent);
}
/**
 * Format array as comma-separated list
 */
function formatList(items, maxItems = 5) {
    if (items.length <= maxItems) {
        return items.join(', ');
    }
    const visible = items.slice(0, maxItems);
    const remaining = items.length - maxItems;
    return `${visible.join(', ')} and ${remaining} more`;
}
/**
 * Format boolean as yes/no
 */
function formatBoolean(value, format = 'yes/no') {
    switch (format) {
        case 'yes/no':
            return value ? 'Yes' : 'No';
        case 'on/off':
            return value ? 'On' : 'Off';
        case 'enabled/disabled':
            return value ? 'Enabled' : 'Disabled';
        default:
            return value ? 'Yes' : 'No';
    }
}
/**
 * Format number with thousands separator
 */
function formatNumber(value, decimals = 0) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
}
/**
 * Format bytes per second
 */
function formatBytesPerSecond(bytesPerSecond) {
    return `${formatFileSize(bytesPerSecond)}/s`;
}
/**
 * Format intensity percentage
 */
function formatIntensity(intensity, maxIntensity = 100) {
    const percentage = Math.round((intensity / maxIntensity) * 100);
    return `${percentage}%`;
}
/**
 * Format device status
 */
function formatDeviceStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
/**
 * Format connection status
 */
function formatConnectionStatus(connected) {
    return connected ? 'Connected' : 'Disconnected';
}
/**
 * Format battery level
 */
function formatBatteryLevel(level) {
    if (level >= 75) {
        return `${level}% (High)`;
    }
    else if (level >= 25) {
        return `${level}% (Medium)`;
    }
    else {
        return `${level}% (Low)`;
    }
}
//# sourceMappingURL=formatting.js.map