<?php

namespace AeimsLib\Protocols;

class MagicMotionProtocol extends BLEProtocol {
    // Magic Motion service UUIDs
    const SERVICE_UUID = '78667579-7b48-43db-b8c5-7928768cff2c';
    
    // Characteristic UUIDs
    const TX_UUID = '78667579-a914-49a4-8333-aa3c0cd8fedc';
    const RX_UUID = '78667579-a914-49a4-8333-aa3c0cd8feed';
    
    // Device models
    const DEVICE_MODELS = [
        'Smart Mini Vibe',
        'Flamingo',
        'Curve',
        'Awaken',
        'Fugu',
        'Eidolon',
        'Dante',
        'Krush',
        'Candy'
    ];
    
    // Vibration modes
    const MODES = [
        'constant' => 0x01,
        'pulse' => 0x02,
        'wave' => 0x03,
        'tease' => 0x04,
        'step' => 0x05,
        'rhythm' => 0x06,
        'random' => 0x07
    ];
    
    private $model;
    private $key;
    private $lastCommand;
    
    public function __construct($deviceMac, $model = null) {
        $this->deviceMac = $deviceMac;
        $this->model = $model;
        
        if ($model && !in_array($model, self::DEVICE_MODELS)) {
            throw new \Exception("Unknown Magic Motion model: {$model}");
        }
        
        // Generate encryption key from MAC address
        $this->key = $this->generateKey($deviceMac);
    }
    
    /**
     * Generate device-specific encryption key
     */
    private function generateKey($mac) {
        // Magic Motion uses a proprietary key generation algorithm
        // This is a simplified version
        $key = [];
        $macBytes = explode(':', $mac);
        
        for ($i = 0; $i < 8; $i++) {
            $key[$i] = hexdec($macBytes[$i % count($macBytes)]);
        }
        
        return $key;
    }
    
    /**
     * Encrypt command using device key
     */
    private function encryptCommand($data) {
        $result = [];
        for ($i = 0; $i < count($data); $i++) {
            $result[$i] = $data[$i] ^ $this->key[$i % count($this->key)];
        }
        return $result;
    }
    
    public function vibrate($intensity) {
        $intensity = $this->mapIntensity($intensity);
        
        // Magic Motion protocol uses 0-100 range
        $command = [
            0xAA,  // Start byte
            0x01,  // Command type: vibrate
            round($intensity),
            0x00,  // Reserved
            0x00   // Checksum (calculated below)
        ];
        
        // Calculate checksum
        $command[4] = array_sum(array_slice($command, 0, 4)) & 0xFF;
        
        // Encrypt command
        $encrypted = $this->encryptCommand($command);
        
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::TX_UUID, pack('C*', ...$encrypted));
    }
    
    public function stop() {
        return $this->vibrate(0);
    }
    
    public function getBatteryLevel() {
        // Send battery level request command
        $command = [
            0xAA,  // Start byte
            0x02,  // Command type: battery request
            0x00,  // Reserved
            0x00,  // Reserved
            0xAC   // Checksum
        ];
        
        $encrypted = $this->encryptCommand($command);
        $this->writeCharacteristic(self::TX_UUID, pack('C*', ...$encrypted));
        
        // Read response
        $data = $this->readCharacteristic(self::RX_UUID);
        $decrypted = $this->encryptCommand(unpack('C*', $data));
        
        // Battery level is in third byte
        return $decrypted[2];
    }
    
    /**
     * Set vibration mode
     */
    public function setMode($mode, $intensity = 100) {
        if (!isset(self::MODES[$mode])) {
            throw new \Exception("Invalid vibration mode: {$mode}");
        }
        
        $intensity = $this->mapIntensity($intensity);
        
        $command = [
            0xAA,  // Start byte
            0x03,  // Command type: mode
            self::MODES[$mode],
            round($intensity),
            0x00   // Checksum (calculated below)
        ];
        
        // Calculate checksum
        $command[4] = array_sum(array_slice($command, 0, 4)) & 0xFF;
        
        $encrypted = $this->encryptCommand($command);
        
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::TX_UUID, pack('C*', ...$encrypted));
    }
    
    /**
     * Set custom vibration pattern
     * @param array $pattern Array of [intensity, duration] pairs
     */
    public function setPattern($pattern) {
        foreach ($pattern as $step) {
            $intensity = $this->mapIntensity($step[0]);
            $duration = min(max(intval($step[1]), 100), 60000); // 100ms to 60s
            
            $command = [
                0xAA,  // Start byte
                0x04,  // Command type: pattern step
                round($intensity),
                min(round($duration / 100), 255), // Duration in 100ms units
                0x00   // Checksum (calculated below)
            ];
            
            // Calculate checksum
            $command[4] = array_sum(array_slice($command, 0, 4)) & 0xFF;
            
            $encrypted = $this->encryptCommand($command);
            $this->writeCharacteristic(self::TX_UUID, pack('C*', ...$encrypted));
            
            if ($duration > 25500) { // Max duration in one command
                usleep($duration * 1000);
            }
        }
    }
    
    /**
     * Set preset rhythm pattern
     */
    public function setRhythm($rhythmId, $intensity = 100) {
        $rhythmId = min(max(intval($rhythmId), 1), 10); // 10 built-in rhythms
        $intensity = $this->mapIntensity($intensity);
        
        $command = [
            0xAA,  // Start byte
            0x05,  // Command type: rhythm
            $rhythmId,
            round($intensity),
            0x00   // Checksum (calculated below)
        ];
        
        // Calculate checksum
        $command[4] = array_sum(array_slice($command, 0, 4)) & 0xFF;
        
        $encrypted = $this->encryptCommand($command);
        
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::TX_UUID, pack('C*', ...$encrypted));
    }
    
    /**
     * Enable/disable heating (for supported devices)
     */
    public function setHeating($enabled, $temperature = 37) {
        $temperature = min(max(intval($temperature), 35), 40); // 35-40°C range
        
        $command = [
            0xAA,  // Start byte
            0x06,  // Command type: heating
            $enabled ? 0x01 : 0x00,
            $temperature,
            0x00   // Checksum (calculated below)
        ];
        
        // Calculate checksum
        $command[4] = array_sum(array_slice($command, 0, 4)) & 0xFF;
        
        $encrypted = $this->encryptCommand($command);
        
        $this->lastCommand = $command;
        return $this->writeCharacteristic(self::TX_UUID, pack('C*', ...$encrypted));
    }
    
    /**
     * Parse device response
     */
    protected function parseResponse($data) {
        $decrypted = $this->encryptCommand(unpack('C*', $data));
        
        // Verify checksum
        $checksum = array_sum(array_slice($decrypted, 0, 4)) & 0xFF;
        if ($checksum !== $decrypted[4]) {
            throw new \Exception("Invalid response checksum");
        }
        
        return [
            'command_type' => $decrypted[1],
            'data1' => $decrypted[2],
            'data2' => $decrypted[3]
        ];
    }
}
