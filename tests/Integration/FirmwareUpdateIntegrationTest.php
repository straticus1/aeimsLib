<?php

namespace Tests\Integration;

use AeimsLib\Services\FirmwareUpdateService;
use AeimsLib\Services\Firmware\FirmwareUpdateStrategyFactory;
use AeimsLib\Services\SecurityService;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

class FirmwareUpdateIntegrationTest extends TestCase
{
    private $updateService;
    private $testDir;
    private $updateDir;
    private $backupDir;
    private $publicKeyPath;
    private $privateKeyPath;
    private $deviceId = 'test-device-001';
    
    protected function setUp(): void
    {
        parent::setUp();
        
        // Create test directories
        $this->testDir = sys_get_temp_dir() . '/aeimslib_fw_test_' . uniqid();
        $this->updateDir = $this->testDir . '/updates';
        $this->backupDir = $this->testDir . '/backups';
        
        mkdir($this->testDir, 0777, true);
        mkdir($this->updateDir, 0777, true);
        mkdir($this->backupDir, 0777, true);
        
        // Generate test key pair
        $this->generateTestKeyPair();
        
        // Create test firmware files
        $this->createTestFirmwareFiles();
        
        // Initialize the service
        $this->updateService = new FirmwareUpdateService(
            $this->updateDir,
            $this->backupDir,
            $this->publicKeyPath,
            new SecurityService(),
            new NullLogger(),
            [
                'max_file_size' => 10 * 1024 * 1024, // 10MB
                'backup_before_update' => true,
                'cleanup_after_days' => 1,
            ]
        );
        
        // Register test strategy
        $this->updateService->registerStrategy('test', 'AeimsLib\Services\Firmware\NullFirmwareUpdateStrategy');
    }
    
    protected function tearDown(): void
    {
        // Clean up test files
        $this->recursiveDelete($this->testDir);
        parent::tearDown();
    }
    
    private function recursiveDelete(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        
        $files = array_diff(scandir($dir), ['.', '..']);
        foreach ($files as $file) {
            $path = $dir . '/' . $file;
            is_dir($path) ? $this->recursiveDelete($path) : unlink($path);
        }
        
        rmdir($dir);
    }
    
    private function generateTestKeyPair(): void
    {
        $this->privateKeyPath = $this->testDir . '/private_key.pem';
        $this->publicKeyPath = $this->testDir . '/public_key.pem';
        
        // Generate private key
        $privateKey = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        
        // Extract public key
        $keyDetails = openssl_pkey_get_details($privateKey);
        file_put_contents($this->publicKeyPath, $keyDetails['key']);
        
        // Save private key
        openssl_pkey_export_to_file($privateKey, $this->privateKeyPath);
    }
    
    private function createTestFirmwareFiles(): void
    {
        // Create test firmware files (1MB each)
        $firmwareSizes = [
            'v1.0.0' => 1024 * 1024,      // 1MB
            'v1.1.0' => 1.5 * 1024 * 1024, // 1.5MB
            'v2.0.0' => 2 * 1024 * 1024,   // 2MB
        ];
        
        foreach ($firmwareSizes as $version => $size) {
            $firmwarePath = $this->updateDir . "/firmware_{$version}.bin";
            $signaturePath = $firmwarePath . '.sig';
            
            // Create random firmware data
            $firmwareData = random_bytes($size);
            file_put_contents($firmwarePath, $firmwareData);
            
            // Sign the firmware
            openssl_sign($firmwareData, $signature, file_get_contents($this->privateKeyPath), 'sha256');
            file_put_contents($signaturePath, $signature);
        }
    }
    
    private function createTestDevice(string $id, string $protocol = 'test'): object
    {
        return new class($id, $protocol) {
            private $id;
            private $protocol;
            private $firmwareVersion = '1.0.0';
            
            public function __construct($id, $protocol)
            {
                $this->id = $id;
                $this->protocol = $protocol;
            }
            
            public function getId() { return $this->id; }
            public function getProtocol() { return $this->protocol; }
            public function getFirmwareVersion() { return $this->firmwareVersion; }
            public function setFirmwareVersion($version) { $this->firmwareVersion = $version; }
        };
    }
    
    public function testSuccessfulFirmwareUpdate()
    {
        $firmwarePath = $this->updateDir . '/firmware_v1.1.0.bin';
        $signaturePath = $firmwarePath . '.sig';
        
        $result = $this->updateService->updateFirmware(
            $this->deviceId,
            $firmwarePath,
            [
                'version' => '1.1.0',
                'signature_path' => $signaturePath,
            ]
        );
        
        $this->assertEquals(FirmwareUpdateService::STATUS_COMPLETED, $result['status']);
        $this->assertArrayNotHasKey('error', $result);
        $this->assertGreaterThan(0, $result['duration']);
        
        // Verify backup was created
        $backups = glob($this->backupDir . '/*.bin');
        $this->assertCount(1, $backups);
    }
    
