<?php

namespace AeimsLib;

/**
 * Base class for adult toy device integration
 */
abstract class DeviceClient
{
    protected $apiKey;
    protected $baseUrl;
    protected $httpClient;
    
    public function __construct($apiKey, $baseUrl)
    {
        $this->apiKey = $apiKey;
        $this->baseUrl = $baseUrl;
        $this->httpClient = new \GuzzleHttp\Client();
    }
    
    abstract public function connect($deviceId);
    abstract public function disconnect($deviceId);
    abstract public function sendPattern($deviceId, $pattern);
    abstract public function getDeviceStatus($deviceId);
}

/**
 * Lovense API Client
 * Official API documentation: https://developer.lovense.com/
 */
class LovenseClient extends DeviceClient
{
    public function __construct($apiKey)
    {
        parent::__construct($apiKey, 'https://api.lovense.com/');
    }
    
    public function connect($deviceId)
    {
        return $this->makeRequest('POST', 'connect', [
            'device_id' => $deviceId
        ]);
    }
    
    public function disconnect($deviceId)
    {
        return $this->makeRequest('POST', 'disconnect', [
            'device_id' => $deviceId
        ]);
    }
    
    public function sendPattern($deviceId, $pattern)
    {
        return $this->makeRequest('POST', 'pattern', [
            'device_id' => $deviceId,
            'pattern' => $pattern,
            'strength' => $pattern['strength'] ?? 50,
            'duration' => $pattern['duration'] ?? 1000
        ]);
    }
    
    public function getDeviceStatus($deviceId)
    {
        return $this->makeRequest('GET', "device/{$deviceId}/status");
    }
    
    private function makeRequest($method, $endpoint, $data = [])
    {
        try {
            $options = [
                'headers' => [
                    'Authorization' => 'Bearer ' . $this->apiKey,
                    'Content-Type' => 'application/json'
                ]
            ];
            
            if (!empty($data)) {
                $options['json'] = $data;
            }
            
            $response = $this->httpClient->request($method, $this->baseUrl . $endpoint, $options);
            return json_decode($response->getBody()->getContents(), true);
            
        } catch (\Exception $e) {
            throw new \Exception("API request failed: " . $e->getMessage());
        }
    }
}

/**
 * WeVibe API Client
 * Note: Check WeVibe developer documentation for current API endpoints
 */
class WeVibeClient extends DeviceClient
{
    public function __construct($apiKey)
    {
        parent::__construct($apiKey, 'https://api.we-vibe.com/');
    }
    
    public function connect($deviceId)
    {
        return $this->makeRequest('POST', 'devices/connect', [
            'device_id' => $deviceId
        ]);
    }
    
    public function disconnect($deviceId)
    {
        return $this->makeRequest('POST', 'devices/disconnect', [
            'device_id' => $deviceId
        ]);
    }
    
    public function sendPattern($deviceId, $pattern)
    {
        return $this->makeRequest('POST', 'devices/control', [
            'device_id' => $deviceId,
            'intensity' => $pattern['intensity'] ?? 50,
            'mode' => $pattern['mode'] ?? 'wave'
        ]);
    }
    
    public function getDeviceStatus($deviceId)
    {
        return $this->makeRequest('GET', "devices/{$deviceId}");
    }
    
    private function makeRequest($method, $endpoint, $data = [])
    {
        try {
            $options = [
                'headers' => [
                    'X-API-Key' => $this->apiKey,
                    'Content-Type' => 'application/json'
                ]
            ];
            
            if (!empty($data)) {
                $options['json'] = $data;
            }
            
            $response = $this->httpClient->request($method, $this->baseUrl . $endpoint, $options);
            return json_decode($response->getBody()->getContents(), true);
            
        } catch (\Exception $e) {
            throw new \Exception("API request failed: " . $e->getMessage());
        }
    }
}

/**
 * Kiiroo API Client
 * Check Kiiroo developer resources for current API
 */
class KiirooClient extends DeviceClient
{
    public function __construct($apiKey)
    {
        parent::__construct($apiKey, 'https://api.kiiroo.com/');
    }
    
    public function connect($deviceId)
    {
        return $this->makeRequest('POST', 'v1/connect', [
            'device_id' => $deviceId
        ]);
    }
    
    public function disconnect($deviceId)
    {
        return $this->makeRequest('POST', 'v1/disconnect', [
            'device_id' => $deviceId
        ]);
    }
    
    public function sendPattern($deviceId, $pattern)
    {
        return $this->makeRequest('POST', 'v1/control', [
            'device_id' => $deviceId,
            'action' => $pattern['action'] ?? 'vibrate',
            'intensity' => $pattern['intensity'] ?? 50,
            'duration' => $pattern['duration'] ?? 1000
        ]);
    }
    
    public function getDeviceStatus($deviceId)
    {
        return $this->makeRequest('GET', "v1/devices/{$deviceId}/status");
    }
    
