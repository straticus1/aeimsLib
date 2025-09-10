<?php

namespace AeimsLib\Protocols;

class LovenseProtocol extends BLEProtocol {
    // Lovense service UUID
    const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
    
    // Characteristic UUIDs
    const TX_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';  // Write commands
    const RX_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';  // Receive notifications
    const BATTERY_UUID = '0000fff7-0000-1000-8000-00805f9b34fb';
    const LED_UUID = '0000fff8-0000-1000-8000-00805f9b34fb';  // LED control
    
    // Device types and their command formats
    const DEVICE_TYPES = [
        'A' => 'Ambi',
        'C' => 'Calor',
        'D' => 'Diamo',
        'E' => 'Edge',
        'E2' => 'Edge2',  // Edge 2 with dual motors
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

    // Device features and capabilities
    const DEVICE_FEATURES = [
        'Edge2' => ['vibrate', 'vibrate2', 'battery'],
        'Ferri' => ['vibrate', 'led', 'battery'],
        'Edge' => ['vibrate', 'battery'],
        'Domi' => ['vibrate', 'battery'],
        'Lush' => ['vibrate', 'battery'],
        'Hush' => ['vibrate', 'battery'],
        'Ambi' => ['vibrate', 'battery'],
        'Osci' => ['vibrate', 'battery'],
        'Max' => ['vibrate', 'air', 'battery'],
        'Nora' => ['vibrate', 'rotate', 'battery'],
        'Pulse' => ['vibrate', 'light', 'battery']
    ];
    
    private $deviceType;
    private $apiKey;
    private $apiEndpoint = 'https://api.lovense.com/api/lan/';
    private $features = [];
    
    public function __construct($deviceMac, $apiKey = null) {
        $this->deviceMac = $deviceMac;
        $this->apiKey = $apiKey;
        
        // Determine device type from MAC address
        // Edge 2 uses two characters for identification
        if ($deviceMac[0] === 'E' && $deviceMac[1] === '2') {
            $this->deviceType = 'Edge2';
        } else {
            $this->deviceType = self::DEVICE_TYPES[$deviceMac[0]] ?? 'Unknown';
        }

        // Set available features for this device
        $this->features = self::DEVICE_FEATURES[$this->deviceType] ?? ['vibrate', 'battery'];
    }
    
    public function vibrate($intensity) {
        $intensity = $this->mapIntensity($intensity);
        
        // Lovense protocol uses "Vibrate:X;" format where X is intensity 0-20
        $scaledIntensity = round($intensity / 5); // Convert 0-100 to 0-20
        $command = "Vibrate:{$scaledIntensity};";
        
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }
    
    /**
     * Control dual motors on Edge 2
     */
    public function vibrateDual($intensity1, $intensity2) {
        if (!in_array('vibrate2', $this->features)) {
            throw new \Exception("Dual motor control not supported on {$this->deviceType}");
        }

        $intensity1 = $this->mapIntensity($intensity1);
        $intensity2 = $this->mapIntensity($intensity2);

        $scaled1 = round($intensity1 / 5);
        $scaled2 = round($intensity2 / 5);

        $command = "Vibrate:{$scaled1};Vibrate2:{$scaled2};";
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }

    public function stop() {
        if (in_array('vibrate2', $this->features)) {
            return $this->vibrateDual(0, 0);
        }
        return $this->vibrate(0);
    }
    
    /**
     * Control LED features (primarily for Ferri)
     */
    public function setLED($params) {
        if (!in_array('led', $this->features)) {
            throw new \Exception("LED control not supported on {$this->deviceType}");
        }

        $command = '';

        if (isset($params['enabled'])) {
            $command .= "LED:" . ($params['enabled'] ? "1" : "0") . ";";
        }

        if (isset($params['color'])) {
            // Validate color format (RGB hex)
            if (!preg_match('/^[0-9A-F]{6}$/i', $params['color'])) {
                throw new \Exception('Invalid color format. Use RGB hex (e.g., FF0000)');
            }
            $command .= "Color:{$params['color']};";
        }

        if (isset($params['pattern'])) {
            switch ($params['pattern']) {
                case 'solid':
                    $command .= "LEDPattern:0;";
                    break;
                case 'pulse':
                    $command .= "LEDPattern:1;";
                    break;
                case 'wave':
                    $command .= "LEDPattern:2;";
                    break;
                default:
                    throw new \Exception('Invalid LED pattern');
            }
        }

        if (isset($params['brightness'])) {
            $brightness = min(max(intval($params['brightness']), 0), 100);
            $command .= "LEDBrightness:{$brightness};";
        }

        return $this->writeCharacteristic(self::LED_UUID, $command);
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
    /**
     * Set vibration pattern
     * Pattern format: Array of [intensity, duration] pairs
     * For Edge 2: Array of [intensity1, intensity2, duration] arrays
     */
    public function setPattern($pattern) {
        $command = "Pattern:";
        
        if (in_array('vibrate2', $this->features)) {
            // Edge 2 dual motor pattern
            foreach ($pattern as $step) {
                $intensity1 = $this->mapIntensity($step[0]);
                $intensity2 = $this->mapIntensity($step[1]);
                $duration = min(max(intval($step[2]), 100), 60000);
                
                $command .= "V{$intensity1}:V2{$intensity2}:T{$duration};";
            }
        } else {
            // Single motor pattern
            foreach ($pattern as $step) {
                $intensity = $this->mapIntensity($step[0]);
                $duration = min(max(intval($step[1]), 100), 60000);
                
                $command .= "V{$intensity}:T{$duration};";
            }
        }
        
        return $this->writeCharacteristic(self::TX_UUID, $command);
    }

    /**
     * Synchronize patterns across multiple devices
     */
    public function synchronizePatterns($patterns) {
        if (!$this->apiKey) {
            throw new \Exception("API key required for pattern synchronization");
        }

        // Validate and prepare patterns
        $preparedPatterns = [];
        foreach ($patterns as $deviceId => $pattern) {
            $device = $this->getDeviceInfo($deviceId);
            if (!$device) {
                throw new \Exception("Device not found: {$deviceId}");
            }

            $preparedPattern = [];
            foreach ($pattern as $step) {
                $preparedStep = [
                    'duration' => min(max(intval($step['duration']), 100), 60000)
                ];

                if (isset($step['intensity2'])) {
                    $preparedStep['intensity1'] = $this->mapIntensity($step['intensity1']);
                    $preparedStep['intensity2'] = $this->mapIntensity($step['intensity2']);
                } else {
                    $preparedStep['intensity'] = $this->mapIntensity($step['intensity']);
                }

                $preparedPattern[] = $preparedStep;
            }
            $preparedPatterns[$deviceId] = $preparedPattern;
        }

        // Send synchronized patterns via API
        return $this->sendApiCommand('syncPatterns', [
            'patterns' => $preparedPatterns,
            'startTime' => time() + 1 // Start in 1 second
        ]);
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

    /**
     * Get device features
     */
    public function getFeatures() {
        return $this->features;
    }

    /**
     * Get device type
     */
    public function getDeviceType() {
        return $this->deviceType;
    }

    /**
     * Map intensity value from 0-100 to device range
     */
    private function mapIntensity($intensity) {
        return min(max(intval($intensity), 0), 100);
    }
}
