<?php

namespace AeimsLib\Services;

use AeimsLib\Utils\Logger;
use AeimsLib\Utils\Crypto;
use AeimsLib\Exceptions\FirmwareUpdateException;

class FirmwareUpdateService {
    private $logger;
    private $crypto;
    private $updateDirectory;
    private $backupDirectory;
    private $publicKeyPath;
    
    // Update status constants
    const STATUS_PENDING = 'pending';
    const STATUS_VERIFIED = 'verified';
    const STATUS_INSTALLING = 'installing';
    const STATUS_COMPLETED = 'completed';
    const STATUS_FAILED = 'failed';
    const STATUS_ROLLED_BACK = 'rolled_back';
    
    public function __construct(
        string $updateDirectory,
        string $backupDirectory,
        string $publicKeyPath,
        Logger $logger = null
    ) {
        $this->logger = $logger ?? new Logger('FirmwareUpdate');
        $this->crypto = new Crypto();
        $this->updateDirectory = rtrim($updateDirectory, '/') . '/';
        $this->backupDirectory = rtrim($backupDirectory, '/') . '/';
        $this->publicKeyPath = $publicKeyPath;
        
        $this->ensureDirectoriesExist();
    }
    
    /**
     * Verify firmware package integrity and signature
     */
    public function verifyFirmware(string $firmwarePath, string $signaturePath): bool {
        $this->logger->info("Verifying firmware package", ['path' => $firmwarePath]);
        
        if (!file_exists($firmwarePath) || !is_readable($firmwarePath)) {
            throw new FirmwareUpdateException("Firmware file not found or not readable");
        }
        
        if (!file_exists($signaturePath) || !is_readable($signaturePath)) {
            throw new FirmwareUpdateException("Signature file not found or not readable");
        }
        
        // Read the signature
        $signature = file_get_contents($signaturePath);
        if ($signature === false) {
            throw new FirmwareUpdateException("Failed to read signature file");
        }
        
        // Verify the signature
        $publicKey = $this->loadPublicKey();
        $firmwareData = file_get_contents($firmwarePath);
        
        if ($firmwareData === false) {
            throw new FirmwareUpdateException("Failed to read firmware file");
        }
        
        $isValid = $this->crypto->verify(
            $firmwareData,
            $signature,
            $publicKey,
            OPENSSL_ALGO_SHA256
        );
        
        if (!$isValid) {
            $this->logger->error("Firmware signature verification failed");
            throw new FirmwareUpdateException("Invalid firmware signature");
        }
        
        // Verify firmware structure
        $this->verifyFirmwareStructure($firmwareData);
        
        $this->logger->info("Firmware verification successful");
        return true;
    }
    
