import { DeviceManager } from '../src/device/DeviceManager';
import { DefaultSecurityService } from '../src/security/SecurityService';
import { DefaultMonitoringService } from '../src/monitoring/MonitoringService';
import { WebSocketServer } from '../src/server/WebSocketServer';
import express from 'express';
import http from 'http';

async function setupServer() {
  // Initialize Express and HTTP server
  const app = express();
  const server = http.createServer(app);

  // Initialize device manager
  const deviceManager = DeviceManager.getInstance();

  // Initialize and configure security service
  const securityService = DefaultSecurityService.getInstance();
  await securityService.initialize({
    encryption: {
      enabled: true,
      algorithm: 'aes-256-gcm',
      keySize: 32,
      authTagLength: 16
    },
    authentication: {
      type: 'jwt',
      secret: process.env.JWT_SECRET || 'your-secret-key',
      tokenExpiration: 3600,
      refreshTokenExpiration: 86400
    },
    rateLimit: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 100,
      message: 'Too many requests'
    },
    audit: {
      enabled: true,
      retention: 30,
      detailLevel: 'detailed'
    }
  });

  // Initialize monitoring service
  const monitoringService = DefaultMonitoringService.getInstance(deviceManager);
  await monitoringService.initialize({
    enabled: true,
    interval: 5000,
    retention: 3600000,
    metrics: {
      prefix: 'example',
      labels: {
        env: 'development',
        service: 'example'
      },
      types: ['device', 'websocket', 'system']
    },
    alerts: {
      enabled: true,
      endpoints: ['http://localhost:9093/api/v1/alerts'],
      thresholds: {
        errorRate: 0.1,
        latency: 2.0,
        deviceErrors: 5,
        connectionDrop: 20
      }
    }
  });

  // Create WebSocket server
  const wsServer = new WebSocketServer(
    server,
    {
      port: 8080,
      host: 'localhost',
      path: '/ws',
      pingInterval: 30000,
      pingTimeout: 5000,
      authSecret: process.env.JWT_SECRET || 'your-secret-key'
    },
    deviceManager,
    securityService,
    {
      windowMs: 60000,
      max: 100,
      message: 'Rate limit exceeded'
    }
  );

  // Register example device
  const device = await deviceManager.addDevice({
    id: 'example-device',
    name: 'Example Device',
    manufacturer: 'Example Manufacturer',
    model: 'Example Model',
    firmwareVersion: '1.0.0',
    protocol: 'websocket',
    capabilities: {
      supportedPatterns: ['constant', 'wave', 'pulse', 'escalation'],
      maxIntensity: 100,
      hasBattery: true,
      hasWirelessControl: true,
      supportsEncryption: true
    }
  });

  // Set up example REST endpoints
  app.get('/devices', (req, res) => {
    const devices = deviceManager.getAllDevices();
    res.json({ devices });
  });

  app.get('/health', async (req, res) => {
    const health = await monitoringService.checkHealth();
    res.json(health);
  });

  app.get('/metrics', async (req, res) => {
    const metrics = await monitoringService.getMetrics();
    res.json(metrics);
  });

  // Start server
  const port = 3000;
  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

setupServer().catch(console.error);
