<?php

namespace AeimsLib\Utils;

/**
 * Utility functions for AeimsLib
 */
class Utils
{
    /**
     * Format price with currency
     */
    public static function formatPrice($amount, $currency = 'USD')
    {
        $formatter = new \NumberFormatter('en_US', \NumberFormatter::CURRENCY);
        return $formatter->formatCurrency($amount, $currency);
    }

    /**
     * Format percentage
     */
    public static function formatPercentage($value, $decimals = 1)
    {
        return number_format($value, $decimals) . '%';
    }

    /**
     * Format duration in milliseconds to human readable format
     */
    public static function formatDuration($ms)
    {
        $seconds = floor($ms / 1000);
        $minutes = floor($seconds / 60);
        $hours = floor($minutes / 60);
        $days = floor($hours / 24);

        if ($days > 0) {
            return sprintf('%dd %dh %dm %ds', $days, $hours % 24, $minutes % 60, $seconds % 60);
        } elseif ($hours > 0) {
            return sprintf('%dh %dm %ds', $hours, $minutes % 60, $seconds % 60);
        } elseif ($minutes > 0) {
            return sprintf('%dm %ds', $minutes, $seconds % 60);
        } else {
            return sprintf('%ds', $seconds);
        }
    }

    /**
     * Format file size in bytes to human readable format
     */
    public static function formatFileSize($bytes)
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        
        $bytes /= pow(1024, $pow);
        
        return round($bytes, 2) . ' ' . $units[$pow];
    }

    /**
     * Generate a random string
     */
    public static function generateRandomString($length = 32)
    {
        $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $charactersLength = strlen($characters);
        $randomString = '';
        
        for ($i = 0; $i < $length; $i++) {
            $randomString .= $characters[rand(0, $charactersLength - 1)];
        }
        
        return $randomString;
    }

    /**
     * Generate a UUID v4
     */
    public static function generateUUID()
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // Set version to 0100
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // Set bits 6-7 to 10
        
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    /**
     * Validate email address
     */
    public static function validateEmail($email)
    {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    /**
     * Validate URL
     */
    public static function validateUrl($url)
    {
        return filter_var($url, FILTER_VALIDATE_URL) !== false;
    }

    /**
     * Sanitize string for database
     */
    public static function sanitizeString($string)
    {
        return htmlspecialchars(strip_tags(trim($string)), ENT_QUOTES, 'UTF-8');
    }

    /**
     * Convert array to CSV string
     */
    public static function arrayToCsv($array, $delimiter = ',', $enclosure = '"')
    {
        $output = fopen('php://temp', 'r+');
        
        foreach ($array as $row) {
            fputcsv($output, $row, $delimiter, $enclosure);
        }
        
        rewind($output);
        $csv = stream_get_contents($output);
        fclose($output);
        
        return $csv;
    }

    /**
     * Convert CSV string to array
     */
    public static function csvToArray($csv, $delimiter = ',', $enclosure = '"')
    {
        $output = fopen('php://temp', 'r+');
        fwrite($output, $csv);
        rewind($output);
        
        $array = [];
        while (($row = fgetcsv($output, 0, $delimiter, $enclosure)) !== false) {
            $array[] = $row;
        }
        
        fclose($output);
        return $array;
    }

    /**
     * Deep merge arrays
     */
    public static function arrayMergeRecursive($array1, $array2)
    {
        $merged = $array1;
        
        foreach ($array2 as $key => $value) {
            if (is_array($value) && isset($merged[$key]) && is_array($merged[$key])) {
                $merged[$key] = self::arrayMergeRecursive($merged[$key], $value);
            } else {
                $merged[$key] = $value;
            }
        }
        
        return $merged;
    }

    /**
     * Get client IP address
     */
    public static function getClientIp()
    {
        $ipKeys = ['HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'];
        
        foreach ($ipKeys as $key) {
            if (array_key_exists($key, $_SERVER) === true) {
                foreach (explode(',', $_SERVER[$key]) as $ip) {
                    $ip = trim($ip);
                    
                    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false) {
                        return $ip;
                    }
                }
            }
        }
        
        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }

    /**
     * Check if request is from mobile device
     */
    public static function isMobile()
    {
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $mobileKeywords = ['Mobile', 'Android', 'iPhone', 'iPad', 'BlackBerry', 'Windows Phone'];
        
        foreach ($mobileKeywords as $keyword) {
            if (stripos($userAgent, $keyword) !== false) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Get current timestamp in milliseconds
     */
    public static function getCurrentTimestamp()
    {
        return round(microtime(true) * 1000);
    }

    /**
     * Convert timestamp to human readable date
     */
    public static function timestampToDate($timestamp, $format = 'Y-m-d H:i:s')
    {
        return date($format, $timestamp / 1000);
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
    public static function calculateDistance($lat1, $lon1, $lat2, $lon2, $unit = 'km')
    {
        $earthRadius = $unit === 'km' ? 6371 : 3959; // Earth's radius in km or miles
        
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        
        $a = sin($dLat/2) * sin($dLat/2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon/2) * sin($dLon/2);
        $c = 2 * atan2(sqrt($a), sqrt(1-$a));
        
        return $earthRadius * $c;
    }

    /**
     * Retry function with exponential backoff
     */
    public static function retry($callback, $maxAttempts = 3, $baseDelay = 1000)
    {
        $attempt = 0;
        $lastException = null;
        
        while ($attempt < $maxAttempts) {
            try {
                return $callback();
            } catch (\Exception $e) {
                $lastException = $e;
                $attempt++;
                
                if ($attempt < $maxAttempts) {
                    $delay = $baseDelay * pow(2, $attempt - 1);
                    usleep($delay * 1000); // Convert to microseconds
                }
            }
        }
        
        throw $lastException;
    }

    /**
     * Create a simple cache key
     */
    public static function createCacheKey($prefix, $data)
    {
        return $prefix . '_' . md5(serialize($data));
    }

    /**
     * Check if string is JSON
     */
    public static function isJson($string)
    {
        json_decode($string);
        return json_last_error() === JSON_ERROR_NONE;
    }

    /**
     * Safely decode JSON
     */
    public static function safeJsonDecode($json, $default = null)
    {
        $decoded = json_decode($json, true);
        return json_last_error() === JSON_ERROR_NONE ? $decoded : $default;
    }
}
