import http from 'http';
import WebSocket from 'ws';
import { WebSocketServer } from '../../server/WebSocketServer';
import { DeviceManager } from '../../device/DeviceManager';
import { DefaultSecurityService } from '../../security/SecurityService';
import { Device, DeviceInfo, DeviceStatus } from '../../interfaces/device';
import { MessageType } from '../../interfaces/websocket';

describe('WebSocketServer', () => {
  let server: http.Server;
  let wsServer: WebSocketServer;
  let deviceManager: DeviceManager;
  let securityService: DefaultSecurityService;
  let wsClient: WebSocket;
  let testDevice: Device;

  const testDeviceInfo: DeviceInfo = {
    id: 'test-device',
    name: 'Test Device',
    manufacturer: 'Test Manufacturer',
    model: 'Test Model',
    firmwareVersion: '1.0.0',
    protocol: 'websocket',
    capabilities: {
      supportedPatterns: ['constant', 'wave'],
      maxIntensity: 100,
      hasBattery: true,
      hasWirelessControl: true,
      supportsEncryption: true
    }
  };

  beforeAll(async () => {
    // Initialize services
    server = http.createServer();
    deviceManager = DeviceManager.getInstance();
    securityService = DefaultSecurityService.getInstance();

    // Initialize security service
    await securityService.initialize({
      encryption: {
        enabled: true,
        algorithm: 'aes-256-gcm',
        keySize: 32,
        authTagLength: 16
      },
      authentication: {
        type: 'jwt',
        secret: 'test_secret',
        tokenExpiration: 3600,
        refreshTokenExpiration: 86400
      },
      rateLimit: {
        enabled: false,
        windowMs: 60000,
        maxRequests: 100,
        message: 'Too many requests'
      },
      audit: {
        enabled: true,
        retention: 30,
        detailLevel: 'basic'
      }
    });

    // Create WebSocket server
    wsServer = new WebSocketServer(
      server,
      {
        port: 8081,
        host: 'localhost',
        path: '/ws',
        pingInterval: 1000,
        pingTimeout: 500,
        authSecret: 'test_secret'
      },
      deviceManager,
      securityService,
      {
        windowMs: 60000,
        max: 100,
        message: 'Rate limit exceeded'
      }
    );

    // Add test device
    testDevice = await deviceManager.addDevice(testDeviceInfo);

    // Start server
    await new Promise<void>(resolve => server.listen(8081, resolve));
  });

  afterAll(done => {
    if (wsClient) wsClient.close();
    server.close(done);
  });

  beforeEach(async () => {
    // Generate valid token for test
    const token = await securityService.generateToken({
      userId: 'test-user',
      deviceId: testDevice.info.id,
      permissions: {
        canControl: true,
        canConfigure: true,
        canMonitor: true,
        allowedPatterns: ['constant', 'wave'],
        maxIntensity: 100
      }
    });

    // Create WebSocket client
    wsClient = new WebSocket(`ws://localhost:8081/ws?token=${token}`);
    await new Promise(resolve => wsClient.on('open', resolve));
  });

  afterEach(() => {
    if (wsClient) wsClient.close();
  });

  it('should authenticate and establish connection', done => {
    wsClient.on('message', data => {
      const message = JSON.parse(data.toString());
      expect(message.type).toBe(MessageType.SESSION_STATUS);
      expect(message.deviceStatus).toBeDefined();
      done();
    });
  });

  it('should reject invalid token', done => {
    const invalidClient = new WebSocket('ws://localhost:8081/ws?token=invalid');
    invalidClient.on('close', () => done());
  });

  it('should handle device commands', done => {
    const command = {
      type: MessageType.DEVICE_COMMAND,
      command: {
        type: 'constant',
        intensity: 50
      }
    };

    wsClient.send(JSON.stringify(command));

    wsClient.on('message', data => {
      const message = JSON.parse(data.toString());
      if (message.type === MessageType.COMMAND_RESULT) {
        expect(message.result.success).toBe(true);
        done();
      }
    });
  });

  it('should maintain session state', done => {
    const checkSession = {
      type: MessageType.JOIN_SESSION
    };

    wsClient.send(JSON.stringify(checkSession));

    wsClient.on('message', data => {
      const message = JSON.parse(data.toString());
      if (message.type === MessageType.SESSION_STATUS) {
        expect(message.deviceStatus).toBeDefined();
        expect(message.paymentStatus).toBeDefined();
        done();
      }
    });
  });
});
