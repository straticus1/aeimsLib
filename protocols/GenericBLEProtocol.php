<?php

namespace AdultToyLib\Protocols;

class GenericBLEProtocol extends BLEProtocol {
    // Standard BLE service UUIDs
    const GENERIC_ACCESS_UUID = '00001800-0000-1000-8000-00805f9b34fb';
    const DEVICE_INFO_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
    const BATTERY_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
    const MOTOR_UUID = '00001815-0000-1000-8000-00805f9b34fb'; // Standard HID service
    
    // Common characteristics
    const BATTERY_LEVEL_CHAR_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
    const DEVICE_NAME_CHAR_UUID = '00002a00-0000-1000-8000-00805f9b34fb';
    const MANUFACTURER_CHAR_UUID = '00002a29-0000-1000-8000-00805f9b34fb';
    const MODEL_CHAR_UUID = '00002a24-0000-1000-8000-00805f9b34fb';
    const FIRMWARE_CHAR_UUID = '00002a26-0000-1000-8000-00805f9b34fb';
    
    private $motorCharacteristics = [];
    private $deviceInfo = [];
    
    public function connect() {
        parent::connect();
        
        // Discover available characteristics
        $this->discoverCharacteristics();
        
        // Read device information
        $this->readDeviceInfo();
    }
    
    /**
     * Discover available characteristics and build control map
     */
    private function discoverCharacteristics() {
        // First, try to find motor control characteristics
        $chars = $this->scanCharacteristics(self::MOTOR_UUID);
        
        foreach ($chars as $char) {
            // Check properties to determine if it's writable
            if ($char['properties'] & 0x08) { // Write without response
                $this->motorCharacteristics[] = $char['uuid'];
            }
        }
        
        // If no motor characteristics found, look for any writable characteristics
        if (empty($this->motorCharacteristics)) {
            $allChars = $this->scanAllCharacteristics();
            foreach ($allChars as $char) {
                if ($char['properties'] & (0x04 | 0x08)) { // Write or write without response
                    $this->motorCharacteristics[] = $char['uuid'];
                }
            }
        }
    }
    
    /**
     * Read basic device information
     */
    private function readDeviceInfo() {
        try {
            $this->deviceInfo['name'] = $this->readCharacteristic(self::DEVICE_NAME_CHAR_UUID);
            $this->deviceInfo['manufacturer'] = $this->readCharacteristic(self::MANUFACTURER_CHAR_UUID);
            $this->deviceInfo['model'] = $this->readCharacteristic(self::MODEL_CHAR_UUID);
            $this->deviceInfo['firmware'] = $this->readCharacteristic(self::FIRMWARE_CHAR_UUID);
        } catch (\Exception $e) {
            // Some devices might not implement all characteristics
        }
    }
    
    public function vibrate($intensity) {
        $intensity = $this->mapIntensity($intensity);
        
        if (empty($this->motorCharacteristics)) {
            throw new \Exception("No motor control characteristics found");
        }
        
        // Try different common vibration command formats
        $success = false;
        
        foreach ($this->motorCharacteristics as $uuid) {
            try {
                // Try single byte intensity (0-255)
                $data = pack('C', round($intensity * 2.55));
                $this->writeCharacteristic($uuid, $data);
                $success = true;
                break;
            } catch (\Exception $e) {
                try {
                    // Try two byte format (intensity, duration)
                    $data = pack('CC', round($intensity * 2.55), 0xFF);
                    $this->writeCharacteristic($uuid, $data);
                    $success = true;
                    break;
                } catch (\Exception $e) {
                    try {
                        // Try three byte format (command, intensity, checksum)
                        $intensityByte = round($intensity * 2.55);
                        $checksum = (0x0F + $intensityByte) & 0xFF;
                        $data = pack('CCC', 0x0F, $intensityByte, $checksum);
                        $this->writeCharacteristic($uuid, $data);
                        $success = true;
                        break;
                    } catch (\Exception $e) {
                        // Try next characteristic
                        continue;
                    }
                }
            }
        }
        
        if (!$success) {
            throw new \Exception("Failed to send vibration command");
        }
        
        return true;
    }
    
    public function stop() {
        return $this->vibrate(0);
    }
    
    public function getBatteryLevel() {
        try {
            $data = $this->readCharacteristic(self::BATTERY_LEVEL_CHAR_UUID);
            return intval($data);
        } catch (\Exception $e) {
            return null; // Battery service not supported
        }
    }
    
    /**
     * Get discovered device information
     */
    public function getDeviceInfo() {
        return $this->deviceInfo;
    }
    
    /**
     * Set simple vibration pattern
     * @param array $pattern Array of [intensity, duration] pairs
     */
    public function setPattern($pattern) {
        foreach ($pattern as $step) {
            $intensity = $this->mapIntensity($step[0]);
            $duration = min(max(intval($step[1]), 100), 60000); // 100ms to 60s
            
            $this->vibrate($intensity);
            usleep($duration * 1000); // Convert to microseconds
        }
    }
    
    /**
     * Advanced motor control for devices that support it
     * @param array $params Motor control parameters
     */
    public function setMotorControl($params) {
        if (empty($this->motorCharacteristics)) {
            throw new \Exception("No motor control characteristics found");
        }
        
        // Try to identify the device's command format based on available characteristics
        foreach ($this->motorCharacteristics as $uuid) {
            try {
                if (isset($params['speed']) && isset($params['pattern'])) {
                    // Try complex pattern format
                    $speed = min(max(intval($params['speed']), 0), 100);
                    $pattern = min(max(intval($params['pattern']), 0), 15);
                    $data = pack('CCC', 0x0F, round($speed * 2.55), $pattern);
                    $this->writeCharacteristic($uuid, $data);
                    return true;
                } elseif (isset($params['speed']) && isset($params['duration'])) {
                    // Try timed vibration format
                    $speed = min(max(intval($params['speed']), 0), 100);
                    $duration = min(max(intval($params['duration']), 0), 255);
                    $data = pack('CC', round($speed * 2.55), $duration);
                    $this->writeCharacteristic($uuid, $data);
                    return true;
                }
            } catch (\Exception $e) {
                continue;
            }
        }
        
        throw new \Exception("Failed to set motor control parameters");
    }
    
    /**
     * Scan for all available characteristics
     */
    private function scanAllCharacteristics() {
        // This would use the BLE stack to discover all services and characteristics
        // Implementation depends on the specific BLE library being used
        $characteristics = [];
        
        // Example implementation using gatttool
        $cmd = "gatttool -b {$this->deviceMac} --primary";
        // Parse output and discover characteristics for each service
        
        return $characteristics;
    }
    
    /**
     * Scan for characteristics of a specific service
     */
    private function scanCharacteristics($serviceUuid) {
        // This would use the BLE stack to discover characteristics for a specific service
        $characteristics = [];
        
        // Example implementation using gatttool
        $cmd = "gatttool -b {$this->deviceMac} --characteristics --uuid={$serviceUuid}";
        // Parse output
        
        return $characteristics;
    }
}
