<?php

require_once 'vendor/autoload.php';
require_once 'device_manager.php';
require_once 'config.php';

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use Ratchet\WebSocket\WsServer;
use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use AeimsLib\ButtplugClient;

class WebSocketServer implements MessageComponentInterface {
    private $clients;
    private $buttplugClient;
    private $deviceConnections;
    
    public function __construct() {
        $this->clients = new \SplObjectStorage;
        $this->buttplugClient = new ButtplugClient();
        $this->deviceConnections = [];
    }
    
    public function onOpen(ConnectionInterface $conn) {
        $this->clients->attach($conn);
        echo "New connection! ({$conn->resourceId})\n";
        
        // Send initial server info message
        $this->sendMessage($conn, [
            'Id' => 1,
            'ServerInfo' => [
                'MessageVersion' => 3,
                'MaxPingTime' => 0,
'ServerName' => 'AeimsLib WebSocket Server'
            ]
        ]);
    }
    
    public function onMessage(ConnectionInterface $from, $msg) {
        $data = json_decode($msg, true);
        
        if (!isset($data['Id'])) {
            $this->sendError($from, 'Invalid message format');
            return;
        }
        
        try {
            $response = $this->handleMessage($data);
            if ($response) {
                $response['Id'] = $data['Id'];
                $this->sendMessage($from, $response);
            }
        } catch (\Exception $e) {
            $this->sendError($from, $e->getMessage(), $data['Id']);
        }
    }
    
    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);
        
        // Disconnect any devices associated with this connection
        if (isset($this->deviceConnections[$conn->resourceId])) {
            foreach ($this->deviceConnections[$conn->resourceId] as $deviceId) {
                $this->buttplugClient->disconnect($deviceId);
            }
            unset($this->deviceConnections[$conn->resourceId]);
        }
        
        echo "Connection {$conn->resourceId} has disconnected\n";
    }
    
    public function onError(ConnectionInterface $conn, \Exception $e) {
        echo "An error has occurred: {$e->getMessage()}\n";
        $conn->close();
    }
    
    private function handleMessage($data) {
        // Handle different message types
        if (isset($data['RequestServerInfo'])) {
            return [
                'ServerInfo' => [
                    'MessageVersion' => 3,
                    'MaxPingTime' => 0,
                    'ServerName' => 'AdultToyLib WebSocket Server'
                ]
            ];
        }
        
        if (isset($data['StartScanning'])) {
            // Simulate device scanning
            return [
                'ScanningFinished' => []
            ];
        }
        
        if (isset($data['RequestDeviceList'])) {
            return [
                'DeviceList' => [
                    'Devices' => $this->getConnectedDevices()
                ]
            ];
        }
        
        if (isset($data['VibrateCmd'])) {
            $cmd = $data['VibrateCmd'];
            $deviceIndex = $cmd['DeviceIndex'];
            $speeds = $cmd['Speeds'];
            
            if (isset($this->deviceConnections[$deviceIndex])) {
                foreach ($speeds as $speed) {
                    $this->buttplugClient->sendPattern($this->deviceConnections[$deviceIndex], [
                        'intensity' => $speed['Speed'] * 100
                    ]);
                }
            }
            
            return ['Ok' => []];
        }
        
        if (isset($data['StopDeviceCmd'])) {
            $deviceIndex = $data['StopDeviceCmd']['DeviceIndex'];
            
            if (isset($this->deviceConnections[$deviceIndex])) {
                $this->buttplugClient->sendPattern($this->deviceConnections[$deviceIndex], [
                    'intensity' => 0
                ]);
            }
            
            return ['Ok' => []];
        }
        
        if (isset($data['StopAllDevices'])) {
            foreach ($this->deviceConnections as $devices) {
                foreach ($devices as $deviceId) {
                    $this->buttplugClient->sendPattern($deviceId, [
                        'intensity' => 0
                    ]);
                }
            }
            
            return ['Ok' => []];
        }
        
        throw new \Exception('Unknown message type');
    }
    
    private function getConnectedDevices() {
        $devices = [];
        foreach ($this->deviceConnections as $connId => $deviceIds) {
            foreach ($deviceIds as $index => $deviceId) {
                $devices[] = [
                    'DeviceName' => "Device {$deviceId}",
                    'DeviceIndex' => $index,
                    'DeviceMessages' => [
                        'VibrateCmd' => ['FeatureCount' => 1],
                        'StopDeviceCmd' => []
                    ]
                ];
            }
        }
        return $devices;
    }
    
    private function sendMessage(ConnectionInterface $conn, $data) {
        $conn->send(json_encode($data));
    }
    
    private function sendError(ConnectionInterface $conn, $message, $id = null) {
        $error = [
            'Error' => [
                'ErrorMessage' => $message,
                'ErrorCode' => 500
            ]
        ];
        
        if ($id !== null) {
            $error['Id'] = $id;
        }
        
        $conn->send(json_encode($error));
    }
}

