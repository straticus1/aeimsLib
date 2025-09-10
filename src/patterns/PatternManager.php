<?php

namespace AeimsLib\Patterns;

/**
 * Base Pattern class
 */
abstract class BasePattern
{
    protected $name;
    protected $duration;
    protected $parameters;
    protected $metadata;

    public function __construct($name, $duration = 1000, $parameters = [], $metadata = [])
    {
        $this->name = $name;
        $this->duration = $duration;
        $this->parameters = $parameters;
        $this->metadata = $metadata;
    }

    abstract public function generate($time);

    public function getName()
    {
        return $this->name;
    }

    public function getDuration()
    {
        return $this->duration;
    }

    public function getParameters()
    {
        return $this->parameters;
    }

    public function getMetadata()
    {
        return $this->metadata;
    }

    public function setParameter($key, $value)
    {
        $this->parameters[$key] = $value;
        return $this;
    }

    public function getParameter($key, $default = null)
    {
        return $this->parameters[$key] ?? $default;
    }
}

/**
 * Constant Pattern - maintains steady intensity
 */
class ConstantPattern extends BasePattern
{
    public function generate($time)
    {
        $intensity = $this->getParameter('intensity', 50);
        return [
            'intensity' => $intensity,
            'timestamp' => $time
        ];
    }
}

/**
 * Pulse Pattern - oscillating intensity
 */
class PulsePattern extends BasePattern
{
    public function generate($time)
    {
        $baseIntensity = $this->getParameter('baseIntensity', 30);
        $pulseIntensity = $this->getParameter('pulseIntensity', 80);
        $frequency = $this->getParameter('frequency', 1.0); // Hz
        
        $phase = ($time / 1000) * $frequency * 2 * M_PI;
        $intensity = $baseIntensity + ($pulseIntensity - $baseIntensity) * (sin($phase) + 1) / 2;
        
        return [
            'intensity' => max(0, min(100, $intensity)),
            'timestamp' => $time
        ];
    }
}

/**
 * Wave Pattern - smooth wave-like intensity
 */
class WavePattern extends BasePattern
{
    public function generate($time)
    {
        $minIntensity = $this->getParameter('minIntensity', 20);
        $maxIntensity = $this->getParameter('maxIntensity', 90);
        $frequency = $this->getParameter('frequency', 0.5); // Hz
        $phase = $this->getParameter('phase', 0);
        
        $wavePhase = ($time / 1000) * $frequency * 2 * M_PI + $phase;
        $intensity = $minIntensity + ($maxIntensity - $minIntensity) * (sin($wavePhase) + 1) / 2;
        
        return [
            'intensity' => max(0, min(100, $intensity)),
            'timestamp' => $time
        ];
    }
}

/**
 * Escalation Pattern - gradually increasing intensity
 */
class EscalationPattern extends BasePattern
{
    public function generate($time)
    {
        $startIntensity = $this->getParameter('startIntensity', 10);
        $endIntensity = $this->getParameter('endIntensity', 100);
        $escalationTime = $this->getParameter('escalationTime', $this->duration);
        
        $progress = min(1, $time / $escalationTime);
        $intensity = $startIntensity + ($endIntensity - $startIntensity) * $progress;
        
        return [
            'intensity' => max(0, min(100, $intensity)),
            'timestamp' => $time
        ];
    }
}

/**
 * Random Pattern - random intensity variations
 */
class RandomPattern extends BasePattern
{
    public function generate($time)
    {
        $minIntensity = $this->getParameter('minIntensity', 20);
        $maxIntensity = $this->getParameter('maxIntensity', 80);
        $changeInterval = $this->getParameter('changeInterval', 1000); // ms
        
        // Change intensity at intervals
        $intervalIndex = floor($time / $changeInterval);
        $seed = $intervalIndex + $this->getParameter('seed', 0);
        mt_srand($seed);
        
        $intensity = $minIntensity + mt_rand(0, $maxIntensity - $minIntensity);
        
        return [
            'intensity' => max(0, min(100, $intensity)),
            'timestamp' => $time
        ];
    }
}

/**
 * Custom Pattern - user-defined pattern
 */
class CustomPattern extends BasePattern
{
    private $patternData;

    public function __construct($name, $patternData, $duration = 1000, $parameters = [], $metadata = [])
    {
        parent::__construct($name, $duration, $parameters, $metadata);
        $this->patternData = $patternData;
    }

    public function generate($time)
    {
        if (empty($this->patternData)) {
            return ['intensity' => 0, 'timestamp' => $time];
        }

        // Find the appropriate data point for the current time
        $progress = $time / $this->duration;
        $dataIndex = floor($progress * (count($this->patternData) - 1));
        
        if ($dataIndex >= count($this->patternData)) {
            $dataIndex = count($this->patternData) - 1;
        }

        $intensity = $this->patternData[$dataIndex];
        
        return [
            'intensity' => max(0, min(100, $intensity)),
            'timestamp' => $time
        ];
    }
}

/**
 * Pattern Factory
 */
class PatternFactory
{
    public static function create($type, $name, $parameters = [], $metadata = [])
    {
        switch (strtolower($type)) {
            case 'constant':
                return new ConstantPattern($name, $parameters['duration'] ?? 1000, $parameters, $metadata);
                
            case 'pulse':
                return new PulsePattern($name, $parameters['duration'] ?? 1000, $parameters, $metadata);
                
            case 'wave':
                return new WavePattern($name, $parameters['duration'] ?? 1000, $parameters, $metadata);
                
            case 'escalation':
                return new EscalationPattern($name, $parameters['duration'] ?? 1000, $parameters, $metadata);
                
            case 'random':
                return new RandomPattern($name, $parameters['duration'] ?? 1000, $parameters, $metadata);
                
            case 'custom':
                if (!isset($parameters['patternData'])) {
                    throw new \InvalidArgumentException('Custom pattern requires patternData parameter');
                }
                return new CustomPattern($name, $parameters['patternData'], $parameters['duration'] ?? 1000, $parameters, $metadata);
                
            default:
                throw new \InvalidArgumentException("Unknown pattern type: {$type}");
        }
    }

    public static function getAvailableTypes()
    {
        return ['constant', 'pulse', 'wave', 'escalation', 'random', 'custom'];
    }
}

/**
 * Pattern Manager
 */
class PatternManager
{
    private $patterns = [];
    private $logger;

    public function __construct($logger)
    {
        $this->logger = $logger;
    }

    public function addPattern(BasePattern $pattern)
    {
        $this->patterns[$pattern->getName()] = $pattern;
        $this->logger->info("Pattern added", ['name' => $pattern->getName()]);
    }

    public function getPattern($name)
    {
        if (!isset($this->patterns[$name])) {
            throw new \Exception("Pattern not found: {$name}");
        }
        return $this->patterns[$name];
    }

    public function getAllPatterns()
    {
        return $this->patterns;
    }

    public function removePattern($name)
    {
        if (isset($this->patterns[$name])) {
            unset($this->patterns[$name]);
            $this->logger->info("Pattern removed", ['name' => $name]);
            return true;
        }
        return false;
    }

    public function executePattern($name, $deviceId, $startTime = null)
    {
        $pattern = $this->getPattern($name);
        $startTime = $startTime ?? microtime(true) * 1000;
        
        $this->logger->info("Executing pattern", [
            'pattern' => $name,
            'deviceId' => $deviceId,
            'startTime' => $startTime
        ]);

        // This would integrate with the device manager to send commands
        return [
            'pattern' => $name,
            'deviceId' => $deviceId,
            'startTime' => $startTime,
            'duration' => $pattern->getDuration()
        ];
    }
}
