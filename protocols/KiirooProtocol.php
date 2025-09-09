<?php

namespace AdultToyLib\Protocols;

class KiirooProtocol extends BLEProtocol {
    // Kiiroo service UUIDs
    const MAIN_SERVICE_UUID = '88f80580-0000-01e6-aace-0002a5d5c51b';
    const COMMAND_SERVICE_UUID = '88f80581-0000-01e6-aace-0002a5d5c51b';
    const STATUS_SERVICE_UUID = '88f80582-0000-01e6-aace-0002a5d5c51b';
    
    // Characteristic UUIDs
    const COMMAND_CHAR_UUID = '88f80583-0000-01e6-aace-0002a5d5c51b';
    const STATUS_CHAR_UUID = '88f80584-0000-01e6-aace-0002a5d5c51b';
    const DATA_CHAR_UUID = '88f80585-0000-01e6-aace-0002a5d5c51b';
    const FIRMWARE_CHAR_UUID = '88f80586-0000-01e6-aace-0002a5d5c51b';
    
    // Device models
    const DEVICE_MODELS = [
        'OPR' => 'Onyx+',
        'OPTR' => 'Onyx+',
        'PEARL2' => 'Pearl2',
        'TITAN' => 'Titan',
        'KEON' => 'Keon',
        'CLIONA' => 'Cliona',
        'GEMINI' => 'Gemini'
    ];
    
    private $model;
    private $lastCommand;
    private $initialized = false;
    
    public function __construct($deviceMac, $model = null) {
        $this->deviceMac = $deviceMac;
        $this->model = $model;
        
        if ($model && !isset(self::DEVICE_MODELS[$model])) {
            throw new \Exception("Unknown Kiiroo model: {$model}");
        }
    }
    
    public function connect() {
        parent::connect();
        
        // Subscribe to status notifications
        $this->subscribe(self::STATUS_CHAR_UUID);
        
        // Initialize device
        $this->initialize();
    }
    
    /**
     * Initialize device with handshake
     */
    private function initialize() {
        // Kiiroo handshake sequence
        $initCommands = [
            [0x01, 0x00], // Request device info
            [0x02, 0x00], // Request status
            [0x03, 0x00]  // Enable notifications
        ];
        
        foreach ($initCommands as $cmd) {
            $this->writeCharacteristic(self::COMMAND_CHAR_UUID, pack('C*', ...$cmd));
            usleep(100000); // 100ms delay between commands
        }
        
        $this->initialized = true;
    }
    
    public function vibrate($intensity) {
        if (!$this->initialized) {
            throw new \Exception("Device not initialized");
        }
        
        $intensity = $this->mapIntensity($intensity);
        
        // Kiiroo protocol uses 0-99 range for most devices
        $scaledIntensity = round($intensity * 0.99);
        
        // Command format varies by device model
        switch ($this->model) {
            case 'CLIONA':
            case 'GEMINI':
                // Vibration devices use simple intensity command
                $command = [0x03, $scaledIntensity];
                break;
                
            case 'KEON':
            case 'ONYX+':
                // Stroking devices use position and speed
                $position = round($intensity * 0.99); // 0-99 position
                $speed = round($intensity * 0.20);    // 0-20 speed
                $command = [0x04, $position, $speed];
                break;
                
            default:
                // Generic command format
                $command = [0x02, $scaledIntensity];
        }
        
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::COMMAND_CHAR_UUID, pack('C*', ...$command));
    }
    
    public function stop() {
        $command = [0x02, 0x00]; // Stop command
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::COMMAND_CHAR_UUID, pack('C*', ...$command));
    }
    
    public function getBatteryLevel() {
        // Read status characteristic which includes battery level
        $data = $this->readCharacteristic(self::STATUS_CHAR_UUID);
        $bytes = unpack('C*', $data);
        
        // Battery level is typically in byte 2
        return isset($bytes[2]) ? $bytes[2] : null;
    }
    
    /**
     * Set device mode (for devices that support multiple modes)
     */
    public function setMode($mode) {
        if (!in_array($this->model, ['CLIONA', 'GEMINI'])) {
            throw new \Exception("Mode control not supported on {$this->model}");
        }
        
        $mode = min(max(intval($mode), 0), 9);
        $command = [0x05, $mode];
        
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::COMMAND_CHAR_UUID, pack('C*', ...$command));
    }
    
    /**
     * Set stroke positions for stroking devices
     */
    public function setStrokePositions($min, $max) {
        if (!in_array($this->model, ['KEON', 'ONYX+'])) {
            throw new \Exception("Stroke control not supported on {$this->model}");
        }
        
        $min = min(max(round($min * 0.99), 0), 99);
        $max = min(max(round($max * 0.99), 0), 99);
        
        if ($min >= $max) {
            throw new \Exception("Invalid stroke positions: min must be less than max");
        }
        
        $command = [0x06, $min, $max];
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::COMMAND_CHAR_UUID, pack('C*', ...$command));
    }
    
    /**
     * Set stroke speed for stroking devices
     */
    public function setStrokeSpeed($speed) {
        if (!in_array($this->model, ['KEON', 'ONYX+'])) {
            throw new \Exception("Stroke control not supported on {$this->model}");
        }
        
        $speed = min(max(round($speed * 0.20), 0), 20); // 0-20 speed range
        $command = [0x07, $speed];
        
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::COMMAND_CHAR_UUID, pack('C*', ...$command));
    }
    
    /**
     * Set vibration pattern
     * @param array $pattern Array of [intensity, duration] pairs
     */
    public function setPattern($pattern) {
        if (!in_array($this->model, ['CLIONA', 'GEMINI'])) {
            throw new \Exception("Pattern control not supported on {$this->model}");
        }
        
        foreach ($pattern as $step) {
            $intensity = min(max(round($step[0] * 0.99), 0), 99);
            $duration = min(max(intval($step[1]), 100), 60000); // 100ms to 60s
            
            $command = [0x03, $intensity];
            $this->writeCharacteristic(self::COMMAND_CHAR_UUID, pack('C*', ...$command));
            usleep($duration * 1000);
        }
    }
    
    /**
     * Handle status notifications
     */
    protected function handleStatus($data) {
        $bytes = unpack('C*', $data);
        
        return [
            'battery_level' => $bytes[2] ?? null,
            'device_status' => $bytes[3] ?? null,
            'error_code' => $bytes[4] ?? null
        ];
    }
}