// Update ButtplugClient to use WebSocket communication
class WebSocketButtplugClient extends ButtplugClient {
    private $conn;
    private $messageId = 1;
    private $callbacks = [];
    
    public function __construct($websocketUrl) {
        parent::__construct($websocketUrl);
        // Don't auto-connect in constructor - let caller decide when to connect
    }
    
    public function connect($deviceId = null) {
        $this->conn = new \WebSocket\Client($this->baseUrl);
        
        // Request server info
        $this->sendMessage([
            'Id' => $this->messageId++,
            'RequestServerInfo' => [
                'ClientName' => 'PHP Client',
                'MessageVersion' => 3
            ]
        ]);
        
        // If specific device ID provided, store it
        if ($deviceId !== null) {
            $this->currentDeviceId = $deviceId;
        }
    }
    
    public function disconnect($deviceId) {
        if ($this->conn) {
            $this->sendMessage([
                'Id' => $this->messageId++,
                'StopDeviceCmd' => [
                    'DeviceIndex' => (int)$deviceId
                ]
            ]);
            $this->conn->close();
        }
    }
    
    public function sendPattern($deviceId, $pattern) {
        $intensity = isset($pattern['intensity']) ? $pattern['intensity'] / 100 : 0;
        
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
    
    public function getDeviceStatus($deviceId) {
        $response = $this->sendMessage([
            'Id' => $this->messageId++,
            'RequestDeviceList' => []
        ]);
        
        if (isset($response['DeviceList']['Devices'])) {
            foreach ($response['DeviceList']['Devices'] as $device) {
                if ($device['DeviceIndex'] === (int)$deviceId) {
                    return [
                        'connected' => true,
                        'status' => 'ready'
                    ];
                }
            }
        }
        
        return [
            'connected' => false,
            'status' => 'disconnected'
        ];
    }
    
    private function sendMessage($message) {
        if (!$this->conn) {
            throw new \Exception('Not connected to WebSocket server');
        }
        
        $id = $message['Id'];
        $this->callbacks[$id] = function($response) {
            return $response;
        };
        
        $this->conn->send(json_encode($message));
        
        // Wait for response
        $response = json_decode($this->conn->receive(), true);
        
        if (isset($response['Error'])) {
            throw new \Exception($response['Error']['ErrorMessage']);
        }
        
        if (isset($this->callbacks[$id])) {
            $callback = $this->callbacks[$id];
            unset($this->callbacks[$id]);
            return $callback($response);
        }
        
        return $response;
    }
}

// Start the WebSocket server if this file is run directly
if (php_sapi_name() === 'cli') {
    $server = IoServer::factory(
        new HttpServer(
            new WsServer(
                new WebSocketServer()
            )
        ),
        12345
    );
    
    echo "WebSocket server starting on port 12345...\n";
    $server->run();
}
