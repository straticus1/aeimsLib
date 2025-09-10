import {
  MonitoringService,
  MonitoringConfig,
  SystemHealth,
  PerformanceMetrics,
  DeviceMetrics,
  SessionMetrics,
  Alert,
  AlertSeverity,
  MetricType,
  MetricLabels
} from '../interfaces/monitoring';
import { register, Counter, Gauge, Histogram, Summary } from 'prom-client';
import { WebSocketStats } from '../interfaces/websocket';
import { DeviceManager } from '../device/DeviceManager';
import { Logger } from '../utils/Logger';
import os from 'os';

export class DefaultMonitoringService implements MonitoringService {
  private static instance: DefaultMonitoringService;
  private config: MonitoringConfig;
  private logger: Logger;
  private deviceManager: DeviceManager;
  private collectionInterval?: NodeJS.Timeout;
  private metrics: Map<string, Counter | Gauge | Histogram | Summary>;
  private alerts: Alert[];

  private constructor(deviceManager: DeviceManager) {
    this.logger = Logger.getInstance();
    this.deviceManager = deviceManager;
    this.metrics = new Map();
    this.alerts = [];
  }

  static getInstance(deviceManager: DeviceManager): DefaultMonitoringService {
    if (!DefaultMonitoringService.instance) {
      DefaultMonitoringService.instance = new DefaultMonitoringService(deviceManager);
    }
    return DefaultMonitoringService.instance;
  }

  async initialize(config: MonitoringConfig): Promise<void> {
    this.config = config;

    if (!config.enabled) {
      return;
    }

    // Initialize default metrics
    this.setupDefaultMetrics();

    // Start metrics collection
    this.startMetricsCollection();

    this.logger.info('Monitoring service initialized');
  }

  private setupDefaultMetrics(): void {
    // Device metrics
    this.createMetric('device_total', MetricType.GAUGE, 'Total number of devices');
    this.createMetric('device_connected', MetricType.GAUGE, 'Number of connected devices');
    this.createMetric('device_errors', MetricType.COUNTER, 'Number of device errors');
    this.createMetric('device_commands', MetricType.COUNTER, 'Number of device commands');
    this.createMetric('device_command_latency', MetricType.HISTOGRAM, 'Device command latency', {
      buckets: [0.1, 0.5, 1, 2, 5]
    });

    // WebSocket metrics
    this.createMetric('ws_connections_total', MetricType.COUNTER, 'Total WebSocket connections');
    this.createMetric('ws_connections_active', MetricType.GAUGE, 'Active WebSocket connections');
    this.createMetric('ws_messages_sent', MetricType.COUNTER, 'WebSocket messages sent');
    this.createMetric('ws_messages_received', MetricType.COUNTER, 'WebSocket messages received');
    this.createMetric('ws_errors', MetricType.COUNTER, 'WebSocket errors');

    // System metrics
    this.createMetric('system_cpu_usage', MetricType.GAUGE, 'CPU usage percentage');
    this.createMetric('system_memory_usage', MetricType.GAUGE, 'Memory usage percentage');
    this.createMetric('system_uptime', MetricType.GAUGE, 'System uptime in seconds');
  }

  private createMetric(
    name: string,
    type: MetricType,
    help: string,
    config: any = {}
  ): void {
    const fullName = `${this.config.metrics.prefix}_${name}`;
    let metric;

    switch (type) {
      case MetricType.COUNTER:
        metric = new Counter({
          name: fullName,
          help,
          labelNames: Object.keys(this.config.metrics.labels)
        });
        break;
      case MetricType.GAUGE:
        metric = new Gauge({
          name: fullName,
          help,
          labelNames: Object.keys(this.config.metrics.labels)
        });
        break;
      case MetricType.HISTOGRAM:
        metric = new Histogram({
          name: fullName,
          help,
          labelNames: Object.keys(this.config.metrics.labels),
          buckets: config.buckets || [0.1, 0.5, 1, 2, 5]
        });
        break;
      case MetricType.SUMMARY:
        metric = new Summary({
          name: fullName,
          help,
          labelNames: Object.keys(this.config.metrics.labels),
          maxAgeSeconds: config.maxAgeSeconds || 600,
          ageBuckets: config.ageBuckets || 5
        });
        break;
    }

    this.metrics.set(name, metric);
  }

  startMetricsCollection(): void {
    if (!this.config.enabled) {
      return;
    }

    this.collectionInterval = setInterval(
      () => this.collectMetrics(),
      this.config.interval
    );
  }

  stopMetricsCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  private async collectMetrics(): Promise<void> {
    try {
      const devices = this.deviceManager.getAllDevices();
      const connectedDevices = devices.filter(d => d.status.connected);

      // Update device metrics
      this.recordMetric('device_total', devices.length);
      this.recordMetric('device_connected', connectedDevices.length);

      // Update system metrics
      const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

      this.recordMetric('system_cpu_usage', cpuUsage);
      this.recordMetric('system_memory_usage', memoryUsage);
      this.recordMetric('system_uptime', os.uptime());

      // Check health thresholds and trigger alerts if needed
      await this.checkHealthThresholds({
        cpuUsage,
        memoryUsage,
        deviceErrors: devices.filter(d => d.status.error).length,
        connectedDevices: connectedDevices.length
      });
    } catch (error) {
      this.logger.error(`Metrics collection failed: ${error}`);
    }
  }

  recordMetric(name: string, value: number, labels?: MetricLabels): void {
    if (!this.config.enabled) {
      return;
    }

    const metric = this.metrics.get(name);
    if (!metric) {
      this.logger.warn(`Metric ${name} not found`);
      return;
    }

    try {
      const allLabels = { ...this.config.metrics.labels, ...labels };

      if (metric instanceof Counter) {
        metric.inc(allLabels, value);
      } else if (metric instanceof Gauge) {
        metric.set(allLabels, value);
      } else if (metric instanceof Histogram) {
        metric.observe(allLabels, value);
      } else if (metric instanceof Summary) {
        metric.observe(allLabels, value);
      }
    } catch (error) {
      this.logger.error(`Failed to record metric ${name}: ${error}`);
    }
  }

  async getMetrics(): Promise<PerformanceMetrics> {
    const devices = this.deviceManager.getAllDevices();
    const deviceMetrics = new Map<string, DeviceMetrics>();
    const sessionMetrics = new Map<string, SessionMetrics>();

    // Collect device metrics
    for (const device of devices) {
      deviceMetrics.set(device.info.id, {
        deviceId: device.info.id,
        status: device.status,
        connectionUptime: device.status.connected ?
          Date.now() - device.status.lastSeen.getTime() : 0,
        commandsProcessed: 0, // This should be tracked in the device manager
        commandErrors: 0,
        averageLatency: 0,
        batteryLevel: device.status.batteryLevel
      });
    }

    // Get system metrics
    const metrics: PerformanceMetrics = {
      timestamp: new Date(),
      period: this.config.interval,
      websocket: await this.getWebSocketStats(),
      devices: deviceMetrics,
      sessions: sessionMetrics,
      system: {
        cpu: os.loadavg()[0] / os.cpus().length * 100,
        memory: (os.totalmem() - os.freemem()) / os.totalmem() * 100,
        uptime: os.uptime(),
        errorRate: this.calculateErrorRate()
      }
    };

    return metrics;
  }

  async getDeviceMetrics(deviceId: string): Promise<DeviceMetrics> {
    const device = this.deviceManager.getDevice(deviceId);
    
    return {
      deviceId: device.info.id,
      status: device.status,
      connectionUptime: device.status.connected ?
        Date.now() - device.status.lastSeen.getTime() : 0,
      commandsProcessed: 0, // This should be tracked in the device manager
      commandErrors: 0,
      averageLatency: 0,
      batteryLevel: device.status.batteryLevel
    };
  }

  async getSessionMetrics(sessionId: string): Promise<SessionMetrics> {
    // This should be implemented based on your session tracking
    throw new Error('Not implemented');
  }

  async checkHealth(): Promise<SystemHealth> {
    const devices = this.deviceManager.getAllDevices();
    const connectedDevices = devices.filter(d => d.status.connected);
    const errorDevices = devices.filter(d => d.status.error);
    const wsStats = await this.getWebSocketStats();

    const health: SystemHealth = {
      status: 'healthy',
      timestamp: new Date(),
      details: {
        websocket: {
          status: wsStats.errors > this.config.alerts.thresholds.errorRate ? 'down' : 'up',
          connections: wsStats.activeConnections,
          errorRate: wsStats.errors / wsStats.totalConnections || 0
        },
        devices: {
          total: devices.length,
          connected: connectedDevices.length,
          error: errorDevices.length
        },
        resources: {
          cpu: os.loadavg()[0] / os.cpus().length * 100,
          memory: (os.totalmem() - os.freemem()) / os.totalmem() * 100,
          uptime: os.uptime()
        }
      }
    };

    // Determine overall health status
    if (
      health.details.websocket.status === 'down' ||
      health.details.devices.error > this.config.alerts.thresholds.deviceErrors ||
      health.details.resources.cpu > 90 ||
      health.details.resources.memory > 90
    ) {
      health.status = 'unhealthy';
    } else if (
      health.details.devices.connected < health.details.devices.total * 0.8 ||
      health.details.resources.cpu > 70 ||
      health.details.resources.memory > 70
    ) {
      health.status = 'degraded';
    }

    return health;
  }

