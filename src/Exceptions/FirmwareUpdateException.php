<?php

namespace AeimsLib\Exceptions;

/**
 * Exception thrown when an error occurs during firmware update operations.
 */
class FirmwareUpdateException extends \RuntimeException
{
    /**
     * @var string Additional context about the error
     */
    private $context;

    /**
     * Constructor
     *
     * @param string $message The error message
     * @param int $code The error code
     * @param \Throwable|null $previous Previous exception if nested exception
     * @param array $context Additional context about the error
     */
    public function __construct(
        string $message = "",
        int $code = 0,
        \Throwable $previous = null,
        array $context = []
    ) {
        $this->context = $context;
        parent::__construct($message, $code, $previous);
    }

    /**
     * Get the context of the error
     *
     * @return array The context array
     */
    public function getContext(): array
    {
        return $this->context;
    }

    /**
     * Create an instance for a verification failure
     *
     * @param string $reason The reason for verification failure
     * @param array $context Additional context
     * @return self
     */
    public static function verificationFailed(string $reason, array $context = []): self
    {
        return new self("Firmware verification failed: " . $reason, 400, null, $context);
    }

    /**
     * Create an instance for an installation failure
     *
     * @param string $reason The reason for installation failure
     * @param array $context Additional context
     * @return self
     */
    public static function installationFailed(string $reason, array $context = []): self
    {
        return new self("Firmware installation failed: " . $reason, 500, null, $context);
    }

    /**
     * Create an instance for a rollback failure
     *
     * @param string $reason The reason for rollback failure
     * @param array $context Additional context
     * @return self
     */
    public static function rollbackFailed(string $reason, array $context = []): self
    {
        return new self("Firmware rollback failed: " . $reason, 500, null, $context);
    }

    /**
     * Create an instance for an invalid firmware file
     *
     * @param string $reason The reason the firmware is invalid
     * @param array $context Additional context
     * @return self
     */
    public static function invalidFirmware(string $reason, array $context = []): self
    {
        return new self("Invalid firmware: " . $reason, 400, null, $context);
    }

    /**
     * Create an instance for a device communication error
     *
     * @param string $reason The reason for the communication error
     * @param array $context Additional context
     * @return self
     */
    public static function deviceCommunicationError(string $reason, array $context = []): self
    {
        return new self("Device communication error: " . $reason, 503, null, $context);
    }

    /**
     * Create an instance for insufficient storage error
     *
     * @param int $required Required storage space in bytes
     * @param int $available Available storage space in bytes
     * @param array $context Additional context
     * @return self
     */
    public static function insufficientStorage(int $required, int $available, array $context = []): self
    {
        $message = sprintf(
            'Insufficient storage. Required: %d bytes, Available: %d bytes',
            $required,
            $available
        );
        
        $context['required_storage'] = $required;
        $context['available_storage'] = $available;
        
        return new self($message, 507, null, $context); // 507 Insufficient Storage
    }

    /**
     * Create an instance for an unsupported device error
     *
     * @param string $deviceId The ID of the unsupported device
     * @param string $reason The reason the device is unsupported
     * @param array $context Additional context
     * @return self
     */
    public static function unsupportedDevice(string $deviceId, string $reason = '', array $context = []): self
    {
        $message = "Device '{$deviceId}' is not supported";
        if ($reason) {
            $message .= ": {$reason}";
        }
        
        $context['device_id'] = $deviceId;
        
        return new self($message, 400, null, $context);
    }

    /**
     * Create an instance for a timeout error
     *
     * @param string $operation The operation that timed out
     * @param int $timeout The timeout duration in seconds
     * @param array $context Additional context
     * @return self
     */
    public static function timeout(string $operation, int $timeout, array $context = []): self
    {
        $message = "Operation '{$operation}' timed out after {$timeout} seconds";
        $context['timeout_seconds'] = $timeout;
        $context['operation'] = $operation;
        
        return new self($message, 504, null, $context); // 504 Gateway Timeout
    }

    /**
     * Create an instance for a checksum verification failure
     *
     * @param string $expected Expected checksum
     * @param string $actual Actual checksum
     * @param array $context Additional context
     * @return self
     */
    public static function checksumMismatch(string $expected, string $actual, array $context = []): self
    {
        $message = sprintf(
            'Checksum mismatch. Expected: %s, Actual: %s',
            $expected,
            $actual
        );
        
        $context['expected_checksum'] = $expected;
        $context['actual_checksum'] = $actual;
        
        return new self($message, 400, null, $context);
    }
}
