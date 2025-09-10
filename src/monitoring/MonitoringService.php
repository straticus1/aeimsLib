<?php

namespace AeimsLib\Monitoring;

/**
 * Monitoring Service for PHP
 */
class MonitoringService
{
    private $config;
    private $logger;
    private $metrics = [];
    private $alerts = [];

    public function __construct($config, $logger)
    {
        $this->config = $config;
        $this->logger = $logger;
    }

    /**
     * Record a metric
     */
    public function recordMetric($name, $value, $tags = [])
    {
        $this->metrics[$name][] = [
            'value' => $value,
            'tags' => $tags,
            'timestamp' => microtime(true)
        ];

        $this->logger->debug("Metric recorded", [
            'name' => $name,
            'value' => $value,
            'tags' => $tags
        ]);
    }

    /**
     * Get metric statistics
     */
    public function getMetricStats($name, $timeWindow = 3600)
    {
        if (!isset($this->metrics[$name])) {
            return null;
        }

        $now = microtime(true);
        $windowStart = $now - $timeWindow;
        
        $values = array_filter($this->metrics[$name], function($metric) use ($windowStart) {
            return $metric['timestamp'] >= $windowStart;
        });

        if (empty($values)) {
            return null;
        }

        $values = array_column($values, 'value');
        
        return [
            'count' => count($values),
            'min' => min($values),
            'max' => max($values),
            'avg' => array_sum($values) / count($values),
            'sum' => array_sum($values)
        ];
    }

    /**
     * Check for alerts
     */
    public function checkAlerts()
    {
        $alerts = [];
        
        foreach ($this->config['alerts'] ?? [] as $alertConfig) {
            $metric = $this->getMetricStats($alertConfig['metric']);
            
            if ($metric && $this->evaluateAlert($metric, $alertConfig)) {
                $alerts[] = [
                    'name' => $alertConfig['name'],
                    'metric' => $alertConfig['metric'],
                    'value' => $metric['avg'],
                    'threshold' => $alertConfig['threshold'],
                    'timestamp' => date('c')
                ];
            }
        }
        
        return $alerts;
    }

    /**
     * Evaluate alert condition
     */
    private function evaluateAlert($metric, $alertConfig)
    {
        $value = $metric['avg'];
        $threshold = $alertConfig['threshold'];
        $operator = $alertConfig['operator'] ?? '>';

        switch ($operator) {
            case '>':
                return $value > $threshold;
            case '<':
                return $value < $threshold;
            case '>=':
                return $value >= $threshold;
            case '<=':
                return $value <= $threshold;
            case '==':
                return $value == $threshold;
            default:
                return false;
        }
    }

    /**
     * Get system health
     */
    public function getSystemHealth()
    {
        $health = [
            'status' => 'healthy',
            'timestamp' => date('c'),
            'metrics' => []
        ];

        // Check key metrics
        $keyMetrics = ['device_connections', 'api_requests', 'error_rate'];
        
        foreach ($keyMetrics as $metric) {
            $stats = $this->getMetricStats($metric);
            if ($stats) {
                $health['metrics'][$metric] = $stats;
            }
        }

        // Check for alerts
        $alerts = $this->checkAlerts();
        if (!empty($alerts)) {
            $health['status'] = 'warning';
            $health['alerts'] = $alerts;
        }

        return $health;
    }

    /**
     * Get performance metrics
     */
    public function getPerformanceMetrics()
    {
        return [
            'memory_usage' => memory_get_usage(true),
            'memory_peak' => memory_get_peak_usage(true),
            'execution_time' => microtime(true) - $_SERVER['REQUEST_TIME_FLOAT'],
            'cpu_usage' => sys_getloadavg()[0] ?? 0
        ];
    }
}

/**
 * Analytics Collector
 */
class AnalyticsCollector
{
    private $events = [];
    private $logger;

    public function __construct($logger)
    {
        $this->logger = $logger;
    }

    /**
     * Record an event
     */
    public function recordEvent($type, $data = [])
    {
        $event = [
            'type' => $type,
            'data' => $data,
            'timestamp' => microtime(true),
            'sessionId' => $data['sessionId'] ?? null,
            'userId' => $data['userId'] ?? null
        ];

        $this->events[] = $event;
        
        $this->logger->info("Analytics event recorded", $event);
    }

    /**
     * Get events by type
     */
    public function getEventsByType($type, $limit = 100)
    {
        $events = array_filter($this->events, function($event) use ($type) {
            return $event['type'] === $type;
        });

        return array_slice($events, -$limit);
    }

    /**
     * Get session analytics
     */
    public function getSessionAnalytics($sessionId)
    {
        $sessionEvents = array_filter($this->events, function($event) use ($sessionId) {
            return $event['sessionId'] === $sessionId;
        });

        $analytics = [
            'sessionId' => $sessionId,
            'totalEvents' => count($sessionEvents),
            'eventTypes' => [],
            'duration' => 0,
            'startTime' => null,
            'endTime' => null
        ];

        if (!empty($sessionEvents)) {
            $timestamps = array_column($sessionEvents, 'timestamp');
            $analytics['startTime'] = min($timestamps);
            $analytics['endTime'] = max($timestamps);
            $analytics['duration'] = $analytics['endTime'] - $analytics['startTime'];

            $eventTypes = array_count_values(array_column($sessionEvents, 'type'));
            $analytics['eventTypes'] = $eventTypes;
        }

        return $analytics;
    }

    /**
     * Get user analytics
     */
    public function getUserAnalytics($userId, $timeWindow = 86400)
    {
        $now = microtime(true);
        $windowStart = $now - $timeWindow;
        
        $userEvents = array_filter($this->events, function($event) use ($userId, $windowStart) {
            return $event['userId'] === $userId && $event['timestamp'] >= $windowStart;
        });

        return [
            'userId' => $userId,
            'timeWindow' => $timeWindow,
            'totalEvents' => count($userEvents),
            'sessions' => count(array_unique(array_column($userEvents, 'sessionId'))),
            'eventTypes' => array_count_values(array_column($userEvents, 'type'))
        ];
    }
}