  async triggerAlert(alert: Alert): Promise<void> {
    this.alerts.push(alert);

    // Log alert
    this.logger.warn(`Alert triggered: ${alert.title}`, {
      alert: {
        id: alert.id,
        severity: alert.severity,
        message: alert.message
      }
    });

    // Record metric
    this.recordMetric('alerts_triggered', 1, {
      severity: alert.severity,
      type: alert.title
    });

    // Send alerts to configured endpoints
    for (const endpoint of this.config.alerts.endpoints) {
      try {
        // Implement alert notification (e.g., webhook, email, etc.)
        await this.sendAlertNotification(endpoint, alert);
      } catch (error) {
        this.logger.error(`Failed to send alert to ${endpoint}: ${error}`);
      }
    }
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.logger.info(`Alert ${alertId} acknowledged`);
    }
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return this.alerts.filter(a => !a.acknowledged);
  }

  private async sendAlertNotification(endpoint: string, alert: Alert): Promise<void> {
    // Implement alert notification based on your needs
    // This is a placeholder
    this.logger.info(`Would send alert to ${endpoint}`, { alert });
  }

  private calculateErrorRate(): number {
    const errorMetric = this.metrics.get('device_errors') as Counter;
    const commandMetric = this.metrics.get('device_commands') as Counter;
    
    if (!errorMetric || !commandMetric) {
      return 0;
    }

    const errors = errorMetric.get().values[0].value;
    const commands = commandMetric.get().values[0].value;
    
    return commands > 0 ? errors / commands : 0;
  }

  private async getWebSocketStats(): Promise<WebSocketStats> {
    const wsConnectionsMetric = this.metrics.get('ws_connections_active') as Gauge;
    const wsErrorsMetric = this.metrics.get('ws_errors') as Counter;
    const wsMessagesSentMetric = this.metrics.get('ws_messages_sent') as Counter;
    const wsMessagesReceivedMetric = this.metrics.get('ws_messages_received') as Counter;

    return {
      totalConnections: wsConnectionsMetric?.get().values[0].value || 0,
      activeConnections: wsConnectionsMetric?.get().values[0].value || 0,
      messagesReceived: wsMessagesReceivedMetric?.get().values[0].value || 0,
      messagesSent: wsMessagesSentMetric?.get().values[0].value || 0,
      errors: wsErrorsMetric?.get().values[0].value || 0,
      lastError: undefined
    };
  }

  private async checkHealthThresholds(metrics: {
    cpuUsage: number;
    memoryUsage: number;
    deviceErrors: number;
    connectedDevices: number;
  }): Promise<void> {
    // Check CPU usage
    if (metrics.cpuUsage > this.config.alerts.thresholds.deviceErrors) {
      await this.triggerAlert({
        id: crypto.randomBytes(16).toString('hex'),
        severity: AlertSeverity.WARNING,
        title: 'High CPU Usage',
        message: `CPU usage is at ${metrics.cpuUsage.toFixed(1)}%`,
        source: 'system',
        timestamp: new Date(),
        acknowledged: false
      });
    }

    // Check memory usage
    if (metrics.memoryUsage > 90) {
      await this.triggerAlert({
        id: crypto.randomBytes(16).toString('hex'),
        severity: AlertSeverity.CRITICAL,
        title: 'Critical Memory Usage',
        message: `Memory usage is at ${metrics.memoryUsage.toFixed(1)}%`,
        source: 'system',
        timestamp: new Date(),
        acknowledged: false
      });
    }

    // Check device errors
    if (metrics.deviceErrors > this.config.alerts.thresholds.deviceErrors) {
      await this.triggerAlert({
        id: crypto.randomBytes(16).toString('hex'),
        severity: AlertSeverity.ERROR,
        title: 'High Device Error Rate',
        message: `${metrics.deviceErrors} devices are reporting errors`,
        source: 'devices',
        timestamp: new Date(),
        acknowledged: false
      });
    }

    // Check connection drops
    if (metrics.connectedDevices < this.deviceManager.getAllDevices().length * 0.8) {
      await this.triggerAlert({
        id: crypto.randomBytes(16).toString('hex'),
        severity: AlertSeverity.WARNING,
        title: 'Low Device Connection Rate',
        message: `Only ${metrics.connectedDevices} devices are connected`,
        source: 'devices',
        timestamp: new Date(),
        acknowledged: false
      });
    }
  }
}
