<?php

require_once 'logger.php';

class ErrorHandler {
    private static $logger;
    private static $displayErrors;
    
    /**
     * Initialize error handler
     */
    public static function init($config) {
        self::$logger = new Logger($config['log']);
        self::$displayErrors = $config['display_errors'] ?? false;
        
        // Set up error handlers
        set_error_handler([self::class, 'handleError']);
        set_exception_handler([self::class, 'handleException']);
        register_shutdown_function([self::class, 'handleFatalError']);
        
        // Disable PHP's error display
        ini_set('display_errors', 'Off');
        error_reporting(E_ALL);
    }
    
    /**
     * Handle PHP errors
     */
    public static function handleError($errno, $errstr, $errfile, $errline) {
        if (!(error_reporting() & $errno)) {
            // This error code is not included in error_reporting
            return false;
        }
        
        $errorType = self::getErrorType($errno);
        $message = "{$errorType}: {$errstr}";
        
        $context = [
            'file' => $errfile,
            'line' => $errline,
            'type' => $errorType,
            'code' => $errno
        ];
        
        switch ($errno) {
            case E_ERROR:
            case E_USER_ERROR:
                self::$logger->error($message, $context);
                self::displayError($message, $context);
                exit(1);
                
            case E_WARNING:
            case E_USER_WARNING:
                self::$logger->warning($message, $context);
                self::displayError($message, $context);
                break;
                
            case E_NOTICE:
            case E_USER_NOTICE:
                self::$logger->info($message, $context);
                break;
                
            default:
                self::$logger->warning($message, $context);
                break;
        }
        
        return true;
    }
    
    /**
     * Handle uncaught exceptions
     */
    public static function handleException($exception) {
        self::$logger->exception($exception);
        
        $context = [
            'file' => $exception->getFile(),
            'line' => $exception->getLine(),
            'type' => get_class($exception),
            'code' => $exception->getCode(),
            'trace' => $exception->getTraceAsString()
        ];
        
        self::displayError($exception->getMessage(), $context);
        exit(1);
    }
    
    /**
     * Handle fatal errors
     */
    public static function handleFatalError() {
        $error = error_get_last();
        
        if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
            $message = "Fatal Error: {$error['message']}";
            $context = [
                'file' => $error['file'],
                'line' => $error['line'],
                'type' => self::getErrorType($error['type']),
                'code' => $error['type']
            ];
            
            self::$logger->error($message, $context);
            self::displayError($message, $context);
        }
    }
    
    /**
     * Get error type string
     */
    private static function getErrorType($type) {
        switch($type) {
            case E_ERROR:
                return 'E_ERROR';
            case E_WARNING:
                return 'E_WARNING';
            case E_PARSE:
                return 'E_PARSE';
            case E_NOTICE:
                return 'E_NOTICE';
            case E_CORE_ERROR:
                return 'E_CORE_ERROR';
            case E_CORE_WARNING:
                return 'E_CORE_WARNING';
            case E_COMPILE_ERROR:
                return 'E_COMPILE_ERROR';
            case E_COMPILE_WARNING:
                return 'E_COMPILE_WARNING';
            case E_USER_ERROR:
                return 'E_USER_ERROR';
            case E_USER_WARNING:
                return 'E_USER_WARNING';
            case E_USER_NOTICE:
                return 'E_USER_NOTICE';
            case E_STRICT:
                return 'E_STRICT';
            case E_RECOVERABLE_ERROR:
                return 'E_RECOVERABLE_ERROR';
            case E_DEPRECATED:
                return 'E_DEPRECATED';
            case E_USER_DEPRECATED:
                return 'E_USER_DEPRECATED';
            default:
                return "Unknown error type: [{$type}]";
        }
    }
    
    /**
     * Display error message
     */
    private static function displayError($message, $context) {
        if (!self::$displayErrors) {
            // In production, display a generic error message
            if (php_sapi_name() === 'cli') {
                echo "An error has occurred. Please check the logs for details.\n";
            } else {
                header('HTTP/1.1 500 Internal Server Error');
                echo json_encode([
                    'error' => 'An error has occurred. Please try again later.'
                ]);
            }
            return;
        }
        
        // In development, display detailed error information
        if (php_sapi_name() === 'cli') {
            echo "Error: {$message}\n";
            echo "File: {$context['file']}:{$context['line']}\n";
            if (isset($context['trace'])) {
                echo "Trace:\n{$context['trace']}\n";
            }
        } else {
            header('HTTP/1.1 500 Internal Server Error');
            header('Content-Type: application/json');
            echo json_encode([
                'error' => $message,
                'context' => $context
            ], JSON_PRETTY_PRINT);
        }
    }
}
