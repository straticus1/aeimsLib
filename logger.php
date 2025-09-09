<?php

class Logger {
    private $logPath;
    private $logLevel;
    private $maxFiles;
    private $maxSize;
    private $currentFile;
    
    const LEVELS = [
        'debug' => 0,
        'info' => 1,
        'warning' => 2,
        'error' => 3
    ];
    
    public function __construct($config) {
        $this->logPath = rtrim($config['path'], '/');
        $this->logLevel = strtolower($config['level']);
        $this->maxFiles = $config['max_files'];
        $this->maxSize = $this->parseSize($config['max_size']);
        
        if (!is_dir($this->logPath)) {
            mkdir($this->logPath, 0777, true);
        }
        
        $this->rotateLogsIfNeeded();
        $this->currentFile = $this->getCurrentLogFile();
    }
    
    /**
     * Log a debug message
     */
    public function debug($message, array $context = []) {
        $this->log('debug', $message, $context);
    }
    
    /**
     * Log an info message
     */
    public function info($message, array $context = []) {
        $this->log('info', $message, $context);
    }
    
    /**
     * Log a warning message
     */
    public function warning($message, array $context = []) {
        $this->log('warning', $message, $context);
    }
    
    /**
     * Log an error message
     */
    public function error($message, array $context = []) {
        $this->log('error', $message, $context);
    }
    
    /**
     * Log an exception
     */
    public function exception(\Throwable $e, array $context = []) {
        $context['exception'] = [
            'class' => get_class($e),
            'message' => $e->getMessage(),
            'code' => $e->getCode(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => $e->getTraceAsString()
        ];
        
        $this->error($e->getMessage(), $context);
    }
    
    /**
     * Main logging function
     */
    private function log($level, $message, array $context = []) {
        if (self::LEVELS[$level] < self::LEVELS[$this->logLevel]) {
            return;
        }
        
        $entry = [
            'timestamp' => date('Y-m-d H:i:s'),
            'level' => strtoupper($level),
            'message' => $this->interpolate($message, $context),
            'context' => $context
        ];
        
        if (isset($_SERVER['REMOTE_ADDR'])) {
            $entry['ip'] = $_SERVER['REMOTE_ADDR'];
        }
        if (isset($_SERVER['REQUEST_URI'])) {
            $entry['uri'] = $_SERVER['REQUEST_URI'];
        }
        
        $line = json_encode($entry) . "\n";
        
        if (@file_put_contents($this->currentFile, $line, FILE_APPEND) === false) {
            throw new \Exception("Failed to write to log file: {$this->currentFile}");
        }
        
        $this->rotateLogsIfNeeded();
    }
    
    /**
     * Interpolate message with context values
     */
    private function interpolate($message, array $context = []) {
        $replace = [];
        foreach ($context as $key => $val) {
            if (is_string($val) || (is_object($val) && method_exists($val, '__toString'))) {
                $replace['{' . $key . '}'] = $val;
            }
        }
        return strtr($message, $replace);
    }
    
    /**
     * Get current log file path
     */
    private function getCurrentLogFile() {
        return $this->logPath . '/' . date('Y-m-d') . '.log';
    }
    
    /**
     * Rotate logs if needed
     */
    private function rotateLogsIfNeeded() {
        // Check current log file size
        if (file_exists($this->currentFile) && filesize($this->currentFile) > $this->maxSize) {
            $newFile = $this->logPath . '/' . date('Y-m-d-His') . '.log';
            rename($this->currentFile, $newFile);
            $this->currentFile = $this->getCurrentLogFile();
        }
        
        // Clean up old log files
        $files = glob($this->logPath . '/*.log');
        $count = count($files);
        
        if ($count > $this->maxFiles) {
            usort($files, function($a, $b) {
                return filemtime($a) - filemtime($b);
            });
            
            $deleteCount = $count - $this->maxFiles;
            $filesToDelete = array_slice($files, 0, $deleteCount);
            
            foreach ($filesToDelete as $file) {
                unlink($file);
            }
        }
    }
    
    /**
     * Parse size string to bytes
     */
    private function parseSize($size) {
        $unit = strtolower(substr($size, -1));
        $value = (int)substr($size, 0, -1);
        
        switch ($unit) {
            case 'g':
                $value *= 1024;
            case 'm':
                $value *= 1024;
            case 'k':
                $value *= 1024;
        }
        
        return $value;
    }
}
