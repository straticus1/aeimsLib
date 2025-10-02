/**
 * Utility functions for formatting data
 */

/**
 * Format price with currency
 */
export function formatPrice(amount: number, currency: string = 'USD'): string {
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
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format duration in milliseconds to human readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format file size in bytes to human readable format
 */
export function formatFileSize(bytes: number): string {
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
export function formatRelativeTime(timestamp: number | Date): string {
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
  } else if (months > 0) {
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else if (weeks > 0) {
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Format timestamp to ISO string with timezone
 */
export function formatTimestamp(timestamp: number | Date, includeTime: boolean = true): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  
  if (includeTime) {
    return date.toISOString();
  } else {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Format device ID for display
 */
export function formatDeviceId(deviceId: string, maxLength: number = 12): string {
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
export function formatErrorMessage(error: Error | string): string {
  if (typeof error === 'string') {
    return error;
  }
  
  return error.message || 'An unknown error occurred';
}

/**
 * Format JSON for display
 */
export function formatJSON(data: any, indent: number = 2): string {
  return JSON.stringify(data, null, indent);
}

/**
 * Format array as comma-separated list
 */
export function formatList(items: string[], maxItems: number = 5): string {
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
export function formatBoolean(value: boolean, format: 'yes/no' | 'on/off' | 'enabled/disabled' = 'yes/no'): string {
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
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Format bytes per second
 */
export function formatBytesPerSecond(bytesPerSecond: number): string {
  return `${formatFileSize(bytesPerSecond)}/s`;
}

/**
 * Format intensity percentage
 */
export function formatIntensity(intensity: number, maxIntensity: number = 100): string {
  const percentage = Math.round((intensity / maxIntensity) * 100);
  return `${percentage}%`;
}

/**
 * Format device status
 */
export function formatDeviceStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/**
 * Format connection status
 */
export function formatConnectionStatus(connected: boolean): string {
  return connected ? 'Connected' : 'Disconnected';
}

/**
 * Format battery level
 */
export function formatBatteryLevel(level: number): string {
  if (level >= 75) {
    return `${level}% (High)`;
  } else if (level >= 25) {
    return `${level}% (Medium)`;
  } else {
    return `${level}% (Low)`;
  }
}


