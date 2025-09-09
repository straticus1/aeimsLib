<?php

/**
 * Example configuration file for Adult Toy Library
 * 
 * Copy this file to config.php and update the values with your actual configuration
 */

return [
    // Database configuration
    'database' => [
        'host' => 'localhost',
        'name' => 'adult_toy_lib',
        'user' => 'db_user',
        'password' => 'db_password'
    ],
    
    // API Keys for various toy manufacturers
    'lovense_api_key' => 'your_lovense_api_key_here',
    'wevibe_api_key' => 'your_wevibe_api_key_here',
    'kiiroo_api_key' => 'your_kiiroo_api_key_here',
    
    // WebSocket configuration for Buttplug.io
    'buttplug_websocket' => 'ws://localhost:12345',
    
    // Logging configuration
    'log' => [
        'path' => __DIR__ . '/logs',
        'level' => 'debug', // debug, info, warning, error
        'max_files' => 5,
        'max_size' => '10M'
    ],
    
    // Security settings
    'security' => [
        'cors_allowed_origins' => ['http://localhost:8000'],
        'max_requests_per_minute' => 60,
        'api_token_expiry' => 3600 // 1 hour
    ],
    
    // WebSocket server settings
    'websocket' => [
        'port' => 12345,
        'ping_interval' => 30,
        'max_connections' => 100
    ]
];
