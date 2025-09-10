<?php

namespace AeimsLib\Errors;

/**
 * Device-specific error class
 */
class DeviceError extends \Exception
{
    protected $code;
    protected $deviceId;
    protected $context;
    protected $timestamp;

    public function __construct($code, $message, $deviceId = null, $context = [])
    {
        parent::__construct($message);
        $this->code = $code;
        $this->deviceId = $deviceId;
        $this->context = $context;
        $this->timestamp = new \DateTime();
    }

    public function getErrorCode()
    {
        return $this->code;
    }

    public function getDeviceId()
    {
        return $this->deviceId;
    }

    public function getContext()
    {
        return $this->context;
    }

    public function getTimestamp()
    {
        return $this->timestamp;
    }

    public function toArray()
    {
        return [
            'name' => get_class($this),
            'message' => $this->getMessage(),
            'code' => $this->code,
            'deviceId' => $this->deviceId,
            'context' => $this->context,
            'timestamp' => $this->timestamp->format('c'),
            'file' => $this->getFile(),
            'line' => $this->getLine(),
            'trace' => $this->getTraceAsString()
        ];
    }
}

/**
 * Device validation error
 */
class DeviceValidationError extends DeviceError
{
    public function __construct($message, $deviceId = null, $context = [])
    {
        parent::__construct('VALIDATION_ERROR', $message, $deviceId, $context);
    }
}

/**
 * Device connection error
 */
class DeviceConnectionError extends DeviceError
{
    public function __construct($message, $deviceId = null, $context = [])
    {
        parent::__construct('CONNECTION_ERROR', $message, $deviceId, $context);
    }
}

/**
 * Device authentication error
 */
class DeviceAuthError extends DeviceError
{
    public function __construct($message, $deviceId = null, $context = [])
    {
        parent::__construct('AUTH_ERROR', $message, $deviceId, $context);
    }
}

/**
 * Device quota exceeded error
 */
class DeviceQuotaError extends DeviceError
{
    public function __construct($message, $deviceId = null, $context = [])
    {
        parent::__construct('QUOTA_EXCEEDED', $message, $deviceId, $context);
    }
}

/**
 * Device persistence error
 */
class DevicePersistenceError extends DeviceError
{
    public function __construct($message, $deviceId = null, $context = [])
    {
        parent::__construct('PERSISTENCE_ERROR', $message, $deviceId, $context);
    }
}

/**
 * Device configuration error
 */
class DeviceConfigError extends DeviceError
{
    public function __construct($message, $deviceId = null, $context = [])
    {
        parent::__construct('CONFIG_ERROR', $message, $deviceId, $context);
    }
}

/**
 * Device state error
 */
class DeviceStateError extends DeviceError
{
    public function __construct($message, $deviceId = null, $context = [])
    {
        parent::__construct('STATE_ERROR', $message, $deviceId, $context);
    }
}

/**
 * Device operation error
 */
class DeviceOperationError extends DeviceError
{
    public function __construct($message, $deviceId = null, $context = [])
    {
        parent::__construct('OPERATION_ERROR', $message, $deviceId, $context);
    }
}

/**
 * Device not found error
 */
class DeviceNotFoundError extends DeviceError
{
    public function __construct($deviceId, $context = [])
    {
        parent::__construct('DEVICE_NOT_FOUND', "Device not found: {$deviceId}", $deviceId, $context);
    }
}

/**
 * Duplicate device error
 */
class DuplicateDeviceError extends DeviceError
{
    public function __construct($deviceId, $context = [])
    {
        parent::__construct('DUPLICATE_DEVICE', "Device already exists: {$deviceId}", $deviceId, $context);
    }
}

/**
 * Device error handler
 */
class DeviceErrorHandler
{
    private static $logger;
    private static $errorCounts = [];
    private static $maxErrorsPerDevice = 10;
    private static $errorWindow = 300; // 5 minutes

    public static function init($logger)
    {
        self::$logger = $logger;
    }

    public static function handleError(DeviceError $error)
    {
        $deviceId = $error->getDeviceId() ?? 'unknown';
        
        // Track error counts
        $now = time();
        if (!isset(self::$errorCounts[$deviceId])) {
            self::$errorCounts[$deviceId] = [];
        }
        
        // Clean old errors
        self::$errorCounts[$deviceId] = array_filter(
            self::$errorCounts[$deviceId],
            function($timestamp) use ($now) {
                return ($now - $timestamp) < self::$errorWindow;
            }
        );
        
        // Add current error
        self::$errorCounts[$deviceId][] = $now;
        
        // Log the error
        if (self::$logger) {
            self::$logger->error('Device error occurred', $error->toArray());
        }
        
        // Check if device should be disabled
        if (count(self::$errorCounts[$deviceId]) >= self::$maxErrorsPerDevice) {
            self::disableDevice($deviceId, 'Too many errors');
        }
        
        return $error->toArray();
    }

    private static function disableDevice($deviceId, $reason)
    {
        if (self::$logger) {
            self::$logger->warning("Device disabled due to errors", [
                'deviceId' => $deviceId,
                'reason' => $reason,
                'errorCount' => count(self::$errorCounts[$deviceId] ?? [])
            ]);
        }
        
        // Here you would implement device disabling logic
        // For example, update database, notify monitoring system, etc.
    }

    public static function getErrorCount($deviceId)
    {
        return count(self::$errorCounts[$deviceId] ?? []);
    }

    public static function resetErrorCount($deviceId)
    {
        unset(self::$errorCounts[$deviceId]);
    }
}