import { Server as HttpServer } from 'http';
import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';
import { DeviceManager } from '../device/DeviceManager';
import { SecurityService } from '../interfaces/security';
import { Logger } from '../utils/Logger';
import { URL } from 'url';

export interface WebSocketServerConfig {
  port: number;
  host: string;
  path: string;
  pingInterval: number;
  pingTimeout: number;
  authSecret: string;
  maxConnections?: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
}

export interface WebSocketMessage {
  id: string;
  type: string;
  payload?: any;
  timestamp: number;
}

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  lastActivity?: Date;
  rateLimitCount?: number;
  rateLimitWindow?: number;
}

export class WebSocketServer extends EventEmitter {
  private wss: WSServer;
  private server: HttpServer;
  private config: WebSocketServerConfig;
  private deviceManager: DeviceManager;
  private securityService: SecurityService;
  private rateLimitConfig: RateLimitConfig;
  private logger: Logger;
  private clients: Map<string, AuthenticatedWebSocket>;
  private pingIntervals: Map<WebSocket, NodeJS.Timeout>;

  constructor(
    server: HttpServer,
    config: WebSocketServerConfig,
    deviceManager: DeviceManager,
    securityService: SecurityService,
    rateLimitConfig: RateLimitConfig
  ) {
    super();
    this.server = server;
    this.config = config;
    this.deviceManager = deviceManager;
    this.securityService = securityService;
    this.rateLimitConfig = rateLimitConfig;
    this.logger = Logger.getInstance();
    this.clients = new Map();
    this.pingIntervals = new Map();

    this.initializeWebSocketServer();
  }

