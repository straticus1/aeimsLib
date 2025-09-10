<?php

abstract class AeimsError extends Exception
{
    protected $code;
    protected $severity;
    protected $context;
    protected $timestamp;
    protected $recoverable;

    public function __construct(
        string $message,
        string $code,
        string $severity = ErrorSeverity::ERROR,
        array $context = [],
        bool $recoverable = false,
        int $httpCode = 0,
        Throwable $previous = null
    ) {
        parent::__construct($message, $httpCode, $previous);
        
        $this->code = $code;
        $this->severity = $severity;
        $this->context = $context;
        $this->timestamp = new DateTime();
        $this->recoverable = $recoverable;
    }

    public function getErrorCode(): string
    {
        return $this->code;
    }

    public function getSeverity(): string
    {
        return $this->severity;
    }

    public function getContext(): array
    {
        return $this->context;
    }

    public function getTimestamp(): DateTime
    {
        return $this->timestamp;
    }

    public function isRecoverable(): bool
    {
        return $this->recoverable;
    }

    public function toArray(): array
    {
        return [
            'name' => get_class($this),
            'message' => $this->getMessage(),
            'code' => $this->code,
            'severity' => $this->severity,
            'context' => $this->context,
            'timestamp' => $this->timestamp->format('c'),
            'recoverable' => $this->recoverable,
            'file' => $this->getFile(),
            'line' => $this->getLine(),
            'trace' => $this->getTraceAsString()
        ];
    }

    public function toJson(): string
    {
        return json_encode($this->toArray(), JSON_PRETTY_PRINT);
    }
}

class ErrorSeverity
{
    const CRITICAL = 'critical';
    const ERROR = 'error';
    const WARNING = 'warning';
    const INFO = 'info';
}

class DeviceError extends AeimsError
{
    public function __construct(string $message, ?string $deviceId = null, array $context = [])
    {
        $context['deviceId'] = $deviceId;
        parent::__construct(
            $message,
            'DEVICE_ERROR',
            ErrorSeverity::ERROR,
            $context,
            true
        );
    }
}

class ConnectionError extends AeimsError
{
    public function __construct(string $message, ?string $endpoint = null, array $context = [])
    {
        $context['endpoint'] = $endpoint;
        parent::__construct(
            $message,
            'CONNECTION_ERROR',
            ErrorSeverity::ERROR,
            $context,
            true
        );
    }
}

class ValidationError extends AeimsError
{
    public function __construct(string $message, ?string $field = null, $value = null, array $context = [])
    {
        $context['field'] = $field;
        $context['value'] = $value;
        parent::__construct(
            $message,
            'VALIDATION_ERROR',
            ErrorSeverity::WARNING,
            $context,
            false
        );
    }
}

class SecurityError extends AeimsError
{
    public function __construct(string $message, array $context = [])
    {
        parent::__construct(
            $message,
            'SECURITY_ERROR',
            ErrorSeverity::CRITICAL,
            $context,
            false
        );
    }
}

class AuthenticationError extends AeimsError
{
    public function __construct(string $message, ?string $userId = null, array $context = [])
    {
        $context['userId'] = $userId;
        parent::__construct(
            $message,
            'AUTH_ERROR',
            ErrorSeverity::ERROR,
            $context,
            false
        );
    }
}

class AuthorizationError extends AeimsError
{
    public function __construct(string $message, ?string $userId = null, ?string $resource = null, array $context = [])
    {
        $context['userId'] = $userId;
        $context['resource'] = $resource;
        parent::__construct(
            $message,
            'AUTHZ_ERROR',
            ErrorSeverity::ERROR,
            $context,
            false
        );
    }
}

class DatabaseError extends AeimsError
{
    public function __construct(string $message, ?string $query = null, array $context = [])
    {
        $context['query'] = $query;
        parent::__construct(
            $message,
            'DATABASE_ERROR',
            ErrorSeverity::ERROR,
            $context,
            true
        );
    }
}

class ConfigurationError extends AeimsError
{
    public function __construct(string $message, ?string $configKey = null, array $context = [])
    {
        $context['configKey'] = $configKey;
        parent::__construct(
            $message,
            'CONFIG_ERROR',
            ErrorSeverity::CRITICAL,
            $context,
            false
        );
    }
}

class RateLimitError extends AeimsError
{
    public function __construct(string $message, ?int $limit = null, ?int $window = null, array $context = [])
    {
        $context['limit'] = $limit;
        $context['window'] = $window;
        parent::__construct(
            $message,
            'RATE_LIMIT_ERROR',
            ErrorSeverity::WARNING,
            $context,
            true
        );
    }
}