    /**
     * Perform the firmware update
     */
    public function updateFirmware(string $deviceId, string $firmwarePath, array $options = []): array {
        $startTime = microtime(true);
        $backupPath = '';
        $status = [
            'status' => self::STATUS_PENDING,
            'device_id' => $deviceId,
            'version' => null,
            'start_time' => $startTime,
            'end_time' => null,
            'error' => null
        ];
        
        try {
            // 1. Verify the firmware first
            $signaturePath = $firmwarePath . '.sig';
            $this->verifyFirmware($firmwarePath, $signaturePath);
            $status['status'] = self::STATUS_VERIFIED;
            
            // 2. Extract version info
            $firmwareData = json_decode(file_get_contents($firmwarePath), true);
            $status['version'] = $firmwareData['version'] ?? 'unknown';
            
            // 3. Create backup of current firmware if rollback is enabled
            if ($options['enable_rollback'] ?? true) {
                $backupPath = $this->createBackup($deviceId);
                $this->logger->info("Created firmware backup", ['backup_path' => $backupPath]);
            }
            
            // 4. Install the new firmware
            $status['status'] = self::STATUS_INSTALLING;
            $this->installFirmware($deviceId, $firmwarePath);
            
            // 5. Verify the installation
            if (!$this->verifyInstallation($deviceId, $firmwareData)) {
                throw new FirmwareUpdateException("Firmware installation verification failed");
            }
            
            // 6. Clean up old backups if needed
            $this->cleanupOldBackups($deviceId, $options['max_backups'] ?? 3);
            
            $status['status'] = self::STATUS_COMPLETED;
            $this->logger->info("Firmware update completed successfully", [
                'device_id' => $deviceId,
                'version' => $status['version'],
                'duration' => round(microtime(true) - $startTime, 2) . 's'
            ]);
            
        } catch (\Exception $e) {
            $status['status'] = self::STATUS_FAILED;
            $status['error'] = $e->getMessage();
            
            // Attempt rollback if enabled and backup exists
            if (!empty($backupPath) && ($options['enable_rollback'] ?? true)) {
                try {
                    $this->rollbackFirmware($deviceId, $backupPath);
                    $status['status'] = self::STATUS_ROLLED_BACK;
                    $this->logger->warning("Rolled back firmware after failed update", [
                        'device_id' => $deviceId,
                        'error' => $e->getMessage()
                    ]);
                } catch (\Exception $rollbackEx) {
                    $status['error'] .= " | Rollback failed: " . $rollbackEx->getMessage();
                    $this->logger->error("Firmware rollback failed", [
                        'device_id' => $deviceId,
                        'error' => $rollbackEx->getMessage()
                    ]);
                }
            }
            
            $this->logger->error("Firmware update failed", [
                'device_id' => $deviceId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            throw new FirmwareUpdateException($e->getMessage(), $e->getCode(), $e);
        } finally {
            $status['end_time'] = microtime(true);
            $status['duration'] = round($status['end_time'] - $startTime, 2);
            $this->logUpdateStatus($status);
        }
        
        return $status;
    }
    
    /**
     * Roll back to a previous firmware version
     */
    public function rollbackFirmware(string $deviceId, string $backupPath): bool {
        $this->logger->info("Initiating firmware rollback", [
            'device_id' => $deviceId,
            'backup_path' => $backupPath
        ]);
        
        if (!file_exists($backupPath) || !is_readable($backupPath)) {
            throw new FirmwareUpdateException("Backup file not found or not readable");
        }
        
        try {
            // Verify the backup before restoring
            $backupData = json_decode(file_get_contents($backupPath), true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new FirmwareUpdateException("Invalid backup file format");
            }
            
            // Restore the backup
            $this->installFirmware($deviceId, $backupPath);
            
            $this->logger->info("Firmware rollback completed successfully", [
                'device_id' => $deviceId,
                'version' => $backupData['version'] ?? 'unknown'
            ]);
            
            return true;
        } catch (\Exception $e) {
            $this->logger->error("Firmware rollback failed", [
                'device_id' => $deviceId,
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }
    
    /**
     * List available backups for a device
     */
    public function listBackups(string $deviceId): array {
        $backupDir = $this->backupDirectory . $deviceId . '/';
        $backups = [];
        
        if (!is_dir($backupDir)) {
            return $backups;
        }
        
        $files = glob($backupDir . '*.bak');
        foreach ($files as $file) {
            $backupData = json_decode(file_get_contents($file), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $backups[] = [
                    'path' => $file,
                    'version' => $backupData['version'] ?? 'unknown',
                    'timestamp' => filemtime($file),
                    'size' => filesize($file)
                ];
            }
        }
        
        // Sort by timestamp (newest first)
        usort($backups, function($a, $b) {
            return $b['timestamp'] - $a['timestamp'];
        });
        
        return $backups;
    }
    
    private function ensureDirectoriesExist(): void {
        $directories = [$this->updateDirectory, $this->backupDirectory];
        
        foreach ($directories as $directory) {
            if (!is_dir($directory)) {
                if (!mkdir($directory, 0755, true)) {
                    throw new FirmwareUpdateException("Failed to create directory: $directory");
                }
            }
            
            if (!is_writable($directory)) {
                throw new FirmwareUpdateException("Directory is not writable: $directory");
            }
        }
    }
    
    private function loadPublicKey() {
        if (!file_exists($this->publicKeyPath) || !is_readable($this->publicKeyPath)) {
            throw new FirmwareUpdateException("Public key not found or not readable");
        }
        
        $publicKey = file_get_contents($this->publicKeyPath);
        if ($publicKey === false) {
            throw new FirmwareUpdateException("Failed to read public key");
        }
        
        return $publicKey;
    }
    
    private function verifyFirmwareStructure(array $firmwareData): void {
        $requiredFields = ['version', 'checksum', 'data', 'metadata'];
        
        foreach ($requiredFields as $field) {
            if (!array_key_exists($field, $firmwareData)) {
                throw new FirmwareUpdateException("Missing required field in firmware: $field");
            }
        }
        
        // Verify checksum
        $calculatedChecksum = hash('sha256', json_encode($firmwareData['data']));
        if ($calculatedChecksum !== $firmwareData['checksum']) {
            throw new FirmwareUpdateException("Firmware checksum verification failed");
        }
    }
    
    private function createBackup(string $deviceId): string {
        $deviceBackupDir = $this->backupDirectory . $deviceId . '/';
        if (!is_dir($deviceBackupDir) && !mkdir($deviceBackupDir, 0755, true)) {
            throw new FirmwareUpdateException("Failed to create backup directory");
        }
        
        $backupPath = $deviceBackupDir . 'backup_' . date('Ymd_His') . '.bak';
        
        // Get current firmware data (implementation depends on your device)
        $currentFirmware = $this->readCurrentFirmware($deviceId);
        
        if (file_put_contents($backupPath, json_encode($currentFirmware, JSON_PRETTY_PRINT)) === false) {
            throw new FirmwareUpdateException("Failed to create backup file");
        }
        
        return $backupPath;
    }
    
    private function installFirmware(string $deviceId, string $firmwarePath): void {
        // This is a placeholder - implementation depends on your device
        // In a real implementation, this would communicate with the device
        // to perform the actual firmware update
        
        $firmwareData = json_decode(file_get_contents($firmwarePath), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new FirmwareUpdateException("Invalid firmware file format");
        }
        
        // Simulate installation delay
        usleep(500000); // 0.5 seconds
        
        // In a real implementation, you would:
        // 1. Put device in firmware update mode
        // 2. Send firmware data in chunks
        // 3. Verify each chunk was written correctly
        // 4. Finalize the update
        // 5. Reboot the device
        
        $this->logger->info("Firmware installation completed", [
            'device_id' => $deviceId,
            'version' => $firmwareData['version'] ?? 'unknown'
        ]);
    }
    
    private function verifyInstallation(string $deviceId, array $firmwareData): bool {
        // This is a placeholder - implementation depends on your device
        // In a real implementation, you would:
        // 1. Read back the installed firmware
        // 2. Verify the version and checksum
        // 3. Perform basic functionality tests
        
        // Simulate verification delay
        usleep(200000); // 0.2 seconds
        
        // For this example, we'll just return true
        // In a real implementation, you would add proper verification logic
        return true;
    }
    
    private function readCurrentFirmware(string $deviceId): array {
        // This is a placeholder - implementation depends on your device
        // In a real implementation, you would read the current firmware from the device
        
        return [
            'version' => '1.0.0',
            'checksum' => hash('sha256', 'current_firmware_data'),
            'data' => 'current_firmware_data',
            'metadata' => [
                'device_id' => $deviceId,
                'timestamp' => time(),
                'backup' => true
            ]
        ];
    }
    
    private function cleanupOldBackups(string $deviceId, int $keep = 3): void {
        $backups = $this->listBackups($deviceId);
        
        if (count($backups) <= $keep) {
            return;
        }
        
        // Sort by timestamp (oldest first)
        usort($backups, function($a, $b) {
            return $a['timestamp'] - $b['timestamp'];
        });
        
        // Keep the most recent $keep backups
        $toDelete = array_slice($backups, 0, -$keep);
        
        foreach ($toDelete as $backup) {
            if (file_exists($backup['path'])) {
                unlink($backup['path']);
                $this->logger->debug("Removed old backup", [
                    'path' => $backup['path'],
                    'version' => $backup['version']
                ]);
            }
        }
    }
    
    private function logUpdateStatus(array $status): void {
        $logFile = $this->updateDirectory . 'update_history.log';
        $logEntry = sprintf(
            "[%s] Device: %s | Status: %s | Version: %s | Duration: %.2fs | Error: %s\n",
            date('Y-m-d H:i:s'),
            $status['device_id'],
            $status['status'],
            $status['version'] ?? 'N/A',
            $status['duration'] ?? 0,
            $status['error'] ?? 'None'
        );
        
        file_put_contents($logFile, $logEntry, FILE_APPEND);
    }
}
