<?php

namespace AeimsLib\Tests\Protocols;

use AeimsLib\Protocols\LovenseProtocol;
use PHPUnit\Framework\TestCase;

class LovenseProtocolTest extends TestCase {
    private $edge2Protocol;
    private $ferriProtocol;
    private $standardProtocol;

    protected function setUp(): void {
        $this->edge2Protocol = new LovenseProtocol('E2000000', 'test_api_key');
        $this->ferriProtocol = new LovenseProtocol('F0000000', 'test_api_key');
        $this->standardProtocol = new LovenseProtocol('L0000000', 'test_api_key');
    }

    public function testDeviceTypeDetection() {
        $this->assertEquals('Edge2', $this->edge2Protocol->getDeviceType());
        $this->assertEquals('Ferri', $this->ferriProtocol->getDeviceType());
        $this->assertEquals('Lush', $this->standardProtocol->getDeviceType());
    }

    public function testFeatureDetection() {
        // Edge 2 features
        $edge2Features = $this->edge2Protocol->getFeatures();
        $this->assertContains('vibrate', $edge2Features);
        $this->assertContains('vibrate2', $edge2Features);
        $this->assertContains('battery', $edge2Features);

        // Ferri features
        $ferriFeatures = $this->ferriProtocol->getFeatures();
        $this->assertContains('vibrate', $ferriFeatures);
        $this->assertContains('led', $ferriFeatures);
        $this->assertContains('battery', $ferriFeatures);

        // Standard device features
        $standardFeatures = $this->standardProtocol->getFeatures();
        $this->assertContains('vibrate', $standardFeatures);
        $this->assertContains('battery', $standardFeatures);
    }

    public function testDualMotorVibration() {
        // Test Edge 2 dual motor control
        $command = $this->edge2Protocol->vibrateDual(50, 75);
        $this->assertStringContainsString('Vibrate:10', $command); // 50% -> 10
        $this->assertStringContainsString('Vibrate2:15', $command); // 75% -> 15

        // Test error on unsupported device
        $this->expectException(\Exception::class);
        $this->standardProtocol->vibrateDual(50, 75);
    }

    public function testLEDControl() {
        // Test basic LED control
        $command = $this->ferriProtocol->setLED(['enabled' => true]);
        $this->assertEquals('LED:1;', $command);

        // Test LED color
        $command = $this->ferriProtocol->setLED([
            'enabled' => true,
            'color' => 'FF0000'
        ]);
        $this->assertStringContainsString('LED:1;', $command);
        $this->assertStringContainsString('Color:FF0000;', $command);

        // Test LED pattern
        $command = $this->ferriProtocol->setLED([
            'enabled' => true,
            'pattern' => 'pulse'
        ]);
        $this->assertStringContainsString('LED:1;', $command);
        $this->assertStringContainsString('LEDPattern:1;', $command);

        // Test LED brightness
        $command = $this->ferriProtocol->setLED([
            'enabled' => true,
            'brightness' => 75
        ]);
        $this->assertStringContainsString('LED:1;', $command);
        $this->assertStringContainsString('LEDBrightness:75;', $command);

        // Test invalid color format
        $this->expectException(\Exception::class);
        $this->ferriProtocol->setLED(['color' => 'invalid']);

        // Test LED control on unsupported device
        $this->expectException(\Exception::class);
        $this->standardProtocol->setLED(['enabled' => true]);
    }

    public function testPatternControl() {
        // Test Edge 2 dual motor pattern
        $edge2Pattern = [
            [50, 75, 1000],  // Motor 1 at 50%, Motor 2 at 75%, 1 second
            [25, 100, 500]   // Motor 1 at 25%, Motor 2 at 100%, 0.5 seconds
        ];

        $command = $this->edge2Protocol->setPattern($edge2Pattern);
        $this->assertStringContainsString('V10:V2:15:T1000;', $command); // First step
        $this->assertStringContainsString('V5:V2:20:T500;', $command);   // Second step

        // Test standard device pattern
        $standardPattern = [
            [50, 1000],  // 50% intensity for 1 second
            [75, 500]    // 75% intensity for 0.5 seconds
        ];

        $command = $this->standardProtocol->setPattern($standardPattern);
        $this->assertStringContainsString('V10:T1000;', $command); // First step
        $this->assertStringContainsString('V15:T500;', $command);  // Second step
    }

    public function testPatternSynchronization() {
        $patterns = [
            'device1' => [
                'points' => [
                    ['intensity' => 50, 'duration' => 1000],
                    ['intensity' => 75, 'duration' => 500]
                ]
            ],
            'device2' => [
                'points' => [
                    ['intensity1' => 50, 'intensity2' => 75, 'duration' => 1000],
                    ['intensity1' => 25, 'intensity2' => 100, 'duration' => 500]
                ]
            ]
        ];

        // Test without API key
        $protocolWithoutKey = new LovenseProtocol('E2000000');
        $this->expectException(\Exception::class);
        $protocolWithoutKey->synchronizePatterns($patterns);

        // Test with API key
        $result = $this->edge2Protocol->synchronizePatterns($patterns);
        $this->assertArrayHasKey('status', $result);
        $this->assertArrayHasKey('timestamp', $result);
    }

    public function testIntensityMapping() {
        // Test normal values
        $this->assertEquals(50, $this->edge2Protocol->mapIntensity(50));
        $this->assertEquals(75, $this->edge2Protocol->mapIntensity(75));

        // Test clamping
        $this->assertEquals(0, $this->edge2Protocol->mapIntensity(-10));
        $this->assertEquals(100, $this->edge2Protocol->mapIntensity(150));

        // Test type conversion
        $this->assertEquals(50, $this->edge2Protocol->mapIntensity('50'));
        $this->assertEquals(75, $this->edge2Protocol->mapIntensity(75.5));
    }
}
