<?php

namespace AeimsLib\Security;

/**
 * Security Manager for PHP
 */
class SecurityManager
{
    private $config;
    private $logger;
    private $rateLimiter;
    private $encryption;

    public function __construct($config, $logger)
    {
        $this->config = $config;
        $this->logger = $logger;
        $this->rateLimiter = new RateLimiter($config['rateLimit'] ?? []);
        $this->encryption = new EncryptionService($config['encryption'] ?? []);
    }

    /**
     * Validate API key
     */
    public function validateApiKey($apiKey)
    {
        if (empty($apiKey)) {
            return false;
        }

        // Check against configured API keys
        $validKeys = $this->config['apiKeys'] ?? [];
        return in_array($apiKey, $validKeys);
    }

    /**
     * Rate limiting check
     */
    public function checkRateLimit($identifier, $action = 'default')
    {
        return $this->rateLimiter->check($identifier, $action);
    }

    /**
     * Encrypt sensitive data
     */
    public function encrypt($data)
    {
        return $this->encryption->encrypt($data);
    }

    /**
     * Decrypt sensitive data
     */
    public function decrypt($encryptedData)
    {
        return $this->encryption->decrypt($encryptedData);
    }

    /**
     * Validate device permissions
     */
    public function validateDeviceAccess($userId, $deviceId)
    {
        // Implement device access validation logic
        // This would typically check against a database
        return true; // Simplified for now
    }

    /**
     * Log security event
     */
    public function logSecurityEvent($event, $context = [])
    {
        $this->logger->warning("Security event", array_merge([
            'event' => $event,
            'timestamp' => date('c'),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ], $context));
    }
}

/**
 * Rate Limiter
 */
class RateLimiter
{
    private $limits;
    private $storage = [];

    public function __construct($config)
    {
        $this->limits = $config;
    }

    public function check($identifier, $action = 'default')
    {
        $limit = $this->limits[$action] ?? $this->limits['default'] ?? ['requests' => 100, 'window' => 3600];
        
        $now = time();
        $window = $limit['window'];
        $maxRequests = $limit['requests'];
        
        $key = "{$identifier}:{$action}";
        
        if (!isset($this->storage[$key])) {
            $this->storage[$key] = [];
        }
        
        // Clean old requests
        $this->storage[$key] = array_filter($this->storage[$key], function($timestamp) use ($now, $window) {
            return ($now - $timestamp) < $window;
        });
        
        // Check if limit exceeded
        if (count($this->storage[$key]) >= $maxRequests) {
            return false;
        }
        
        // Add current request
        $this->storage[$key][] = $now;
        
        return true;
    }
}

/**
 * Encryption Service
 */
class EncryptionService
{
    private $key;
    private $method;

    public function __construct($config)
    {
        $this->key = $config['key'] ?? $this->generateKey();
        $this->method = $config['method'] ?? 'AES-256-CBC';
    }

    public function encrypt($data)
    {
        $iv = openssl_random_pseudo_bytes(openssl_cipher_iv_length($this->method));
        $encrypted = openssl_encrypt($data, $this->method, $this->key, 0, $iv);
        
        return base64_encode($iv . $encrypted);
    }

    public function decrypt($encryptedData)
    {
        $data = base64_decode($encryptedData);
        $ivLength = openssl_cipher_iv_length($this->method);
        $iv = substr($data, 0, $ivLength);
        $encrypted = substr($data, $ivLength);
        
        return openssl_decrypt($encrypted, $this->method, $this->key, 0, $iv);
    }

    private function generateKey()
    {
        return base64_encode(openssl_random_pseudo_bytes(32));
    }
}

/**
 * Authentication Service
 */
class AuthenticationService
{
    private $config;
    private $logger;

    public function __construct($config, $logger)
    {
        $this->config = $config;
        $this->logger = $logger;
    }

    public function authenticate($credentials)
    {
        // Implement authentication logic
        // This would typically validate against a database
        return [
            'authenticated' => true,
            'userId' => 'user123',
            'permissions' => ['read', 'write']
        ];
    }

    public function generateToken($userId)
    {
        $payload = [
            'userId' => $userId,
            'exp' => time() + 3600, // 1 hour
            'iat' => time()
        ];
        
        return base64_encode(json_encode($payload));
    }

    public function validateToken($token)
    {
        try {
            $payload = json_decode(base64_decode($token), true);
            
            if (!$payload || $payload['exp'] < time()) {
                return false;
            }
            
            return $payload;
        } catch (\Exception $e) {
            return false;
        }
    }
}