class PatternError extends AeimsError
{
    public function __construct(string $message, ?string $patternId = null, array $context = [])
    {
        $context['patternId'] = $patternId;
        parent::__construct(
            $message,
            'PATTERN_ERROR',
            ErrorSeverity::ERROR,
            $context,
            true
        );
    }
}

interface ErrorRecoveryStrategy
{
    public function canRecover(AeimsError $error): bool;
    public function recover(AeimsError $error): bool;
}

class CircuitBreaker
{
    private $failures = 0;
    private $lastFailureTime = null;
    private $state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    private $failureThreshold;
    private $recoveryTimeout;
    private $successThreshold;

    public function __construct(int $failureThreshold = 5, int $recoveryTimeout = 60, int $successThreshold = 3)
    {
        $this->failureThreshold = $failureThreshold;
        $this->recoveryTimeout = $recoveryTimeout; // seconds
        $this->successThreshold = $successThreshold;
    }

    public function execute(callable $operation)
    {
        if ($this->state === 'OPEN') {
            if ($this->shouldAttemptReset()) {
                $this->state = 'HALF_OPEN';
            } else {
                throw new Exception('Circuit breaker is OPEN');
            }
        }

        try {
            $result = $operation();
            $this->onSuccess();
            return $result;
        } catch (Exception $e) {
            $this->onFailure();
            throw $e;
        }
    }

    private function onSuccess(): void
    {
        $this->failures = 0;
        $this->state = 'CLOSED';
    }

    private function onFailure(): void
    {
        $this->failures++;
        $this->lastFailureTime = time();

        if ($this->failures >= $this->failureThreshold) {
            $this->state = 'OPEN';
        }
    }

    private function shouldAttemptReset(): bool
    {
        return $this->lastFailureTime !== null &&
               (time() - $this->lastFailureTime) >= $this->recoveryTimeout;
    }

    public function getState(): string
    {
        return $this->state;
    }
}

class ErrorHandler
{
    private static $instance = null;
    private $logger;
    private $recoveryStrategies = [];
    private $circuitBreakers = [];
    private $errorCounts = [];
    private $lastErrors = [];

    private function __construct()
    {
        // Assuming Logger class exists
        if (class_exists('Logger')) {
            $this->logger = Logger::getInstance();
        }
        $this->setupDefaultRecoveryStrategies();
        $this->setupGlobalErrorHandlers();
    }

    public static function getInstance(): ErrorHandler
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function setupDefaultRecoveryStrategies(): void
    {
        // Device connection recovery
        $this->addRecoveryStrategy('DEVICE_ERROR', new class implements ErrorRecoveryStrategy {
            public function canRecover(AeimsError $error): bool
            {
                return $error->isRecoverable();
            }

            public function recover(AeimsError $error): bool
            {
                $context = $error->getContext();
                $deviceId = $context['deviceId'] ?? null;
                
                if ($deviceId) {
                    error_log("Attempting device reconnection for device: $deviceId");
                    // Implement device reconnection logic
                    return true;
                }
                return false;
            }
        });

        // Database connection recovery
        $this->addRecoveryStrategy('DATABASE_ERROR', new class implements ErrorRecoveryStrategy {
            public function canRecover(AeimsError $error): bool
            {
                return $error->isRecoverable();
            }

            public function recover(AeimsError $error): bool
            {
                error_log("Attempting database reconnection");
                // Implement database reconnection logic
                return true;
            }
        });

        // Connection recovery
        $this->addRecoveryStrategy('CONNECTION_ERROR', new class implements ErrorRecoveryStrategy {
            public function canRecover(AeimsError $error): bool
            {
                return $error->isRecoverable();
            }

            public function recover(AeimsError $error): bool
            {
                $context = $error->getContext();
                $endpoint = $context['endpoint'] ?? 'unknown';
                error_log("Attempting connection recovery for endpoint: $endpoint");
                // Implement connection recovery logic
                return true;
            }
        });
    }

    private function setupGlobalErrorHandlers(): void
    {
        // Set custom error handler
        set_error_handler([$this, 'handlePhpError']);
        
        // Set custom exception handler
        set_exception_handler([$this, 'handleUncaughtException']);
        
        // Register shutdown function for fatal errors
        register_shutdown_function([$this, 'handleFatalError']);
    }

