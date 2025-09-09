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
    public function __construct($websocketUrl = 'ws://localhost:12345')
    {
        $this->baseUrl = $websocketUrl;
        // Note: You'll need a WebSocket client library like ReactPHP/Socket
    }
    
    public function connect($deviceId)
    {
        return $this->sendMessage([
            'Id' => 1,
            'RequestServerInfo' => [
                'ClientName' => 'PHP Client'
            ]
        ]);
    }
    
    public function disconnect($deviceId)
    {
        return $this->sendMessage([
            'Id' => 2,
            'StopAllDevices' => []
        ]);
    }
    
    public function sendPattern($deviceId, $pattern)
    {
        return $this->sendMessage([
            'Id' => 3,
            'VibrateCmd' => [
                'DeviceIndex' => (int)$deviceId,
                'Speeds' => [
                    [
                        'Index' => 0,
                        'Speed' => ($pattern['intensity'] ?? 50) / 100
                    ]
                ]
            ]
        ]);
    }
    
    public function getDeviceStatus($deviceId)
    {
        return $this->sendMessage([
            'Id' => 4,
            'RequestDeviceList' => []
        ]);
    }
    
    private function sendMessage($message)
    {
        // Implementation would depend on WebSocket library
        // This is a placeholder for the WebSocket communication
        return json_encode($message);
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