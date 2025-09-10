<?php

namespace AeimsLib\Core;

use AeimsLib\Errors\DeviceError;
use AeimsLib\Errors\DeviceNotFoundError;
use AeimsLib\Errors\DuplicateDeviceError;
use AeimsLib\Errors\DeviceConnectionError;

/**
 * Core Device Manager for PHP
 */
class DeviceManager
{
    private static $instance;
    private $devices = [];
    private $connections = [];
    private $logger;
    private $config;

    private function __construct($config, $logger)
    {
        $this->config = $config;
        $this->logger = $logger;
    }

    public static function getInstance($config = null, $logger = null)
    {
        if (self::$instance === null) {
            if ($config === null || $logger === null) {
                throw new \Exception('DeviceManager must be initialized with config and logger');
            }
            self::$instance = new self($config, $logger);
        }
        return self::$instance;
    }

    /**
     * Register a device
     */
    public function registerDevice($deviceId, $deviceInfo)
    {
        if (isset($this->devices[$deviceId])) {
            throw new DuplicateDeviceError($deviceId);
        }

        $this->devices[$deviceId] = array_merge($deviceInfo, [
            'id' => $deviceId,
            'status' => 'disconnected',
            'lastSeen' => null,
            'capabilities' => $deviceInfo['capabilities'] ?? [],
            'metadata' => $deviceInfo['metadata'] ?? []
        ]);

        $this->logger->info("Device registered", ['deviceId' => $deviceId]);
        return $this->devices[$deviceId];
    }

    /**
     * Get device by ID
     */
    public function getDevice($deviceId)
    {
        if (!isset($this->devices[$deviceId])) {
            throw new DeviceNotFoundError($deviceId);
        }
        return $this->devices[$deviceId];
    }

    /**
     * Get all devices
     */
    public function getAllDevices()
    {
        return $this->devices;
    }

    /**
     * Connect to a device
     */
    public function connectDevice($deviceId, $connectionInfo = [])
    {
        $device = $this->getDevice($deviceId);
        
        try {
            // Simulate connection logic
            $this->connections[$deviceId] = [
                'connected' => true,
                'connectedAt' => new \DateTime(),
                'connectionInfo' => $connectionInfo
            ];

            $this->devices[$deviceId]['status'] = 'connected';
            $this->devices[$deviceId]['lastSeen'] = new \DateTime();

            $this->logger->info("Device connected", ['deviceId' => $deviceId]);
            return true;
        } catch (\Exception $e) {
            throw new DeviceConnectionError("Failed to connect to device: " . $e->getMessage(), $deviceId);
        }
    }

    /**
     * Disconnect a device
     */
    public function disconnectDevice($deviceId)
    {
        $device = $this->getDevice($deviceId);
        
        if (isset($this->connections[$deviceId])) {
            unset($this->connections[$deviceId]);
        }

        $this->devices[$deviceId]['status'] = 'disconnected';
        $this->logger->info("Device disconnected", ['deviceId' => $deviceId]);
        return true;
    }

    /**
     * Send command to device
     */
    public function sendCommand($deviceId, $command, $parameters = [])
    {
        $device = $this->getDevice($deviceId);
        
        if ($device['status'] !== 'connected') {
            throw new DeviceConnectionError("Device not connected", $deviceId);
        }

        try {
            // Simulate command execution
            $result = [
                'deviceId' => $deviceId,
                'command' => $command,
                'parameters' => $parameters,
                'timestamp' => new \DateTime(),
                'success' => true
            ];

            $this->devices[$deviceId]['lastSeen'] = new \DateTime();
            $this->logger->info("Command sent to device", $result);
            
            return $result;
        } catch (\Exception $e) {
            throw new DeviceError('COMMAND_FAILED', "Command failed: " . $e->getMessage(), $deviceId);
        }
    }

    /**
     * Get device status
     */
    public function getDeviceStatus($deviceId)
    {
        $device = $this->getDevice($deviceId);
        
        return [
            'deviceId' => $deviceId,
            'status' => $device['status'],
            'lastSeen' => $device['lastSeen'],
            'capabilities' => $device['capabilities'],
            'connected' => isset($this->connections[$deviceId])
        ];
    }

    /**
     * Update device metadata
     */
    public function updateDeviceMetadata($deviceId, $metadata)
    {
        $device = $this->getDevice($deviceId);
        $this->devices[$deviceId]['metadata'] = array_merge($device['metadata'], $metadata);
        
        $this->logger->info("Device metadata updated", [
            'deviceId' => $deviceId,
            'metadata' => $metadata
        ]);
        
        return $this->devices[$deviceId];
    }

    /**
     * Remove device
     */
    public function removeDevice($deviceId)
    {
        $device = $this->getDevice($deviceId);
        
        // Disconnect if connected
        if ($device['status'] === 'connected') {
            $this->disconnectDevice($deviceId);
        }

        unset($this->devices[$deviceId]);
        unset($this->connections[$deviceId]);
        
        $this->logger->info("Device removed", ['deviceId' => $deviceId]);
        return true;
    }

    /**
     * Get connected devices
     */
    public function getConnectedDevices()
    {
        return array_filter($this->devices, function($device) {
            return $device['status'] === 'connected';
        });
    }

    /**
     * Broadcast command to all connected devices
     */
    public function broadcastCommand($command, $parameters = [])
    {
        $results = [];
        $connectedDevices = $this->getConnectedDevices();

        foreach ($connectedDevices as $deviceId => $device) {
            try {
                $results[$deviceId] = $this->sendCommand($deviceId, $command, $parameters);
            } catch (\Exception $e) {
                $results[$deviceId] = [
                    'deviceId' => $deviceId,
                    'success' => false,
                    'error' => $e->getMessage()
                ];
            }
        }

        return $results;
    }

    /**
     * Get device statistics
     */
    public function getStatistics()
    {
        $total = count($this->devices);
        $connected = count($this->getConnectedDevices());
        $disconnected = $total - $connected;

        return [
            'total' => $total,
            'connected' => $connected,
            'disconnected' => $disconnected,
            'connectionRate' => $total > 0 ? ($connected / $total) * 100 : 0
        ];
    }
}
