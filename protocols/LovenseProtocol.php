<?php

namespace AeimsLib\Protocols;

class LovenseProtocol extends BLEProtocol {
    // Lovense service UUID
    const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
    
    // Characteristic UUIDs
    const TX_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';  // Write commands
    const RX_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';  // Receive notifications
    const BATTERY_UUID = '0000fff7-0000-1000-8000-00805f9b34fb';
    
    // Device types and their command formats
    const DEVICE_TYPES = [
        'A' => 'Ambi',
        'C' => 'Calor',
        'D' => 'Diamo',
        'E' => 'Edge',
        'F' => 'Ferri',
        'G' => 'Gush',
        'H' => 'Hush',
        'L' => 'Lush',
        'N' => 'Nora',
        'M' => 'Max',
        'O' => 'Osci',
        'P' => 'Pulse',
        'S' => 'Solace',
        'W' => 'Wearable',
        'Z' => 'Domi'
    ];
    
    private $deviceType;
    private $apiKey;
    private $apiEndpoint = 'https://api.lovense.com/api/lan/';
    
    public function __construct($deviceMac, $apiKey = null) {
        $this->deviceMac = $deviceMac;
        $this->apiKey = $apiKey;
        
        // Determine device type from first character of MAC address
        $this->deviceType = self::DEVICE_TYPES[$deviceMac[0]] ?? 'Unknown';
    }
    
    public function vibrate($intensity) {
        $intensity = $this->mapIntensity($intensity);
        
        // Lovense protocol uses "Vibrate:X;" format where X is intensity 0-20
        $scaledIntensity = round($intensity / 5); // Convert 0-100 to 0-20
        $command = "Vibrate:{$scaledIntensity};";
        
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }
    
    public function stop() {
        return $this->vibrate(0);
    }
    
    public function getBatteryLevel() {
        $data = $this->readCharacteristic(self::BATTERY_UUID);
        // Battery level is returned as a percentage
        return intval($data);
    }
    
    /**
     * Set vibration pattern
     * Pattern format: Array of [intensity, duration] pairs
     */
    public function setPattern($pattern) {
        $command = "Pattern:";
        foreach ($pattern as $step) {
            $intensity = $this->mapIntensity($step[0]);
            $duration = min(max(intval($step[1]), 100), 60000); // 100ms to 60s
            $command .= "V{$intensity}:T{$duration};";
        }
        
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }
    
    /**
     * Set automatic in/out movement (for Edge, Nora, Max devices)
     */
    public function setAutoMove($speed) {
        if (!in_array($this->deviceType, ['Edge', 'Nora', 'Max'])) {
            throw new \Exception("Auto move not supported on {$this->deviceType}");
        }
        
        $speed = $this->mapIntensity($speed);
        $scaledSpeed = round($speed / 5); // Convert 0-100 to 0-20
        $command = "Move:{$scaledSpeed};";
        
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }
    
    /**
     * Set rotation speed (for Nora)
     */
    public function setRotation($speed) {
        if ($this->deviceType !== 'Nora') {
            throw new \Exception("Rotation not supported on {$this->deviceType}");
        }
        
        $speed = $this->mapIntensity($speed);
        $scaledSpeed = round($speed / 5); // Convert 0-100 to 0-20
        $command = "Rotate:{$scaledSpeed};";
        
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }
    
    /**
     * Set air pump level (for Max)
     */
    public function setAirLevel($level) {
        if ($this->deviceType !== 'Max') {
            throw new \Exception("Air pump not supported on {$this->deviceType}");
        }
        
        $level = $this->mapIntensity($level);
        $scaledLevel = round($level / 20); // Convert 0-100 to 0-5
        $command = "Air:Level{$scaledLevel};";
        
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }
    
    /**
     * Enable/disable light (for Pulse devices)
     */
    public function setLight($enabled) {
        if ($this->deviceType !== 'Pulse') {
            throw new \Exception("Light control not supported on {$this->deviceType}");
        }
        
        $command = "Light:" . ($enabled ? "1" : "0") . ";";
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }
    
    /**
     * Send command via Lovense API (for remote control)
     */
    public function sendApiCommand($command, $params = []) {
        if (!$this->apiKey) {
            throw new \Exception("API key not configured");
        }
        
        $params['token'] = $this->apiKey;
        $params['deviceId'] = $this->deviceMac;
        
        $ch = curl_init($this->apiEndpoint . $command);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        
        $response = curl_exec($ch);
        curl_close($ch);
        
        return json_decode($response, true);
    }
}