    public function handlePhpError(int $severity, string $message, string $file, int $line): bool
    {
        // Convert PHP error to AeimsError
        $errorCode = $this->getErrorCodeFromSeverity($severity);
        $error = new AeimsError(
            $message,
            $errorCode,
            $this->getSeverityFromPhpError($severity),
            ['file' => $file, 'line' => $line, 'php_severity' => $severity]
        );

        $this->handleError($error);
        
        // Return false to continue with normal error handling
        return false;
    }

    public function handleUncaughtException(Throwable $exception): void
    {
        if ($exception instanceof AeimsError) {
            $this->handleError($exception);
        } else {
            $error = new AeimsError(
                $exception->getMessage(),
                'UNCAUGHT_EXCEPTION',
                ErrorSeverity::CRITICAL,
                [
                    'file' => $exception->getFile(),
                    'line' => $exception->getLine(),
                    'trace' => $exception->getTraceAsString()
                ]
            );
            $this->handleError($error);
        }
    }

    public function handleFatalError(): void
    {
        $error = error_get_last();
        if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
            $fatalError = new AeimsError(
                $error['message'],
                'FATAL_ERROR',
                ErrorSeverity::CRITICAL,
                [
                    'file' => $error['file'],
                    'line' => $error['line'],
                    'type' => $error['type']
                ]
            );
            $this->handleError($fatalError);
        }
    }

    public function addRecoveryStrategy(string $errorCode, ErrorRecoveryStrategy $strategy): void
    {
        $this->recoveryStrategies[$errorCode] = $strategy;
    }

    public function getCircuitBreaker(string $name): CircuitBreaker
    {
        if (!isset($this->circuitBreakers[$name])) {
            $this->circuitBreakers[$name] = new CircuitBreaker();
        }
        return $this->circuitBreakers[$name];
    }

    public function handleError($error, array $context = []): bool
    {
        if ($error instanceof AeimsError) {
            $aeimsError = $error;
        } elseif ($error instanceof Throwable) {
            $aeimsError = new AeimsError(
                $error->getMessage(),
                'UNKNOWN_ERROR',
                ErrorSeverity::ERROR,
                array_merge(['originalError' => get_class($error)], $context)
            );
        } else {
            $aeimsError = new AeimsError(
                is_string($error) ? $error : 'Unknown error occurred',
                'UNKNOWN_ERROR',
                ErrorSeverity::ERROR,
                $context
            );
        }

        // Log the error
        $this->logError($aeimsError);

        // Update error statistics
        $this->updateErrorStats($aeimsError);

        // Attempt recovery if possible
        if ($aeimsError->isRecoverable()) {
            return $this->attemptRecovery($aeimsError);
        }

        return false;
    }

    private function logError(AeimsError $error): void
    {
        $logData = [
            'error' => $error->toArray(),
            'errorCount' => $this->errorCounts[$error->getErrorCode()] ?? 0
        ];

        $message = sprintf(
            '[%s] %s occurred: %s',
            strtoupper($error->getSeverity()),
            $error->getErrorCode(),
            $error->getMessage()
        );

        if ($this->logger) {
            switch ($error->getSeverity()) {
                case ErrorSeverity::CRITICAL:
                    $this->logger->error($message, $logData);
                    break;
                case ErrorSeverity::ERROR:
                    $this->logger->error($message, $logData);
                    break;
                case ErrorSeverity::WARNING:
                    $this->logger->warn($message, $logData);
                    break;
                case ErrorSeverity::INFO:
                    $this->logger->info($message, $logData);
                    break;
            }
        } else {
            // Fallback to error_log
            error_log($message . ' - ' . json_encode($logData));
        }
    }

    private function updateErrorStats(AeimsError $error): void
    {
        $code = $error->getErrorCode();
        $this->errorCounts[$code] = ($this->errorCounts[$code] ?? 0) + 1;
        $this->lastErrors[$code] = $error;
    }

    private function attemptRecovery(AeimsError $error): bool
    {
        $strategy = $this->recoveryStrategies[$error->getErrorCode()] ?? null;
        
        if (!$strategy || !$strategy->canRecover($error)) {
            return false;
        }

        try {
            $recovered = $strategy->recover($error);
            
            if ($recovered) {
                $message = sprintf(
                    'Error recovery successful for %s: %s',
                    $error->getErrorCode(),
                    $error->getMessage()
                );
                
                if ($this->logger) {
                    $this->logger->info($message);
                } else {
                    error_log($message);
                }
                return true;
            }
        } catch (Exception $recoveryError) {
            $message = sprintf(
                'Error recovery failed for %s: %s (Recovery error: %s)',
                $error->getErrorCode(),
                $error->getMessage(),
                $recoveryError->getMessage()
            );
            
            if ($this->logger) {
                $this->logger->error($message);
            } else {
                error_log($message);
            }
        }

        return false;
    }

    public function getErrorStats(): array
    {
        $stats = [];
        
        foreach ($this->errorCounts as $code => $count) {
            $lastError = $this->lastErrors[$code] ?? null;
            $stats[$code] = [
                'count' => $count,
                'lastOccurrence' => $lastError ? $lastError->getTimestamp()->format('c') : null,
                'lastMessage' => $lastError ? $lastError->getMessage() : null,
                'severity' => $lastError ? $lastError->getSeverity() : null
            ];
        }

        return $stats;
    }

    public function clearErrorStats(): void
    {
        $this->errorCounts = [];
        $this->lastErrors = [];
    }

    public function createErrorResponse(AeimsError $error, bool $includeStack = false): array
    {
        $response = [
            'error' => true,
            'code' => $error->getErrorCode(),
            'message' => $error->getMessage(),
            'severity' => $error->getSeverity(),
            'timestamp' => $error->getTimestamp()->format('c'),
            'recoverable' => $error->isRecoverable()
        ];

        if ($includeStack) {
            $response['trace'] = $error->getTraceAsString();
        }

        // Don't expose sensitive context in production
        if (getenv('ENVIRONMENT') !== 'production') {
            $response['context'] = $error->getContext();
        }

        return $response;
    }

    private function getErrorCodeFromSeverity(int $severity): string
    {
        switch ($severity) {
            case E_ERROR:
            case E_CORE_ERROR:
            case E_COMPILE_ERROR:
            case E_USER_ERROR:
                return 'PHP_ERROR';
            case E_WARNING:
            case E_CORE_WARNING:
            case E_COMPILE_WARNING:
            case E_USER_WARNING:
                return 'PHP_WARNING';
            case E_NOTICE:
            case E_USER_NOTICE:
                return 'PHP_NOTICE';
            case E_STRICT:
                return 'PHP_STRICT';
            case E_DEPRECATED:
            case E_USER_DEPRECATED:
                return 'PHP_DEPRECATED';
            default:
                return 'PHP_UNKNOWN';
        }
    }

    private function getSeverityFromPhpError(int $severity): string
    {
        switch ($severity) {
            case E_ERROR:
            case E_CORE_ERROR:
            case E_COMPILE_ERROR:
            case E_USER_ERROR:
                return ErrorSeverity::ERROR;
            case E_WARNING:
            case E_CORE_WARNING:
            case E_COMPILE_WARNING:
            case E_USER_WARNING:
                return ErrorSeverity::WARNING;
            case E_NOTICE:
            case E_USER_NOTICE:
            case E_STRICT:
            case E_DEPRECATED:
            case E_USER_DEPRECATED:
                return ErrorSeverity::INFO;
            default:
                return ErrorSeverity::ERROR;
        }
    }
}

