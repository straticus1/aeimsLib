# Firmware Update Component

The Firmware Update component provides a secure and reliable way to update device firmware in the AeimsLib ecosystem. It supports multiple device protocols, handles the update process with safety mechanisms, and provides detailed status reporting.

## Features

- **Secure Firmware Verification**: Cryptographic signature verification ensures firmware authenticity and integrity
- **Multiple Protocol Support**: Extensible architecture supports BLE, WebSocket, and custom protocols
- **Automatic Rollback**: Failed updates are automatically rolled back to the previous version
- **Progress Tracking**: Real-time progress updates during the update process
- **Concurrent Update Protection**: Prevents multiple simultaneous updates to the same device
- **Cleanup Management**: Automatic cleanup of old firmware files and backups
- **Detailed Logging**: Comprehensive logging for debugging and auditing

## Requirements

- PHP 8.0 or higher
- OpenSSL extension
- PSR-3 compatible logger (Monolog recommended)
- Device-specific protocol implementations

## Installation

```bash
composer require aeimslib/firmware-update
```

## Basic Usage

### 1. Initialize the Service

```php
use AeimsLib\Services\FirmwareUpdateService;
use AeimsLib\Services\SecurityService;
use Monolog\Logger;
use Monolog\Handler\StreamHandler;

// Set up directories
$updateDir = __DIR__ . '/firmware/updates';
$backupDir = __DIR__ . '/firmware/backups';
$publicKeyPath = __DIR__ . '/firmware/keys/public_key.pem';

// Set up logger
$logger = new Logger('firmware-update');
$logger->pushHandler(new StreamHandler('php://stdout', Logger::INFO));

// Initialize the service
$updateService = new FirmwareUpdateService(
    $updateDir,
    $backupDir,
    $publicKeyPath,
    new SecurityService(),
    $logger
);

// Register available update strategies
$updateService->registerStrategy('ble', 'AeimsLib\Services\Firmware\BLEFirmwareUpdateStrategy');
$updateService->registerStrategy('websocket', 'AeimsLib\Services\Firmware\WebSocketFirmwareUpdateStrategy');
```

### 2. Update Firmware

```php
try {
    $result = $updateService->updateFirmware(
        'device-123',
        '/path/to/firmware.bin',
        [
            'version' => '1.2.3',
            'signature_path' => '/path/to/firmware.bin.sig',
            'backup' => true,
            'timeout' => 300, // 5 minutes
        ]
    );
    
    if ($result['status'] === FirmwareUpdateService::STATUS_COMPLETED) {
        echo "Firmware update completed successfully!\n";
    } else {
        echo "Firmware update failed: " . ($result['error'] ?? 'Unknown error') . "\n";
    }
} catch (\Exception $e) {
    echo "Error during firmware update: " . $e->getMessage() . "\n";
}
```

### 3. Check Update Status

```php
$status = $updateService->getUpdateStatus('update-id-123');

echo "Status: " . $status['status'] . "\n";
echo "Progress: " . ($status['progress'] ?? 0) . "%\n";

if (isset($status['error'])) {
    echo "Error: " . $status['error'] . "\n";
}
```

## Device Integration

### Implementing a Custom Update Strategy

1. Create a new class that implements `FirmwareUpdateStrategyInterface`:

```php
namespace YourApp\Firmware;

use AeimsLib\Services\Firmware\FirmwareUpdateStrategyInterface;

class CustomDeviceStrategy implements FirmwareUpdateStrategyInterface
{
    private $device;
    private $logger;
    
    public function __construct($device, $logger)
    {
        $this->device = $device;
        $this->logger = $logger;
    }
    
    public function startUpdate(string $firmwarePath, array $options = []): bool
    {
        // Initialize the update process
        $this->logger->info("Starting firmware update for device " . $this->device->getId());
        
        // Return true if successful
        return true;
    }
    
    public function sendChunk(string $chunk, int $offset): bool
    {
        // Send a chunk of firmware data to the device
        $this->logger->debug("Sending chunk at offset $offset");
        
        // Return true if chunk was sent successfully
        return true;
    }
    
    public function finishUpdate(): bool
    {
        // Finalize the update process
        $this->logger->info("Firmware update completed successfully");
        
        // Return true if successful
        return true;
    }
    
    public function verifyUpdate(): bool
    {
        // Verify the firmware was installed correctly
        return true;
    }
    
    public function rollback(): bool
    {
        // Roll back to the previous firmware version
        $this->logger->warning("Rolling back firmware update");
        
        // Return true if rollback was successful
        return true;
    }
    
    public function getProgress(): int
    {
        // Return current update progress (0-100)
        return 0;
    }
    
    public function getError(): ?string
    {
        // Return the last error message, or null if no error
        return null;
    }
    
    public function cleanup(): void
    {
        // Clean up any temporary resources
        $this->logger->debug("Cleaning up update resources");
    }
}
```

2. Register your strategy with the factory:

```php
$updateService->registerStrategy('custom-protocol', 'YourApp\Firmware\CustomDeviceStrategy');
```

## Security Considerations

### Firmware Signing

All firmware updates must be signed with a private key. The public key must be provided to the `FirmwareUpdateService` during initialization.

To sign a firmware file:

```bash
# Generate a private key (if you don't have one)
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:2048

# Extract the public key
openssl rsa -in private_key.pem -pubout -out public_key.pem

# Sign the firmware file
openssl dgst -sha256 -sign private_key.pem -out firmware.bin.sig firmware.bin
```

### Secure Key Storage

- Store private keys in a secure location (HSM recommended)
- Never commit private keys to version control
- Use environment variables or a secure secret management system
- Rotate keys periodically

## Error Handling

The firmware update service throws specific exceptions that you should handle:

- `FirmwareUpdateException`: Base exception for all firmware update errors
- `FirmwareVerificationException`: Thrown when firmware verification fails
- `DeviceBusyException`: Thrown when trying to update a device that's already being updated
- `StorageException`: Thrown when there are issues with file storage

## Configuration Options

The `FirmwareUpdateService` accepts the following configuration options:

```php
$config = [
    'max_file_size' => 10 * 1024 * 1024, // Maximum firmware file size (10MB)
    'backup_before_update' => true,      // Create backup before updating
    'cleanup_after_days' => 7,           // Automatically clean up old backups after X days
    'chunk_size' => 4096,                // Size of each chunk in bytes
    'max_retries' => 3,                  // Maximum number of retry attempts
    'retry_delay' => 1000,               // Delay between retries in milliseconds
];

$updateService = new FirmwareUpdateService($updateDir, $backupDir, $publicKeyPath, $securityService, $logger, $config);
```

## Testing

Run the test suite:

```bash
composer test
```

## License

This component is open-source software licensed under the [MIT License](LICENSE).

## Support

For support, please open an issue on our [GitHub repository](https://github.com/aeimslib/aeimslib).

## Contributing

Contributions are welcome! Please read our [contributing guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.
