<?php

/**
 * Bootstrap file for Adult Toy Library
 * This file sets up the environment and initializes core components
 */

// Set error reporting
error_reporting(E_ALL);
ini_set('display_errors', 'Off');

// Load configuration
if (!file_exists(__DIR__ . '/config.php')) {
    die('Configuration file not found. Please copy config.example.php to config.php and update the settings.');
}

$config = require __DIR__ . '/config.php';

// Initialize error handling
require_once __DIR__ . '/error_handler.php';
ErrorHandler::init($config);

// Initialize database connection
require_once __DIR__ . '/database.php';
$db = new Database(
    $config['database']['host'],
    $config['database']['name'],
    $config['database']['user'],
    $config['database']['password']
);

// Set timezone
date_default_timezone_set('UTC');

// Initialize session handling
session_start();

// Set response headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

// Check maintenance mode
if (!empty($config['maintenance_mode'])) {
    header('HTTP/1.1 503 Service Temporarily Unavailable');
    header('Retry-After: 3600');
    die(json_encode([
        'error' => 'System is under maintenance. Please try again later.'
    ]));
}

// Return initialized components
return [
    'config' => $config,
    'db' => $db
];
