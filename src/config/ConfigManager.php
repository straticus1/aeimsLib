<?php

namespace AeimsLib\Config;

/**
 * Configuration Manager for PHP
 */
class ConfigManager
{
    private $config = [];
    private $logger;

    public function __construct($configPath = null, $logger = null)
    {
        $this->logger = $logger;
        $this->loadConfig($configPath);
    }

    /**
     * Load configuration from file
     */
    private function loadConfig($configPath)
    {
        if ($configPath === null) {
            $configPath = __DIR__ . '/../../config.php';
        }

        if (file_exists($configPath)) {
            $this->config = include $configPath;
        } else {
            $this->config = $this->getDefaultConfig();
        }

        // Validate configuration
        $this->validateConfig();
    }

    /**
     * Get default configuration
     */
    private function getDefaultConfig()
    {
        return [
            'database' => [
                'host' => 'localhost',
                'dbname' => 'aeims',
                'user' => 'root',
                'password' => '',
                'charset' => 'utf8mb4'
            ],
            'api' => [
                'keys' => [],
                'rate_limit' => [
                    'default' => ['requests' => 100, 'window' => 3600],
                    'device_control' => ['requests' => 50, 'window' => 3600]
                ]
            ],
            'devices' => [
                'lovense' => [
                    'api_key' => '',
                    'base_url' => 'https://api.lovense.com/'
                ],
                'wevibe' => [
                    'api_key' => '',
                    'base_url' => 'https://api.we-vibe.com/'
                ],
                'kiiroo' => [
                    'api_key' => '',
                    'base_url' => 'https://api.kiiroo.com/'
                ],
                'buttplug' => [
                    'websocket_url' => 'ws://localhost:12345'
                ]
            ],
            'logging' => [
                'level' => 'info',
                'path' => __DIR__ . '/../../logs',
                'max_files' => 10,
                'max_size' => '10M'
            ],
            'security' => [
                'encryption' => [
                    'key' => '',
                    'method' => 'AES-256-CBC'
                ],
                'session' => [
                    'timeout' => 3600,
                    'secure' => false
                ]
            ],
            'monitoring' => [
                'enabled' => true,
                'alerts' => [
                    [
                        'name' => 'High Error Rate',
                        'metric' => 'error_rate',
                        'threshold' => 0.1,
                        'operator' => '>'
                    ],
                    [
                        'name' => 'Low Memory',
                        'metric' => 'memory_usage',
                        'threshold' => 0.9,
                        'operator' => '>'
                    ]
                ]
            ],
            'features' => [
                'experimental_devices' => false,
                'ai_patterns' => false,
                'analytics' => true,
                'remote_control' => true
            ]
        ];
    }

    /**
     * Validate configuration
     */
    private function validateConfig()
    {
        $required = ['database', 'api', 'devices', 'logging'];
        
        foreach ($required as $section) {
            if (!isset($this->config[$section])) {
                throw new \InvalidArgumentException("Missing required configuration section: {$section}");
            }
        }

        // Validate database configuration
        $dbRequired = ['host', 'dbname', 'user'];
        foreach ($dbRequired as $field) {
            if (!isset($this->config['database'][$field])) {
                throw new \InvalidArgumentException("Missing required database configuration: {$field}");
            }
        }

        // Validate logging configuration
        if (!isset($this->config['logging']['path'])) {
            $this->config['logging']['path'] = __DIR__ . '/../../logs';
        }

        // Create log directory if it doesn't exist
        if (!is_dir($this->config['logging']['path'])) {
            mkdir($this->config['logging']['path'], 0755, true);
        }
    }

    /**
     * Get configuration value
     */
    public function get($key, $default = null)
    {
        $keys = explode('.', $key);
        $value = $this->config;

        foreach ($keys as $k) {
            if (!isset($value[$k])) {
                return $default;
            }
            $value = $value[$k];
        }

        return $value;
    }

    /**
     * Set configuration value
     */
    public function set($key, $value)
    {
        $keys = explode('.', $key);
        $config = &$this->config;

        foreach ($keys as $k) {
            if (!isset($config[$k])) {
                $config[$k] = [];
            }
            $config = &$config[$k];
        }

        $config = $value;
    }

    /**
     * Get all configuration
     */
    public function getAll()
    {
        return $this->config;
    }

    /**
     * Check if configuration key exists
     */
    public function has($key)
    {
        $keys = explode('.', $key);
        $value = $this->config;

        foreach ($keys as $k) {
            if (!isset($value[$k])) {
                return false;
            }
            $value = $value[$k];
        }

        return true;
    }

    /**
     * Save configuration to file
     */
    public function save($configPath = null)
    {
        if ($configPath === null) {
            $configPath = __DIR__ . '/../../config.php';
        }

        $content = "<?php\n\nreturn " . var_export($this->config, true) . ";\n";
        
        if (file_put_contents($configPath, $content) === false) {
            throw new \Exception("Failed to save configuration to: {$configPath}");
        }

        if ($this->logger) {
            $this->logger->info("Configuration saved", ['path' => $configPath]);
        }
    }

    /**
     * Get device configuration
     */
    public function getDeviceConfig($deviceType)
    {
        return $this->get("devices.{$deviceType}", []);
    }

    /**
     * Get API configuration
     */
    public function getApiConfig()
    {
        return $this->get('api', []);
    }

    /**
     * Get database configuration
     */
    public function getDatabaseConfig()
    {
        return $this->get('database', []);
    }

    /**
     * Get logging configuration
     */
    public function getLoggingConfig()
    {
        return $this->get('logging', []);
    }

    /**
     * Get security configuration
     */
    public function getSecurityConfig()
    {
        return $this->get('security', []);
    }

    /**
     * Get monitoring configuration
     */
    public function getMonitoringConfig()
    {
        return $this->get('monitoring', []);
    }

    /**
     * Check if feature is enabled
     */
    public function isFeatureEnabled($feature)
    {
        return $this->get("features.{$feature}", false);
    }

    /**
     * Get rate limit configuration
     */
    public function getRateLimit($action = 'default')
    {
        return $this->get("api.rate_limit.{$action}", $this->get('api.rate_limit.default', []));
    }
}