  private initializeWebSocketServer(): void {
    this.wss = new WSServer({
      server: this.server,
      path: this.config.path,
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', this.handleServerError.bind(this));

    this.logger.info('WebSocket server initialized', {
      path: this.config.path,
      maxConnections: this.config.maxConnections
    });
  }

  private verifyClient(info: any): boolean {
    try {
      // Check connection limits
      if (this.config.maxConnections && this.wss.clients.size >= this.config.maxConnections) {
        this.logger.warn('WebSocket connection rejected: max connections reached');
        return false;
      }

      // Extract token from query parameters or headers
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token') || info.req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('WebSocket connection rejected: no token provided');
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, this.config.authSecret) as any;
      
      // Store user info for later use
      info.req.userId = decoded.userId;
      info.req.deviceId = decoded.deviceId;
      info.req.sessionId = decoded.sessionId;

      return true;
    } catch (error) {
      this.logger.error('WebSocket authentication failed', { error: error.message });
      return false;
    }
  }

  private handleConnection(ws: AuthenticatedWebSocket, request: any): void {
    // Set up authenticated connection
    ws.userId = request.userId;
    ws.deviceId = request.deviceId;
    ws.sessionId = request.sessionId;
    ws.lastActivity = new Date();
    ws.rateLimitCount = 0;
    ws.rateLimitWindow = Date.now();

    const clientId = `${ws.userId}-${ws.sessionId}`;
    this.clients.set(clientId, ws);

    this.logger.info('WebSocket client connected', {
      userId: ws.userId,
      deviceId: ws.deviceId,
      sessionId: ws.sessionId,
      clientsCount: this.clients.size
    });

    // Set up event handlers
    ws.on('message', (data: Buffer) => this.handleMessage(ws, data));
    ws.on('close', (code: number, reason: Buffer) => this.handleDisconnection(ws, code, reason));
    ws.on('error', (error: Error) => this.handleClientError(ws, error));
    ws.on('pong', () => this.handlePong(ws));

    // Start ping interval
    this.startPingInterval(ws);

    // Send welcome message
    this.sendMessage(ws, {
      id: this.generateMessageId(),
      type: 'welcome',
      payload: {
        userId: ws.userId,
        deviceId: ws.deviceId,
        serverTime: new Date().toISOString()
      },
      timestamp: Date.now()
    });

    this.emit('connection', ws);
  }

  private async handleMessage(ws: AuthenticatedWebSocket, data: Buffer): Promise<void> {
    try {
      // Check rate limiting
      if (!this.checkRateLimit(ws)) {
        this.sendError(ws, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
        return;
      }

      ws.lastActivity = new Date();

      const message: WebSocketMessage = JSON.parse(data.toString());
      
      this.logger.debug('WebSocket message received', {
        userId: ws.userId,
        messageType: message.type,
        messageId: message.id
      });

      // Route message based on type
      switch (message.type) {
        case 'ping':
          await this.handlePing(ws, message);
          break;
        case 'device_command':
          await this.handleDeviceCommand(ws, message);
          break;
        case 'device_status':
          await this.handleDeviceStatusRequest(ws, message);
          break;
        case 'subscribe_device':
          await this.handleDeviceSubscription(ws, message);
          break;
        case 'unsubscribe_device':
          await this.handleDeviceUnsubscription(ws, message);
          break;
        case 'list_devices':
          await this.handleListDevices(ws, message);
          break;
        default:
          this.sendError(ws, `Unknown message type: ${message.type}`, 'UNKNOWN_MESSAGE_TYPE', message.id);
      }
    } catch (error) {
      this.logger.error('Error handling WebSocket message', {
        userId: ws.userId,
        error: error.message
      });
      this.sendError(ws, 'Invalid message format', 'INVALID_MESSAGE', undefined, error.message);
    }
  }

  private checkRateLimit(ws: AuthenticatedWebSocket): boolean {
    const now = Date.now();
    
    // Reset window if needed
    if (now - ws.rateLimitWindow! > this.rateLimitConfig.windowMs) {
      ws.rateLimitWindow = now;
      ws.rateLimitCount = 0;
    }

    ws.rateLimitCount!++;
    
    return ws.rateLimitCount! <= this.rateLimitConfig.max;
  }

  private async handlePing(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    this.sendMessage(ws, {
      id: message.id,
      type: 'pong',
      payload: { timestamp: Date.now() },
      timestamp: Date.now()
    });
  }

  private async handleDeviceCommand(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    try {
      const { deviceId, command } = message.payload;
      
      // Validate device access
      if (ws.deviceId && ws.deviceId !== deviceId) {
        this.sendError(ws, 'Access denied to device', 'ACCESS_DENIED', message.id);
        return;
      }

      // Send command to device
      await this.deviceManager.sendCommand(deviceId, command);

      this.sendMessage(ws, {
        id: message.id,
        type: 'command_success',
        payload: { deviceId, command },
        timestamp: Date.now()
      });

      this.logger.logDeviceEvent(deviceId, 'command_sent', { userId: ws.userId, command });
    } catch (error) {
      this.sendError(ws, error.message, 'COMMAND_FAILED', message.id);
    }
  }

  private async handleDeviceStatusRequest(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    try {
      const { deviceId } = message.payload;
      
      const device = this.deviceManager.getDevice(deviceId);
      
      this.sendMessage(ws, {
        id: message.id,
        type: 'device_status',
        payload: {
          deviceId,
          status: device.status,
          info: device.info
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.sendError(ws, error.message, 'STATUS_FAILED', message.id);
    }
  }

  private async handleDeviceSubscription(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    const { deviceId } = message.payload;
    
    // Subscribe to device events
    this.deviceManager.on('deviceEvent', (event) => {
      if (event.deviceId === deviceId) {
        this.sendMessage(ws, {
          id: this.generateMessageId(),
          type: 'device_event',
          payload: event,
          timestamp: Date.now()
        });
      }
    });

    this.sendMessage(ws, {
      id: message.id,
      type: 'subscription_success',
      payload: { deviceId },
      timestamp: Date.now()
    });
  }

  private async handleDeviceUnsubscription(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    // Implementation would remove specific listeners
    this.sendMessage(ws, {
      id: message.id,
      type: 'unsubscription_success',
      payload: { deviceId: message.payload.deviceId },
      timestamp: Date.now()
    });
  }

  private async handleListDevices(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    try {
      const devices = this.deviceManager.getAllDevices();
      
      this.sendMessage(ws, {
        id: message.id,
        type: 'device_list',
        payload: { devices },
        timestamp: Date.now()
      });
    } catch (error) {
      this.sendError(ws, error.message, 'LIST_FAILED', message.id);
    }
  }

  private handleDisconnection(ws: AuthenticatedWebSocket, code: number, reason: Buffer): void {
    const clientId = `${ws.userId}-${ws.sessionId}`;
    this.clients.delete(clientId);
    
    // Clear ping interval
    const pingInterval = this.pingIntervals.get(ws);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(ws);
    }

    this.logger.info('WebSocket client disconnected', {
      userId: ws.userId,
      sessionId: ws.sessionId,
      code,
      reason: reason.toString(),
      clientsCount: this.clients.size
    });

    this.emit('disconnection', ws, code, reason);
  }

  private handleClientError(ws: AuthenticatedWebSocket, error: Error): void {
    this.logger.error('WebSocket client error', {
      userId: ws.userId,
      sessionId: ws.sessionId,
      error: error.message
    });

    this.emit('clientError', ws, error);
  }

  private handleServerError(error: Error): void {
    this.logger.error('WebSocket server error', { error: error.message });
    this.emit('serverError', error);
  }

  private handlePong(ws: AuthenticatedWebSocket): void {
    ws.lastActivity = new Date();
  }

  private startPingInterval(ws: WebSocket): void {
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(interval);
        this.pingIntervals.delete(ws);
      }
    }, this.config.pingInterval);

    this.pingIntervals.set(ws, interval);
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, message: string, code: string, messageId?: string, details?: string): void {
    this.sendMessage(ws, {
      id: messageId || this.generateMessageId(),
      type: 'error',
      payload: {
        message,
        code,
        details
      },
      timestamp: Date.now()
    });
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods
  broadcast(message: WebSocketMessage, filter?: (ws: AuthenticatedWebSocket) => boolean): void {
    this.clients.forEach((ws) => {
      if (!filter || filter(ws)) {
        this.sendMessage(ws, message);
      }
    });
  }

  broadcastToDevice(deviceId: string, message: WebSocketMessage): void {
    this.broadcast(message, (ws) => ws.deviceId === deviceId);
  }

  broadcastToUser(userId: string, message: WebSocketMessage): void {
    this.broadcast(message, (ws) => ws.userId === userId);
  }

  getConnectedClients(): AuthenticatedWebSocket[] {
    return Array.from(this.clients.values());
  }

  getClientCount(): number {
    return this.clients.size;
  }

  disconnectClient(userId: string, sessionId: string): void {
    const clientId = `${userId}-${sessionId}`;
    const ws = this.clients.get(clientId);
    if (ws) {
      ws.close(1000, 'Disconnected by server');
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}
