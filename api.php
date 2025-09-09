<?php

require_once 'device_manager.php';

use AeimsLib\DeviceManager;

// Initialize application
$bootstrap = require_once 'bootstrap.php';

class API {
    private $db;
    private $deviceManager;
    private $config;
    
    public function __construct($config, $db) {
        $this->config = $config;
        $this->db = $db;
        
        // Initialize device manager
        $this->deviceManager = new DeviceManager();
        
        // Initialize clients based on configuration
        if (!empty($config['lovense_api_key'])) {
            $this->deviceManager->createLovenseClient($config['lovense_api_key']);
        }
        if (!empty($config['wevibe_api_key'])) {
            $this->deviceManager->createWeVibeClient($config['wevibe_api_key']);
        }
        if (!empty($config['kiiroo_api_key'])) {
            $this->deviceManager->createKiirooClient($config['kiiroo_api_key']);
        }
        if (!empty($config['buttplug_websocket'])) {
            $this->deviceManager->createButtplugClient($config['buttplug_websocket']);
        }
    }
    
    public function handleRequest() {
        header('Content-Type: application/json');
        
        // Parse request path
        $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $path = trim($path, '/');
        $pathParts = explode('/', $path);
        
        // Remove 'api' from path parts if present
        if ($pathParts[0] === 'api') {
            array_shift($pathParts);
        }
        
        // Handle CORS
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(200);
            exit();
        }
        
