# AeimsLib Monitoring System 📊

The AeimsLib monitoring system provides comprehensive metrics collection and analytics capabilities for tracking device interactions, performance metrics, and usage patterns. The system is designed to be both powerful and easy to integrate, whether you're using AeimsLib standalone or as part of the AEIMS platform.

## Overview

The monitoring system consists of two main components:

1. Metrics Collector: Real-time metrics tracking and aggregation
2. Analytics Collector: Event-based analytics and usage statistics

Both components can be used independently or together through the integrated monitoring interface.

## Quick Start

```typescript
import { initializeMonitoring, DeviceMonitoring, SessionMonitoring } from 'aeims-lib/monitoring';

// Initialize the monitoring system
initializeMonitoring();

// Create device monitor
const deviceMonitor = new DeviceMonitoring('device-123');

// Track device events
deviceMonitor.onConnect('user-456', 'session-789');
deviceMonitor.onCommandStart('vibrate');
deviceMonitor.onCommandComplete('vibrate', 100, true); // 100ms duration, success

// Create session monitor
const sessionMonitor = new SessionMonitoring('session-789', 'user-456');
sessionMonitor.start();

// Track feature usage
sessionMonitor.onFeatureUsed('pattern-control', 'device-123');

// End session
sessionMonitor.end();

// Cleanup on shutdown
shutdownMonitoring();
```

## Metrics Collection

The metrics collector provides real-time tracking of various metric types:

- **Counter**: Cumulative metrics that only increase (e.g., total commands sent)
- **Gauge**: Point-in-time measurements (e.g., active connections)
- **Histogram**: Distribution of values (e.g., command latencies)
- **Meter**: Rate of events (e.g., commands per second)

### Standard Metrics

The following metrics are tracked by default:

#### Device Metrics
- `device.connections` (Counter): Number of device connections
- `device.commands` (Counter): Number of commands sent
- `device.errors` (Counter): Number of device errors
- `device.latency` (Histogram): Command execution latency

#### Protocol Metrics
- `protocol.messages` (Counter): Protocol message count
- `protocol.errors` (Counter): Protocol error count

#### WebSocket Metrics
- `websocket.connections` (Gauge): Active WebSocket connections
- `websocket.messages` (Counter): WebSocket message count
- `websocket.errors` (Counter): WebSocket error count

#### Performance Metrics
- `performance.memory` (Gauge): Memory usage
- `performance.cpu` (Gauge): CPU usage
- `performance.command_queue` (Gauge): Command queue length

#### Security Metrics
- `security.auth_failures` (Counter): Authentication failures
- `security.rate_limits` (Counter): Rate limit hits

### Custom Metrics

You can register custom metrics for your specific needs:

```typescript
import { MetricsCollector, MetricType, MetricCategory } from 'aeims-lib/monitoring';

const metrics = MetricsCollector.getInstance();

// Register custom metric
metrics.registerMetric({
  name: 'custom.metric',
  type: MetricType.HISTOGRAM,
  category: MetricCategory.PERFORMANCE,
  description: 'Custom metric description',
  buckets: [10, 20, 50, 100]
});

// Record values
metrics.recordMetric('custom.metric', 42, {
  device_id: 'device-123',
  tag: 'value'
});
```

## Analytics Collection

The analytics collector tracks various events and maintains device usage statistics:

### Event Types

- Device Events:
  - Device connections/disconnections
  - Command execution
  - Pattern usage
  - Error occurrences
- Session Events:
  - Session start/end
  - Feature usage
  - State changes
- System Events:
  - Error events
  - Security events

### Usage Statistics

For each device, the system maintains:

- Connection counts
- Command success/failure rates
- Pattern usage statistics
- Session duration statistics
- Feature usage rankings
- Error rates

### Query Examples

```typescript
import { AnalyticsCollector, AnalyticsEventType } from 'aeims-lib/monitoring';

const analytics = AnalyticsCollector.getInstance();

// Query specific event types
const events = analytics.queryEvents({
  types: [AnalyticsEventType.COMMAND_COMPLETED],
  deviceIds: ['device-123'],
  startTime: Date.now() - 3600000 // Last hour
});

// Get device statistics
const stats = analytics.getDeviceStats('device-123');
```

## Integration with HTTP Endpoints

When using AeimsLib as a standalone server, monitoring data is available through HTTP endpoints:

### Metrics Endpoints

```
GET /api/metrics
GET /api/metrics/:name
GET /api/metrics/summary
```

### Analytics Endpoints

```
GET /api/analytics/events
GET /api/analytics/devices/:deviceId/stats
GET /api/analytics/sessions/:sessionId
```

Query parameters for filtering:
- `type`: Event type(s)
- `deviceId`: Device ID(s)
- `startTime`: Start timestamp
- `endTime`: End timestamp
- `limit`: Maximum results

## Best Practices

1. **Initialize Early**: Call `initializeMonitoring()` during application startup

2. **Use Helper Classes**: Prefer `DeviceMonitoring` and `SessionMonitoring` over direct collector access

3. **Custom Metrics**: 
   - Use meaningful names with dots for hierarchy
   - Add relevant tags for better filtering
   - Choose appropriate metric types

4. **Resource Management**:
   - Set appropriate retention periods
   - Call `shutdownMonitoring()` during cleanup
   - Monitor memory usage for high-traffic systems

5. **Error Handling**:
   - Always include error context in error tracking
   - Use appropriate error types
   - Track error rates for anomaly detection

## Integration with AEIMS Platform

When used with the AEIMS platform, the monitoring system automatically integrates with the platform's monitoring infrastructure:

```typescript
import { AeimsClient } from '@aeims/client';
import { initializeMonitoring } from 'aeims-lib/monitoring';

// Initialize with AEIMS client
const client = new AeimsClient({
  url: 'https://aeims-platform.example.com'
});

initializeMonitoring({
  aeims: client,
  syncInterval: 60000 // Sync every minute
});
```

This enables:
- Centralized monitoring
- Cross-instance analytics
- Platform-wide dashboards
- Automated alerting
- Historical data analysis

## Performance Considerations

The monitoring system is designed to be lightweight and efficient:

- Minimal overhead per metric/event
- Efficient storage with automatic cleanup
- Configurable retention periods
- Memory usage optimizations
- Batched metric updates

For high-traffic systems, consider:
- Adjusting retention periods
- Using selective metric collection
- Implementing metric aggregation
- Configuring appropriate flush intervals

## Contributing

Contributions to the monitoring system are welcome! See [Contributing Guide](../CONTRIBUTING.md) for details.

Key areas for contributions:
- Additional metric types
- New analytics features
- Performance optimizations
- Integration with monitoring platforms
- Documentation improvements
