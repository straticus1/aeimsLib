<?php

require_once 'vendor/autoload.php';
require_once 'device_manager.php';
require_once 'config.php';

use React\EventLoop\Loop;
use React\Socket\SocketServer;
use React\Stream\WritableResourceStream;
use AeimsLib\DeviceManager;

class ReactWebSocketServer {
    private $loop;
    private $deviceManager;
    private $clients;

    public function __construct() {
        $this->loop = Loop::get();
        $this->deviceManager = new DeviceManager();
        $this->clients = [];

        echo "Starting aeimsLib Device Management Server...\n";
        echo "Supported devices: " . implode(', ', $this->deviceManager->getSupportedDevices()) . "\n";
    }

    public function start($port = 9090) {
        $socket = new SocketServer('0.0.0.0:' . $port, [], $this->loop);

        $socket->on('connection', function ($connection) {
            $clientId = uniqid();
            $this->clients[$clientId] = $connection;

            echo "New client connected: $clientId\n";

            // Send welcome message
            $this->sendMessage($connection, [
                'type' => 'welcome',
                'server' => 'aeimsLib Device Management Server',
                'version' => '1.0.0',
                'supported_devices' => $this->deviceManager->getSupportedDevices(),
                'client_id' => $clientId
            ]);

            $connection->on('data', function ($data) use ($clientId) {
                $this->handleMessage($clientId, $data);
            });

            $connection->on('close', function () use ($clientId) {
                unset($this->clients[$clientId]);
                echo "Client disconnected: $clientId\n";
            });
        });

        echo "aeimsLib WebSocket server listening on port $port\n";
        echo "WebSocket URL: ws://localhost:$port\n";

        $this->loop->run();
    }

    private function handleMessage($clientId, $data) {
        try {
            $message = json_decode($data, true);

            if (!$message) {
                $this->sendError($clientId, 'Invalid JSON');
                return;
            }

            $type = $message['type'] ?? 'unknown';

            switch ($type) {
                case 'scan_devices':
                    $this->handleScanDevices($clientId);
                    break;

                case 'connect_device':
                    $this->handleConnectDevice($clientId, $message);
                    break;

                case 'send_command':
                    $this->handleSendCommand($clientId, $message);
                    break;

                case 'disconnect_device':
                    $this->handleDisconnectDevice($clientId, $message);
                    break;

                case 'ping':
                    $this->sendMessage($this->clients[$clientId], ['type' => 'pong']);
                    break;

                default:
                    $this->sendError($clientId, "Unknown message type: $type");
            }

        } catch (Exception $e) {
            $this->sendError($clientId, $e->getMessage());
        }
    }

    private function handleScanDevices($clientId) {
        $devices = $this->deviceManager->scanDevices();
        $this->sendMessage($this->clients[$clientId], [
            'type' => 'scan_result',
            'devices' => $devices
        ]);
    }

    private function handleConnectDevice($clientId, $message) {
        $deviceId = $message['device_id'] ?? null;

        if (!$deviceId) {
            $this->sendError($clientId, 'Missing device_id');
            return;
        }

        $success = $this->deviceManager->connectDevice($deviceId);

        $this->sendMessage($this->clients[$clientId], [
            'type' => 'device_connection',
            'device_id' => $deviceId,
            'connected' => $success
        ]);
    }

    private function handleSendCommand($clientId, $message) {
        $deviceId = $message['device_id'] ?? null;
        $command = $message['command'] ?? null;
        $params = $message['params'] ?? [];

        if (!$deviceId || !$command) {
            $this->sendError($clientId, 'Missing device_id or command');
            return;
        }

        $result = $this->deviceManager->sendCommand($deviceId, $command, $params);

        $this->sendMessage($this->clients[$clientId], [
            'type' => 'command_result',
            'device_id' => $deviceId,
            'command' => $command,
            'result' => $result
        ]);
    }

    private function handleDisconnectDevice($clientId, $message) {
        $deviceId = $message['device_id'] ?? null;

        if (!$deviceId) {
            $this->sendError($clientId, 'Missing device_id');
            return;
        }

        $success = $this->deviceManager->disconnectDevice($deviceId);

        $this->sendMessage($this->clients[$clientId], [
            'type' => 'device_disconnection',
            'device_id' => $deviceId,
            'disconnected' => $success
        ]);
    }

    private function sendMessage($connection, $message) {
        $connection->write(json_encode($message) . "\n");
    }

    private function sendError($clientId, $error) {
        if (isset($this->clients[$clientId])) {
            $this->sendMessage($this->clients[$clientId], [
                'type' => 'error',
                'message' => $error
            ]);
        }
    }
}

// Start the server
$server = new ReactWebSocketServer();
$server->start(9090);