    public function testFirmwareVerificationFailure()
    {
        $firmwarePath = $this->updateDir . '/firmware_v1.1.0.bin';
        
        // Create invalid signature
        $invalidSignature = str_repeat('X', 256);
        $signaturePath = $this->updateDir . '/invalid_signature.sig';
        file_put_contents($signaturePath, $invalidSignature);
        
        $this->expectException(\AeimsLib\Exceptions\FirmwareUpdateException::class);
        $this->expectExceptionMessage('Firmware verification failed');
        
        $this->updateService->updateFirmware(
            $this->deviceId,
            $firmwarePath,
            [
                'version' => '1.1.0',
                'signature_path' => $signaturePath,
            ]
        );
    }
    
    public function testRollbackOnFailedUpdate()
    {
        // First, perform a successful update to v1.1.0
        $v1_1_0 = $this->updateDir . '/firmware_v1.1.0.bin';
        $v1_1_0_sig = $v1_1_0 . '.sig';
        
        $result = $this->updateService->updateFirmware(
            $this->deviceId,
            $v1_1_0,
            [
                'version' => '1.1.0',
                'signature_path' => $v1_1_0_sig,
            ]
        );
        
        $updateId = $result['update_id'];
        
        // Now try to update to v2.0.0 but simulate a failure
        $v2_0_0 = $this->updateDir . '/firmware_v2.0.0.bin';
        $v2_0_0_sig = $v2_0_0 . '.sig';
        
        // Create a mock strategy that will fail
        $mockStrategy = $this->createPartialMock(
            'AeimsLib\Services\Firmware\NullFirmwareUpdateStrategy',
            ['sendChunk']
        );
        
        $mockStrategy->method('sendChunk')
            ->will($this->throwException(new \RuntimeException('Simulated update failure')));
            
        $reflection = new \ReflectionProperty($this->updateService, 'strategyFactory');
        $reflection->setAccessible(true);
        
        $factory = $this->createMock(FirmwareUpdateStrategyFactory::class);
        $factory->method('createForDevice')
            ->willReturn($mockStrategy);
            
        $reflection->setValue($this->updateService, $factory);
        
        try {
            $this->updateService->updateFirmware(
                $this->deviceId,
                $v2_0_0,
                [
                    'version' => '2.0.0',
                    'signature_path' => $v2_0_0_sig,
                ]
            );
            $this->fail('Expected FirmwareUpdateException was not thrown');
        } catch (\AeimsLib\Exceptions\FirmwareUpdateException $e) {
            // Expected exception
            $this->assertStringContainsString('Simulated update failure', $e->getMessage());
        }
        
        // Verify rollback was performed
        $status = $this->updateService->getUpdateStatus($updateId);
        $this->assertEquals(FirmwareUpdateService::STATUS_ROLLED_BACK, $status['status']);
    }
    
    public function testConcurrentUpdates()
    {
        $firmwarePath = $this->updateDir . '/firmware_v1.1.0.bin';
        $signaturePath = $firmwarePath . '.sig';
        
        // Start first update
        $result1 = $this->updateService->updateFirmware(
            $this->deviceId,
            $firmwarePath,
            [
                'version' => '1.1.0',
                'signature_path' => $signaturePath,
            ]
        );
        
        // Try to start a second update for the same device
        $this->expectException(\AeimsLib\Exceptions\FirmwareUpdateException::class);
        $this->expectExceptionMessage('Device is already being updated');
        
        $this->updateService->updateFirmware(
            $this->deviceId,
            $firmwarePath,
            [
                'version' => '1.1.0',
                'signature_path' => $signaturePath,
            ]
        );
    }
    
    public function testCleanupOldFiles()
    {
        // Create old backup files
        $oldBackup = $this->backupDir . '/old_backup.bin';
        file_put_contents($oldBackup, 'test');
        touch($oldBackup, time() - 2 * 86400); // 2 days old
        
        // Create recent backup
        $recentBackup = $this->backupDir . '/recent_backup.bin';
        file_put_contents($recentBackup, 'test');
        
        // Force cleanup
        $reflection = new \ReflectionMethod($this->updateService, 'cleanupOldFiles');
        $reflection->setAccessible(true);
        $reflection->invoke($this->updateService);
        
        // Verify old file was deleted, recent file was kept
        $this->assertFileDoesNotExist($oldBackup);
        $this->assertFileExists($recentBackup);
    }
}