        try {
            // Route the request
            switch ($pathParts[0] ?? '') {
                case 'toys':
                    $this->handleToys($pathParts);
                    break;
                    
                case 'patterns':
                    $this->handlePatterns($pathParts);
                    break;
                    
                case 'control':
                    $this->handleControl($pathParts);
                    break;
                    
                default:
                    $this->sendError('Invalid endpoint', 404);
            }
        } catch (Exception $e) {
            $this->sendError($e->getMessage());
        }
    }
    
    private function handleToys($pathParts) {
        switch ($_SERVER['REQUEST_METHOD']) {
            case 'GET':
                if (count($pathParts) === 1) {
                    // GET /api/toys - List all toys
                    $toys = $this->db->query("SELECT * FROM toys");
                    $this->sendResponse($toys);
                } elseif (count($pathParts) === 3 && $pathParts[2] === 'status') {
                    // GET /api/toys/{id}/status - Get toy status
                    $toyId = $pathParts[1];
                    $toy = $this->db->queryOne("SELECT * FROM toys WHERE id = ?", [$toyId]);
                    if (!$toy) {
                        $this->sendError('Toy not found', 404);
                    }
                    
                    $client = $this->deviceManager->getClient($toy['manufacturer']);
                    $status = $client->getDeviceStatus($toy['device_id']);
                    $this->sendResponse($status);
                } elseif (count($pathParts) === 4 && $pathParts[2] === 'test') {
                    // GET /api/toys/{id}/test/{type} - Run toy test
                    $toyId = $pathParts[1];
                    $testType = $pathParts[3];
                    
                    $toy = $this->db->queryOne("SELECT * FROM toys WHERE id = ?", [$toyId]);
                    if (!$toy) {
                        $this->sendError('Toy not found', 404);
                    }
                    
                    $results = $this->runTest($toy, $testType);
                    $this->sendResponse($results);
                } else {
                    $this->sendError('Invalid endpoint', 404);
                }
                break;
                
            case 'POST':
                if (count($pathParts) === 1) {
                    // POST /api/toys - Add new toy
                    $data = $this->getRequestData();
                    $required = ['name', 'manufacturer', 'device_id'];
                    foreach ($required as $field) {
                        if (!isset($data[$field])) {
                            $this->sendError("Missing required field: {$field}", 400);
                        }
                    }
                    
                    // Insert toy into database
                    $id = $this->db->insert('toys', $data);
                    $toy = $this->db->queryOne("SELECT * FROM toys WHERE id = ?", [$id]);
                    $this->sendResponse($toy, 201);
                } else {
                    $this->sendError('Invalid endpoint', 404);
                }
                break;
                
            case 'DELETE':
                if (count($pathParts) === 2) {
                    // DELETE /api/toys/{id} - Delete toy
                    $toyId = $pathParts[1];
                    $toy = $this->db->queryOne("SELECT * FROM toys WHERE id = ?", [$toyId]);
                    if (!$toy) {
                        $this->sendError('Toy not found', 404);
                    }
                    
                    $this->db->query("DELETE FROM toys WHERE id = ?", [$toyId]);
                    $this->sendResponse(['message' => 'Toy deleted successfully']);
                } else {
                    $this->sendError('Invalid endpoint', 404);
                }
                break;
                
            default:
                $this->sendError('Method not allowed', 405);
        }
    }
    
    private function handlePatterns($pathParts) {
        switch ($_SERVER['REQUEST_METHOD']) {
            case 'GET':
                if (count($pathParts) === 1) {
                    // GET /api/patterns - List all patterns
                    $patterns = $this->db->query("SELECT * FROM patterns");
                    $this->sendResponse($patterns);
                } else {
                    $this->sendError('Invalid endpoint', 404);
                }
                break;
                
            case 'POST':
                if (count($pathParts) === 1) {
                    // POST /api/patterns - Create new pattern
                    $data = $this->getRequestData();
                    $required = ['name', 'type', 'settings'];
                    foreach ($required as $field) {
                        if (!isset($data[$field])) {
                            $this->sendError("Missing required field: {$field}", 400);
                        }
                    }
                    
                    // Insert pattern into database
                    $id = $this->db->insert('patterns', $data);
                    $pattern = $this->db->queryOne("SELECT * FROM patterns WHERE id = ?", [$id]);
                    $this->sendResponse($pattern, 201);
                } elseif (count($pathParts) === 4 && $pathParts[2] === 'use') {
                    // POST /api/patterns/{id}/use/{toyId} - Use pattern on toy
                    $patternId = $pathParts[1];
                    $toyId = $pathParts[3];
                    
                    $pattern = $this->db->queryOne("SELECT * FROM patterns WHERE id = ?", [$patternId]);
                    if (!$pattern) {
                        $this->sendError('Pattern not found', 404);
                    }
                    
                    $toy = $this->db->queryOne("SELECT * FROM toys WHERE id = ?", [$toyId]);
                    if (!$toy) {
                        $this->sendError('Toy not found', 404);
                    }
                    
                    $client = $this->deviceManager->getClient($toy['manufacturer']);
                    $result = $client->sendPattern($toy['device_id'], $pattern);
                    $this->sendResponse($result);
                } else {
                    $this->sendError('Invalid endpoint', 404);
                }
                break;
                
            case 'DELETE':
                if (count($pathParts) === 2) {
                    // DELETE /api/patterns/{id} - Delete pattern
                    $patternId = $pathParts[1];
                    $pattern = $this->db->queryOne("SELECT * FROM patterns WHERE id = ?", [$patternId]);
                    if (!$pattern) {
                        $this->sendError('Pattern not found', 404);
                    }
                    
                    $this->db->query("DELETE FROM patterns WHERE id = ?", [$patternId]);
                    $this->sendResponse(['message' => 'Pattern deleted successfully']);
                } else {
                    $this->sendError('Invalid endpoint', 404);
                }
                break;
                
            default:
                $this->sendError('Method not allowed', 405);
        }
    }
    
    private function handleControl($pathParts) {
        switch ($_SERVER['REQUEST_METHOD']) {
            case 'POST':
                if (count($pathParts) === 2) {
                    // POST /api/control/{toyId} - Send control command
                    $toyId = $pathParts[1];
                    $data = $this->getRequestData();
                    
                    $toy = $this->db->queryOne("SELECT * FROM toys WHERE id = ?", [$toyId]);
                    if (!$toy) {
                        $this->sendError('Toy not found', 404);
                    }
                    
                    $client = $this->deviceManager->getClient($toy['manufacturer']);
                    $result = $client->sendPattern($toy['device_id'], $data);
                    $this->sendResponse($result);
                } elseif (count($pathParts) === 3 && $pathParts[2] === 'stop') {
                    // POST /api/control/{toyId}/stop - Stop toy
                    $toyId = $pathParts[1];
                    
                    $toy = $this->db->queryOne("SELECT * FROM toys WHERE id = ?", [$toyId]);
                    if (!$toy) {
                        $this->sendError('Toy not found', 404);
                    }
                    
                    $client = $this->deviceManager->getClient($toy['manufacturer']);
                    $result = $client->sendPattern($toy['device_id'], ['intensity' => 0]);
                    $this->sendResponse($result);
                } else {
                    $this->sendError('Invalid endpoint', 404);
                }
                break;
                
            default:
                $this->sendError('Method not allowed', 405);
        }
    }
    
    private function runTest($toy, $testType) {
        $steps = [];
        $client = $this->deviceManager->getClient($toy['manufacturer']);
        
        switch ($testType) {
            case 'connection':
                try {
                    // Test connection
                    $client->connect($toy['device_id']);
                    $steps[] = [
                        'status' => 'passed',
                        'message' => 'Successfully connected to toy'
                    ];
                    
                    // Test basic commands
                    $client->sendPattern($toy['device_id'], ['intensity' => 10]);
                    $steps[] = [
                        'status' => 'passed',
                        'message' => 'Successfully sent test command'
                    ];
                    
                    // Stop toy and disconnect
                    $client->sendPattern($toy['device_id'], ['intensity' => 0]);
                    $client->disconnect($toy['device_id']);
                    $steps[] = [
                        'status' => 'passed',
                        'message' => 'Successfully stopped and disconnected'
                    ];
                } catch (Exception $e) {
                    $steps[] = [
                        'status' => 'failed',
                        'message' => $e->getMessage()
                    ];
                }
                break;
                
            case 'functionality':
                try {
                    // Connect
                    $client->connect($toy['device_id']);
                    $steps[] = [
                        'status' => 'passed',
                        'message' => 'Connected successfully'
                    ];
                    
                    // Test various intensities
                    $intensities = [20, 50, 80];
                    foreach ($intensities as $intensity) {
                        $client->sendPattern($toy['device_id'], ['intensity' => $intensity]);
                        $steps[] = [
                            'status' => 'passed',
                            'message' => "Tested intensity level: {$intensity}%"
                        ];
                        sleep(1);
                    }
                    
                    // Test different patterns
                    $patterns = ['wave', 'pulse', 'escalation'];
                    foreach ($patterns as $pattern) {
                        $client->sendPattern($toy['device_id'], ['mode' => $pattern]);
                        $steps[] = [
                            'status' => 'passed',
                            'message' => "Tested pattern: {$pattern}"
                        ];
                        sleep(2);
                    }
                    
                    // Stop and disconnect
                    $client->sendPattern($toy['device_id'], ['intensity' => 0]);
                    $client->disconnect($toy['device_id']);
                    $steps[] = [
                        'status' => 'passed',
                        'message' => 'Completed functionality test'
                    ];
                } catch (Exception $e) {
                    $steps[] = [
                        'status' => 'failed',
                        'message' => $e->getMessage()
                    ];
                }
                break;
                
            case 'stress':
                try {
                    // Connect
                    $client->connect($toy['device_id']);
                    $steps[] = [
                        'status' => 'passed',
                        'message' => 'Connected successfully'
                    ];
                    
                    // Rapid intensity changes
                    for ($i = 0; $i < 10; $i++) {
                        $intensity = rand(0, 100);
                        $client->sendPattern($toy['device_id'], ['intensity' => $intensity]);
                        $steps[] = [
                            'status' => 'passed',
                            'message' => "Stress test iteration {$i + 1}/10"
                        ];
                        usleep(500000); // 500ms delay
                    }
                    
                    // Stop and disconnect
                    $client->sendPattern($toy['device_id'], ['intensity' => 0]);
                    $client->disconnect($toy['device_id']);
                    $steps[] = [
                        'status' => 'passed',
                        'message' => 'Completed stress test'
                    ];
                } catch (Exception $e) {
                    $steps[] = [
                        'status' => 'failed',
                        'message' => $e->getMessage()
                    ];
                }
                break;
                
            default:
                $steps[] = [
                    'status' => 'failed',
                    'message' => 'Invalid test type'
                ];
        }
        
        return ['steps' => $steps];
    }
    
    private function getRequestData() {
        $json = file_get_contents('php://input');
        if (!$json) {
            return [];
        }
        return json_decode($json, true);
    }
    
    private function sendResponse($data, $status = 200) {
        http_response_code($status);
        echo json_encode($data);
        exit();
    }
    
    private function sendError($message, $status = 500) {
        http_response_code($status);
        echo json_encode(['error' => $message]);
        exit();
    }
}

// Create and run API
$api = new API($bootstrap['config'], $bootstrap['db']);
$api->handleRequest();