// Utility functions
function isAeimsError($error): bool
{
    return $error instanceof AeimsError;
}

function createErrorFromCode(string $code, string $message, array $context = []): AeimsError
{
    switch ($code) {
        case 'DEVICE_ERROR':
            return new DeviceError($message, $context['deviceId'] ?? null, $context);
        case 'CONNECTION_ERROR':
            return new ConnectionError($message, $context['endpoint'] ?? null, $context);
        case 'VALIDATION_ERROR':
            return new ValidationError($message, $context['field'] ?? null, $context['value'] ?? null, $context);
        case 'SECURITY_ERROR':
            return new SecurityError($message, $context);
        case 'AUTH_ERROR':
            return new AuthenticationError($message, $context['userId'] ?? null, $context);
        case 'AUTHZ_ERROR':
            return new AuthorizationError($message, $context['userId'] ?? null, $context['resource'] ?? null, $context);
        case 'DATABASE_ERROR':
            return new DatabaseError($message, $context['query'] ?? null, $context);
        case 'CONFIG_ERROR':
            return new ConfigurationError($message, $context['configKey'] ?? null, $context);
        case 'RATE_LIMIT_ERROR':
            return new RateLimitError($message, $context['limit'] ?? null, $context['window'] ?? null, $context);
        case 'PATTERN_ERROR':
            return new PatternError($message, $context['patternId'] ?? null, $context);
        default:
            return new AeimsError($message, $code, ErrorSeverity::ERROR, $context);
    }
}

// Initialize error handler
ErrorHandler::getInstance();

?>
