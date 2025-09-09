<?php

namespace AdultToyLib\Protocols;

class WeVibeProtocol extends BLEProtocol {
    // WeVibe service UUID
    const SERVICE_UUID = 'f000bb03-0451-4000-b000-000000000000';
    
    // Characteristic UUIDs
    const COMMAND_UUID = 'f000c000-0451-4000-b000-000000000000';
    const TOUCH_UUID = 'f000cc02-0451-4000-b000-000000000000';
    const BATTERY_UUID = '00002a19-0000-1000-8000-00805f9b34fb'; // Standard BLE battery service
    
    // Motor channels
    const MOTOR_EXTERNAL = 0;
    const MOTOR_INTERNAL = 1;
    
    // Common device models
    const DEVICE_MODELS = [
        'Chorus',
        'Melt',
        'Nova',
        'Sync',
        'Vector',
        'Verge',
        'Pivot',
        'Bond',
        'Jive',
        'Wand',
        'Touch',
        'Wish',
        'Tango',
        'Moxie',
        'Rave'
    ];
    
    private $model;
    private $touchEnabled = false;
    
    public function __construct($deviceMac, $model = null) {
        $this->deviceMac = $deviceMac;
        $this->model = $model;
        
        if ($model && !in_array($model, self::DEVICE_MODELS)) {
            throw new \Exception("Unknown WeVibe model: {$model}");
        }
    }
    
    public function connect() {
        parent::connect();
        
        // Enable touch sensing if supported
        if (in_array($this->model, ['Nova', 'Chorus', 'Touch', 'Wish'])) {
            $this->enableTouch();
        }
    }
    
    public function vibrate($intensity, $motor = null) {
        $intensity = $this->mapIntensity($intensity);
        
        // WeVibe protocol uses 8-byte commands
        $command = [0x0f, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        
        if ($motor === null || $motor === self::MOTOR_EXTERNAL) {
            $command[2] = round($intensity * 0.15); // External motor (0-15)
        }
        if ($motor === null || $motor === self::MOTOR_INTERNAL) {
            $command[3] = round($intensity * 0.15); // Internal motor (0-15)
        }
        
        return $this->writeCharacteristic(self::COMMAND_UUID, pack('C*', ...$command));
    }
    
    public function stop() {
        // Send zero intensity to both motors
        return $this->vibrate(0);
    }
    
    public function getBatteryLevel() {
        $data = $this->readCharacteristic(self::BATTERY_UUID);
        // Standard BLE battery level characteristic returns percentage
        return intval($data);
    }
    
    /**
     * Set vibration mode
     * @param int $mode Mode number (0-9)
     * @param int $intensity Intensity for the mode (0-100)
     */
    public function setMode($mode, $intensity = 100) {
        $mode = min(max(intval($mode), 0), 9);
        $intensity = $this->mapIntensity($intensity);
        
        $command = [0x0f, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        $command[1] = $mode;
        $command[2] = round($intensity * 0.15); // Scale to 0-15
        
        return $this->writeCharacteristic(self::COMMAND_UUID, pack('C*', ...$command));
    }
    
    /**
     * Enable touch sensing
     */
    private function enableTouch() {
        if (!in_array($this->model, ['Nova', 'Chorus', 'Touch', 'Wish'])) {
            throw new \Exception("Touch sensing not supported on {$this->model}");
        }
        
        // Enable touch notifications
        $this->subscribe(self::TOUCH_UUID);
        $this->touchEnabled = true;
    }
    
    /**
     * Set custom vibration pattern
     * @param array $pattern Array of [external_intensity, internal_intensity, duration] arrays
     */
    public function setPattern($pattern) {
        foreach ($pattern as $step) {
            $extIntensity = $this->mapIntensity($step[0]);
            $intIntensity = $this->mapIntensity($step[1]);
            $duration = min(max(intval($step[2]), 100), 60000); // 100ms to 60s
            
            $command = [0x0f, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
            $command[2] = round($extIntensity * 0.15); // External motor (0-15)
            $command[3] = round($intIntensity * 0.15); // Internal motor (0-15)
            
            $this->writeCharacteristic(self::COMMAND_UUID, pack('C*', ...$command));
            usleep($duration * 1000); // Convert to microseconds
        }
    }
    
    /**
     * Enable/disable edge mode (for Chorus)
     */
    public function setEdgeMode($enabled) {
        if ($this->model !== 'Chorus') {
            throw new \Exception("Edge mode only supported on Chorus");
        }
        
        $command = [0x0f, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        $command[4] = $enabled ? 0x01 : 0x00;
        
        return $this->writeCharacteristic(self::COMMAND_UUID, pack('C*', ...$command));
    }
    
    /**
     * Set low power mode
     */
    public function setLowPowerMode($enabled) {
        $command = [0x0f, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        $command[5] = $enabled ? 0x01 : 0x00;
        
        return $this->writeCharacteristic(self::COMMAND_UUID, pack('C*', ...$command));
    }
    
    /**
     * Parse touch sensor data
     */
    protected function handleTouchData($data) {
        if (!$this->touchEnabled) {
            return null;
        }
        
        $bytes = unpack('C*', $data);
        
        return [
            'touch_active' => ($bytes[1] & 0x01) !== 0,
            'pressure' => $bytes[2], // 0-255
            'position' => $bytes[3]  // 0-255, position along touch surface
        ];
    }
}