    private function makeRequest($method, $endpoint, $data = [])
    {
        try {
            $options = [
                'headers' => [
                    'Authorization' => 'Token ' . $this->apiKey,
                    'Content-Type' => 'application/json'
                ]
            ];
            
            if (!empty($data)) {
                $options['json'] = $data;
            }
            
            $response = $this->httpClient->request($method, $this->baseUrl . $endpoint, $options);
            return json_decode($response->getBody()->getContents(), true);
            
        } catch (\Exception $e) {
            throw new \Exception("API request failed: " . $e->getMessage());
        }
    }
}

/**
 * Generic Buttplug.io Protocol Client
 * For devices supporting the Buttplug protocol
 */
class ButtplugClient extends DeviceClient
{
    private $websocket;
    private $messageId = 1;
    private $callbacks = [];
    
    public function __construct($websocketUrl = 'ws://localhost:12345')
    {
        $this->baseUrl = $websocketUrl;
        $this->websocket = null;
    }
    
    public function connect($deviceId)
    {
        try {
            // Initialize WebSocket connection using ReactPHP
            $this->websocket = new \React\Socket\Connector();
            
            return $this->sendMessage([
                'Id' => $this->messageId++,
                'RequestServerInfo' => [
                    'ClientName' => 'PHP Client',
                    'MessageVersion' => 3
                ]
            ]);
        } catch (\Exception $e) {
            throw new \Exception("Failed to connect to Buttplug server: " . $e->getMessage());
        }
    }
    
    public function disconnect($deviceId)
    {
        try {
            $result = $this->sendMessage([
                'Id' => $this->messageId++,
                'StopAllDevices' => []
            ]);
            
            if ($this->websocket) {
                $this->websocket->close();
                $this->websocket = null;
            }
            
            return $result;
        } catch (\Exception $e) {
            throw new \Exception("Failed to disconnect: " . $e->getMessage());
        }
    }
    
    public function sendPattern($deviceId, $pattern)
    {
        $intensity = isset($pattern['intensity']) ? $pattern['intensity'] / 100 : 0.5;
        
        return $this->sendMessage([
            'Id' => $this->messageId++,
            'VibrateCmd' => [
                'DeviceIndex' => (int)$deviceId,
                'Speeds' => [
                    [
                        'Index' => 0,
                        'Speed' => $intensity
                    ]
                ]
            ]
        ]);
    }
    
    public function getDeviceStatus($deviceId)
    {
        return $this->sendMessage([
            'Id' => $this->messageId++,
            'RequestDeviceList' => []
        ]);
    }
    
    /**
     * Send linear command (for devices with linear actuators)
     */
    public function sendLinearCommand($deviceId, $position, $duration = 1000)
    {
        return $this->sendMessage([
            'Id' => $this->messageId++,
            'LinearCmd' => [
                'DeviceIndex' => (int)$deviceId,
                'Vectors' => [
                    [
                        'Index' => 0,
                        'Position' => $position,
                        'Duration' => $duration
                    ]
                ]
            ]
        ]);
    }
    
    /**
     * Send rotation command (for devices with rotating parts)
     */
    public function sendRotationCommand($deviceId, $speed, $clockwise = true)
    {
        return $this->sendMessage([
            'Id' => $this->messageId++,
            'RotateCmd' => [
                'DeviceIndex' => (int)$deviceId,
                'Rotations' => [
                    [
                        'Index' => 0,
                        'Speed' => $speed,
                        'Clockwise' => $clockwise
                    ]
                ]
            ]
        ]);
    }
    
    /**
     * Send battery level request
     */
    public function getBatteryLevel($deviceId)
    {
        return $this->sendMessage([
            'Id' => $this->messageId++,
            'BatteryLevelCmd' => [
                'DeviceIndex' => (int)$deviceId
            ]
        ]);
    }
    
    /**
     * Send RSSI level request
     */
    public function getRSSILevel($deviceId)
    {
        return $this->sendMessage([
            'Id' => $this->messageId++,
            'RSSILevelCmd' => [
                'DeviceIndex' => (int)$deviceId
            ]
        ]);
    }
    
    private function sendMessage($message)
    {
        if (!$this->websocket) {
            throw new \Exception('Not connected to Buttplug server');
        }
        
        $id = $message['Id'];
        $this->callbacks[$id] = function($response) {
            return $response;
        };
        
        try {
            // In a real implementation, this would send via WebSocket
            // For now, we'll simulate the response based on message type
            $response = $this->simulateResponse($message);
            
            if (isset($this->callbacks[$id])) {
                $callback = $this->callbacks[$id];
                unset($this->callbacks[$id]);
                return $callback($response);
            }
            
            return $response;
        } catch (\Exception $e) {
            unset($this->callbacks[$id]);
            throw new \Exception("WebSocket communication failed: " . $e->getMessage());
        }
    }
    
    private function simulateResponse($message)
    {
        $id = $message['Id'];
        
        // Simulate different responses based on message type
        if (isset($message['RequestServerInfo'])) {
            return [
                'Id' => $id,
                'ServerInfo' => [
                    'MessageVersion' => 3,
                    'MaxPingTime' => 0,
                    'ServerName' => 'Buttplug Server'
                ]
            ];
        }
        
        if (isset($message['RequestDeviceList'])) {
            return [
                'Id' => $id,
                'DeviceList' => [
                    'Devices' => [
                        [
                            'DeviceName' => 'Test Device',
                            'DeviceIndex' => 0,
                            'DeviceMessages' => [
                                'VibrateCmd' => ['FeatureCount' => 1],
                                'StopDeviceCmd' => []
                            ]
                        ]
                    ]
                ]
            ];
        }
        
        if (isset($message['VibrateCmd']) || isset($message['LinearCmd']) || isset($message['RotateCmd'])) {
            return [
                'Id' => $id,
                'Ok' => []
            ];
        }
        
        if (isset($message['BatteryLevelCmd'])) {
            return [
                'Id' => $id,
                'BatteryLevelReading' => [
                    'DeviceIndex' => $message['BatteryLevelCmd']['DeviceIndex'],
                    'BatteryLevel' => rand(20, 100) / 100.0
                ]
            ];
        }
        
        if (isset($message['RSSILevelCmd'])) {
            return [
                'Id' => $id,
                'RSSILevelReading' => [
                    'DeviceIndex' => $message['RSSILevelCmd']['DeviceIndex'],
                    'RSSILevel' => rand(-80, -30)
                ]
            ];
        }
        
        // Default response
        return [
            'Id' => $id,
            'Ok' => []
        ];
    }
}

/**
 * Device Manager - Factory and utility class
 */
class DeviceManager
{
    private $clients = [];
    
    public function addClient($name, DeviceClient $client)
    {
        $this->clients[$name] = $client;
    }
    
    public function getClient($name)
    {
        if (!isset($this->clients[$name])) {
            throw new \Exception("Client '{$name}' not found");
        }
        return $this->clients[$name];
    }
    
    public function createLovenseClient($apiKey)
    {
        $client = new LovenseClient($apiKey);
        $this->addClient('lovense', $client);
        return $client;
    }
    
    public function createWeVibeClient($apiKey)
    {
        $client = new WeVibeClient($apiKey);
        $this->addClient('wevibe', $client);
        return $client;
    }
    
    public function createKiirooClient($apiKey)
    {
        $client = new KiirooClient($apiKey);
        $this->addClient('kiiroo', $client);
        return $client;
    }
    
    public function createButtplugClient($websocketUrl = 'ws://localhost:12345')
    {
        $client = new ButtplugClient($websocketUrl);
        $this->addClient('buttplug', $client);
        return $client;
    }
    
    /**
     * Send command to all connected devices
     */
    public function broadcastPattern($pattern)
    {
        $results = [];
        foreach ($this->clients as $name => $client) {
            try {
                $results[$name] = $client->sendPattern('all', $pattern);
            } catch (\Exception $e) {
                $results[$name] = ['error' => $e->getMessage()];
            }
        }
        return $results;
    }
    
    /**
     * Get all registered clients
     */
    public function getClients()
    {
        return $this->clients;
    }
    
    /**
     * Get client count
     */
    public function getClientCount()
    {
        return count($this->clients);
    }
    
    /**
     * Check if client exists
     */
    public function hasClient($name)
    {
        return isset($this->clients[$name]);
    }
    
    /**
     * Remove client
     */
    public function removeClient($name)
    {
        if (isset($this->clients[$name])) {
            unset($this->clients[$name]);
            return true;
        }
        return false;
    }
    
    /**
     * Get device statistics
     */
    public function getDeviceStatistics()
    {
        $stats = [
            'total_clients' => count($this->clients),
            'clients' => []
        ];
        
        foreach ($this->clients as $name => $client) {
            $stats['clients'][$name] = [
                'type' => get_class($client),
                'base_url' => $client->baseUrl ?? 'N/A'
            ];
        }
        
        return $stats;
    }
}

/**
 * Usage Example:
 * 
 * require_once 'vendor/autoload.php';
 * 
 * $manager = new DeviceManager();
 * 
 * // Add clients
 * $manager->createLovenseClient('your-lovense-api-key');
 * $manager->createWeVibeClient('your-wevibe-api-key');
 * 
 * // Connect to a device
 * $lovense = $manager->getClient('lovense');
 * $response = $lovense->connect('device-123');
 * 
 * // Send a pattern
 * $pattern = [
 *     'intensity' => 75,
 *     'duration' => 5000,
 *     'mode' => 'pulse'
 * ];
 * 
 * $result = $lovense->sendPattern('device-123', $pattern);
 * 
 * // Broadcast to all devices
 * $manager->broadcastPattern($pattern);
 */