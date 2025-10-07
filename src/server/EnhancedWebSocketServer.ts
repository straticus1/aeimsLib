import { Server as HttpServer } from 'http';
import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';
import { DeviceManager } from '../device/DeviceManager';
import { SecurityService } from '../interfaces/security';
import { Logger } from '../utils/Logger';
import { MetricsCollector, MetricType, MetricCategory } from '../monitoring/MetricsCollector';
import { DefaultMonitoringService } from '../monitoring/MonitoringService';
import { URL } from 'url';
import cluster from 'cluster';
import { cpus } from 'os';
import { createHash } from 'crypto';
import Redis from 'ioredis';

export interface EnhancedWebSocketServerConfig {
  port: number;
  host: string;
  path: string;
  pingInterval: number;
  pingTimeout: number;
  authSecret: string;
  maxConnections?: number;
  clustering?: {
    enabled: boolean;
    workers?: number;
    redisUrl?: string;
  };
  performance?: {
    messageQueueSize: number;
    batchProcessing: boolean;
    compressionEnabled: boolean;
    heartbeatOptimized: boolean;
  };
  security?: {
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
      skipSuccessfulRequests: boolean;
    };
    ddosProtection: {
      enabled: boolean;
      maxConnections: number;
      connectionWindow: number;
    };
    encryption: {
      enabled: boolean;
      algorithm: string;
    };
  };
  monitoring?: {
    metricsEnabled: boolean;
    healthCheckEndpoint: string;
    alerting: {
      enabled: boolean;
      thresholds: {
        connectionCount: number;
        errorRate: number;
        latency: number;
      };
    };
  };
}

export interface EnhancedRateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (ws: AuthenticatedWebSocket) => string;
  onLimitReached?: (ws: AuthenticatedWebSocket) => void;
}

export interface WebSocketMessage {
  id: string;
  type: string;
  payload?: any;
  timestamp: number;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  compression?: boolean;
}

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  lastActivity?: Date;
  rateLimitCount?: number;
  rateLimitWindow?: number;
  deviceEventHandlers?: Map<string, (event: any) => void>;
  connectionId?: string;
  region?: string;
  subscriptions?: Set<string>;
  messageQueue?: WebSocketMessage[];
  performance?: {
    messagesReceived: number;
    messagesSent: number;
    averageLatency: number;
    lastLatency: number;
  };
}

export interface MessageQueue {
  messages: WebSocketMessage[];
  processing: boolean;
  lastProcessed: number;
}

export interface ConnectionPool {
  connections: Map<string, AuthenticatedWebSocket>;
  byRegion: Map<string, Set<string>>;
  byDevice: Map<string, Set<string>>;
  byUser: Map<string, Set<string>>;
}

export class EnhancedWebSocketServer extends EventEmitter {
  private wss: WSServer;
  private server: HttpServer;
  private config: EnhancedWebSocketServerConfig;
  private deviceManager: DeviceManager;
  private securityService: SecurityService;
  private rateLimitConfig: EnhancedRateLimitConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private monitoring: DefaultMonitoringService;
  private redis?: Redis;
  
  // Enhanced connection management
  private connectionPool: ConnectionPool;
  private messageQueues: Map<string, MessageQueue>;
  private pingIntervals: Map<WebSocket, NodeJS.Timeout>;
  
  // Performance optimization
  private batchProcessor?: NodeJS.Timeout;
  private compressionCache: Map<string, Buffer>;
  private routingTable: Map<string, string[]>;
  
  // Security enhancement
  private connectionCounts: Map<string, { count: number; window: number }>;
  private blacklistedIPs: Set<string>;
  
  // Monitoring and metrics
  private performanceMetrics: {
    totalConnections: number;
    activeConnections: number;
    messagesPerSecond: number;
    averageLatency: number;
    errorRate: number;
    uptime: number;
  };

  constructor(
    server: HttpServer,
    config: EnhancedWebSocketServerConfig,
    deviceManager: DeviceManager,
    securityService: SecurityService,
    rateLimitConfig: EnhancedRateLimitConfig
  ) {
    super();
    this.server = server;
    this.config = this.enhanceConfig(config);
    this.deviceManager = deviceManager;
    this.securityService = securityService;
    this.rateLimitConfig = rateLimitConfig;
    this.logger = Logger.getInstance();
    this.metrics = MetricsCollector.getInstance();
    this.monitoring = DefaultMonitoringService.getInstance(deviceManager);

    // Initialize enhanced components
    this.connectionPool = {
      connections: new Map(),
      byRegion: new Map(),
      byDevice: new Map(),
      byUser: new Map()
    };
    this.messageQueues = new Map();
    this.pingIntervals = new Map();
    this.compressionCache = new Map();
    this.routingTable = new Map();
    this.connectionCounts = new Map();
    this.blacklistedIPs = new Set();
    
    this.performanceMetrics = {
      totalConnections: 0,
      activeConnections: 0,
      messagesPerSecond: 0,
      averageLatency: 0,
      errorRate: 0,
      uptime: Date.now()
    };

    this.initializeEnhancedServer();
  }

  private enhanceConfig(config: EnhancedWebSocketServerConfig): EnhancedWebSocketServerConfig {
    return {
      ...config,
      clustering: {
        enabled: false,
        workers: cpus().length,
        ...config.clustering
      },
      performance: {
        messageQueueSize: 1000,
        batchProcessing: true,
        compressionEnabled: true,
        heartbeatOptimized: true,
        ...config.performance
      },
      security: {
        rateLimiting: {
          windowMs: 60000,
          maxRequests: 100,
          skipSuccessfulRequests: false,
          ...config.security?.rateLimiting
        },
        ddosProtection: {
          enabled: true,
          maxConnections: 10,
          connectionWindow: 60000,
          ...config.security?.ddosProtection
        },
        encryption: {
          enabled: true,
          algorithm: 'aes-256-gcm',
          ...config.security?.encryption
        },
        ...config.security
      },
      monitoring: {
        metricsEnabled: true,
        healthCheckEndpoint: '/health',
        alerting: {
          enabled: true,
          thresholds: {
            connectionCount: 1000,
            errorRate: 0.05,
            latency: 1000
          },
          ...config.monitoring?.alerting
        },
        ...config.monitoring
      }
    };
  }

  private async initializeEnhancedServer(): Promise<void> {
    // Initialize Redis for clustering if enabled
    if (this.config.clustering?.enabled && this.config.clustering.redisUrl) {
      this.redis = new Redis(this.config.clustering.redisUrl);
      await this.setupRedisSubscriptions();
    }

    // Register enhanced metrics
    this.registerEnhancedMetrics();

    // Initialize WebSocket server with enhanced configuration
    this.wss = new WSServer({
      server: this.server,
      path: this.config.path,
      verifyClient: this.enhancedVerifyClient.bind(this),
      perMessageDeflate: this.config.performance?.compressionEnabled ? {
        zlibDeflateOptions: {
          level: 6,
          chunkSize: 1024,
        },
        threshold: 1024,
        concurrencyLimit: 10,
        clientMaxNoContextTakeover: false,
        serverMaxNoContextTakeover: false,
        serverMaxWindowBits: 15,
        clientMaxWindowBits: 15,
      } : false
    });

    this.wss.on('connection', this.handleEnhancedConnection.bind(this));
    this.wss.on('error', this.handleServerError.bind(this));

    // Start enhanced batch processing
    if (this.config.performance?.batchProcessing) {
      this.startBatchProcessor();
    }

    // Start performance monitoring
    this.startPerformanceMonitoring();

    this.logger.info('Enhanced WebSocket server initialized', {
      path: this.config.path,
      maxConnections: this.config.maxConnections,
      clustering: this.config.clustering?.enabled,
      compression: this.config.performance?.compressionEnabled,
      monitoring: this.config.monitoring?.metricsEnabled
    });
  }

  private registerEnhancedMetrics(): void {
    this.metrics.registerStandardMetrics();
    
    // Register additional enhanced metrics
    this.metrics.registerMetric({
      name: 'websocket.connection_pool_size',
      type: MetricType.GAUGE,
      category: MetricCategory.WEBSOCKET,
      description: 'Size of WebSocket connection pool'
    });

    this.metrics.registerMetric({
      name: 'websocket.message_queue_size',
      type: MetricType.GAUGE,
      category: MetricCategory.WEBSOCKET,
      description: 'Total size of message queues'
    });

    this.metrics.registerMetric({
      name: 'websocket.compression_ratio',
      type: MetricType.HISTOGRAM,
      category: MetricCategory.PERFORMANCE,
      description: 'Message compression ratio',
      buckets: [0.1, 0.3, 0.5, 0.7, 0.9]
    });

    this.metrics.registerMetric({
      name: 'websocket.batch_processing_latency',
      type: MetricType.HISTOGRAM,
      category: MetricCategory.PERFORMANCE,
      description: 'Batch processing latency',
      buckets: [1, 5, 10, 25, 50, 100]
    });

    this.metrics.registerMetric({
      name: 'websocket.regional_distribution',
      type: MetricType.GAUGE,
      category: MetricCategory.WEBSOCKET,
      description: 'Connection distribution by region'
    });
  }

  private enhancedVerifyClient(info: any): boolean {
    try {
      const clientIP = this.getClientIP(info.req);
      
      // Check blacklisted IPs
      if (this.blacklistedIPs.has(clientIP)) {
        this.logger.warn('Connection rejected: blacklisted IP', { ip: clientIP });
        return false;
      }

      // Enhanced DDoS protection
      if (this.config.security?.ddosProtection.enabled) {
        if (!this.checkDDoSProtection(clientIP)) {
          return false;
        }
      }

      // Check global connection limits with more sophisticated logic
      if (this.config.maxConnections) {
        const activeConnections = this.connectionPool.connections.size;
        if (activeConnections >= this.config.maxConnections) {
          this.logger.warn('Connection rejected: max connections reached', {
            active: activeConnections,
            max: this.config.maxConnections
          });
          return false;
        }
      }

      // Enhanced token validation
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token') || info.req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('Connection rejected: no token provided', { ip: clientIP });
        this.metrics.recordMetric('security.auth_failures', 1, { reason: 'no_token' });
        return false;
      }

      // Verify JWT token with enhanced validation
      const decoded = jwt.verify(token, this.config.authSecret) as any;
      
      // Additional security checks
      if (decoded.exp && decoded.exp < Date.now() / 1000) {
        this.logger.warn('Connection rejected: expired token', { ip: clientIP });
        this.metrics.recordMetric('security.auth_failures', 1, { reason: 'expired_token' });
        return false;
      }

      // Store enhanced user info
      info.req.userId = decoded.userId;
      info.req.deviceId = decoded.deviceId;
      info.req.sessionId = decoded.sessionId;
      info.req.region = decoded.region || 'unknown';
      info.req.connectionId = this.generateConnectionId();

      return true;
    } catch (error) {
      this.logger.error('Enhanced WebSocket authentication failed', { error: error.message });
      this.metrics.recordMetric('security.auth_failures', 1, { reason: 'invalid_token' });
      return false;
    }
  }

  private checkDDoSProtection(clientIP: string): boolean {
    const now = Date.now();
    const protection = this.config.security!.ddosProtection;
    
    let connectionData = this.connectionCounts.get(clientIP);
    if (!connectionData) {
      connectionData = { count: 0, window: now };
      this.connectionCounts.set(clientIP, connectionData);
    }

    // Reset window if needed
    if (now - connectionData.window > protection.connectionWindow) {
      connectionData.window = now;
      connectionData.count = 0;
    }

    connectionData.count++;

    if (connectionData.count > protection.maxConnections) {
      this.logger.warn('DDoS protection triggered', {
        ip: clientIP,
        connections: connectionData.count,
        window: protection.connectionWindow
      });
      
      // Temporarily blacklist the IP
      this.blacklistedIPs.add(clientIP);
      setTimeout(() => {
        this.blacklistedIPs.delete(clientIP);
      }, protection.connectionWindow);
      
      this.metrics.recordMetric('security.ddos_blocks', 1, { ip: clientIP });
      return false;
    }

    return true;
  }

  private handleEnhancedConnection(ws: AuthenticatedWebSocket, request: any): void {
    // Set up enhanced authenticated connection
    ws.userId = request.userId;
    ws.deviceId = request.deviceId;
    ws.sessionId = request.sessionId;
    ws.connectionId = request.connectionId;
    ws.region = request.region;
    ws.lastActivity = new Date();
    ws.rateLimitCount = 0;
    ws.rateLimitWindow = Date.now();
    ws.deviceEventHandlers = new Map();
    ws.subscriptions = new Set();
    ws.messageQueue = [];
    ws.performance = {
      messagesReceived: 0,
      messagesSent: 0,
      averageLatency: 0,
      lastLatency: 0
    };

    // Add to enhanced connection pool
    this.addToConnectionPool(ws);

    // Initialize message queue
    this.messageQueues.set(ws.connectionId!, {
      messages: [],
      processing: false,
      lastProcessed: Date.now()
    });

    this.logger.info('Enhanced WebSocket client connected', {
      userId: ws.userId,
      deviceId: ws.deviceId,
      sessionId: ws.sessionId,
      connectionId: ws.connectionId,
      region: ws.region,
      totalConnections: this.connectionPool.connections.size
    });

    // Set up enhanced event handlers
    ws.on('message', (data: Buffer) => this.handleEnhancedMessage(ws, data));
    ws.on('close', (code: number, reason: Buffer) => this.handleEnhancedDisconnection(ws, code, reason));
    ws.on('error', (error: Error) => this.handleClientError(ws, error));
    ws.on('pong', () => this.handleEnhancedPong(ws));

    // Start optimized ping interval
    if (this.config.performance?.heartbeatOptimized) {
      this.startOptimizedPingInterval(ws);
    } else {
      this.startPingInterval(ws);
    }

    // Send enhanced welcome message
    this.sendEnhancedMessage(ws, {
      id: this.generateMessageId(),
      type: 'welcome',
      payload: {
        userId: ws.userId,
        deviceId: ws.deviceId,
        connectionId: ws.connectionId,
        region: ws.region,
        serverTime: new Date().toISOString(),
        serverVersion: '2.0.0',
        features: {
          compression: this.config.performance?.compressionEnabled,
          batchProcessing: this.config.performance?.batchProcessing,
          clustering: this.config.clustering?.enabled
        }
      },
      timestamp: Date.now(),
      priority: 'high'
    });

    // Update metrics
    this.performanceMetrics.totalConnections++;
    this.performanceMetrics.activeConnections++;
    this.metrics.recordMetric('websocket.connections', this.performanceMetrics.activeConnections);
    this.metrics.recordMetric('websocket.regional_distribution', 1, { region: ws.region! });

    this.emit('connection', ws);
  }

  private addToConnectionPool(ws: AuthenticatedWebSocket): void {
    const connectionId = ws.connectionId!;
    
    // Add to main pool
    this.connectionPool.connections.set(connectionId, ws);
    
    // Add to region index
    if (!this.connectionPool.byRegion.has(ws.region!)) {
      this.connectionPool.byRegion.set(ws.region!, new Set());
    }
    this.connectionPool.byRegion.get(ws.region!)!.add(connectionId);
    
    // Add to device index
    if (ws.deviceId) {
      if (!this.connectionPool.byDevice.has(ws.deviceId)) {
        this.connectionPool.byDevice.set(ws.deviceId, new Set());
      }
      this.connectionPool.byDevice.get(ws.deviceId)!.add(connectionId);
    }
    
    // Add to user index
    if (ws.userId) {
      if (!this.connectionPool.byUser.has(ws.userId)) {
        this.connectionPool.byUser.set(ws.userId, new Set());
      }
      this.connectionPool.byUser.get(ws.userId)!.add(connectionId);
    }
  }

  private async handleEnhancedMessage(ws: AuthenticatedWebSocket, data: Buffer): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Enhanced rate limiting check
      if (!this.checkEnhancedRateLimit(ws)) {
        this.sendError(ws, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
        this.metrics.recordMetric('security.rate_limits', 1, { userId: ws.userId! });
        return;
      }

      ws.lastActivity = new Date();
      ws.performance!.messagesReceived++;

      const message: WebSocketMessage = JSON.parse(data.toString());
      
      this.logger.debug('Enhanced WebSocket message received', {
        userId: ws.userId,
        connectionId: ws.connectionId,
        messageType: message.type,
        messageId: message.id,
        priority: message.priority || 'normal'
      });

      // Enhanced message processing with priority queuing
      if (this.config.performance?.batchProcessing && message.priority !== 'critical') {
        await this.queueMessage(ws, message);
      } else {
        await this.processMessage(ws, message);
      }

      // Update performance metrics
      const latency = Date.now() - startTime;
      ws.performance!.lastLatency = latency;
      ws.performance!.averageLatency = 
        (ws.performance!.averageLatency + latency) / 2;
      
      this.metrics.recordMetric('websocket.message_latency', latency, {
        type: message.type,
        priority: message.priority || 'normal'
      });
      
    } catch (error) {
      this.logger.error('Error handling enhanced WebSocket message', {
        userId: ws.userId,
        connectionId: ws.connectionId,
        error: error.message
      });
      
      this.sendError(ws, 'Invalid message format', 'INVALID_MESSAGE', undefined, error.message);
      this.metrics.recordMetric('websocket.errors', 1, { type: 'message_processing' });
    }
  }

  private checkEnhancedRateLimit(ws: AuthenticatedWebSocket): boolean {
    const now = Date.now();
    const config = this.config.security!.rateLimiting;
    
    // Initialize rate limit properties if not set
    if (ws.rateLimitWindow === undefined || ws.rateLimitCount === undefined) {
      ws.rateLimitWindow = now;
      ws.rateLimitCount = 0;
    }
    
    // Reset window if needed
    if (now - ws.rateLimitWindow > config.windowMs) {
      ws.rateLimitWindow = now;
      ws.rateLimitCount = 0;
    }

    ws.rateLimitCount++;
    
    const allowed = ws.rateLimitCount <= config.maxRequests;
    
    if (!allowed && this.rateLimitConfig.onLimitReached) {
      this.rateLimitConfig.onLimitReached(ws);
    }
    
    return allowed;
  }

  private async queueMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    const queue = this.messageQueues.get(ws.connectionId!);
    if (!queue) return;

    // Add message to queue with priority ordering
    const priority = message.priority || 'normal';
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    
    queue.messages.push(message);
    queue.messages.sort((a, b) => 
      priorityOrder[a.priority || 'normal'] - priorityOrder[b.priority || 'normal']
    );

    // Limit queue size
    if (queue.messages.length > this.config.performance!.messageQueueSize) {
      const dropped = queue.messages.splice(this.config.performance!.messageQueueSize);
      this.logger.warn('Message queue overflow, dropping messages', {
        connectionId: ws.connectionId,
        dropped: dropped.length
      });
      this.metrics.recordMetric('websocket.messages_dropped', dropped.length);
    }

    this.metrics.recordMetric('websocket.message_queue_size', queue.messages.length);
  }

  private async processMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    // Enhanced message routing with improved error handling
    switch (message.type) {
      case 'ping':
        await this.handlePing(ws, message);
        break;
      case 'device_command':
        await this.handleEnhancedDeviceCommand(ws, message);
        break;
      case 'device_status':
        await this.handleDeviceStatusRequest(ws, message);
        break;
      case 'subscribe_device':
        await this.handleEnhancedDeviceSubscription(ws, message);
        break;
      case 'unsubscribe_device':
        await this.handleDeviceUnsubscription(ws, message);
        break;
      case 'list_devices':
        await this.handleListDevices(ws, message);
        break;
      case 'get_performance_metrics':
        await this.handleGetPerformanceMetrics(ws, message);
        break;
      case 'join_room':
        await this.handleJoinRoom(ws, message);
        break;
      case 'leave_room':
        await this.handleLeaveRoom(ws, message);
        break;
      default:
        this.sendError(ws, `Unknown message type: ${message.type}`, 'UNKNOWN_MESSAGE_TYPE', message.id);
        this.metrics.recordMetric('websocket.unknown_messages', 1, { type: message.type });
    }
  }

  // Enhanced batch processor for improved performance
  private startBatchProcessor(): void {
    this.batchProcessor = setInterval(async () => {
      const startTime = Date.now();
      let totalProcessed = 0;
      
      for (const [connectionId, queue] of this.messageQueues) {
        if (queue.processing || queue.messages.length === 0) continue;
        
        queue.processing = true;
        const ws = this.connectionPool.connections.get(connectionId);
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          this.messageQueues.delete(connectionId);
          continue;
        }
        
        // Process up to 10 messages per batch
        const messagesToProcess = queue.messages.splice(0, 10);
        
        for (const message of messagesToProcess) {
          try {
            await this.processMessage(ws, message);
            totalProcessed++;
          } catch (error) {
            this.logger.error('Batch processing error', {
              connectionId,
              messageId: message.id,
              error: error.message
            });
          }
        }
        
        queue.processing = false;
        queue.lastProcessed = Date.now();
      }
      
      const processingTime = Date.now() - startTime;
      this.metrics.recordMetric('websocket.batch_processing_latency', processingTime);
      this.metrics.recordMetric('websocket.batch_messages_processed', totalProcessed);
      
    }, 100); // Process every 100ms
  }

  private startPerformanceMonitoring(): void {
    setInterval(() => {
      // Update performance metrics
      this.performanceMetrics.activeConnections = this.connectionPool.connections.size;
      
      // Calculate messages per second
      const totalMessages = Array.from(this.connectionPool.connections.values())
        .reduce((sum, ws) => sum + (ws.performance?.messagesReceived || 0), 0);
      
      this.performanceMetrics.messagesPerSecond = totalMessages / ((Date.now() - this.performanceMetrics.uptime) / 1000);
      
      // Calculate average latency across all connections
      const latencies = Array.from(this.connectionPool.connections.values())
        .map(ws => ws.performance?.averageLatency || 0)
        .filter(latency => latency > 0);
      
      this.performanceMetrics.averageLatency = latencies.length > 0 ?
        latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0;
      
      // Record enhanced metrics
      this.metrics.recordMetric('websocket.connection_pool_size', this.connectionPool.connections.size);
      this.metrics.recordMetric('websocket.messages_per_second', this.performanceMetrics.messagesPerSecond);
      this.metrics.recordMetric('websocket.average_latency', this.performanceMetrics.averageLatency);
      
      // Check alerting thresholds
      this.checkAlertingThresholds();
      
    }, 10000); // Every 10 seconds
  }

  private checkAlertingThresholds(): void {
    if (!this.config.monitoring?.alerting.enabled) return;
    
    const thresholds = this.config.monitoring.alerting.thresholds;
    
    // Check connection count
    if (this.performanceMetrics.activeConnections > thresholds.connectionCount) {
      this.emit('alert', {
        type: 'high_connection_count',
        severity: 'warning',
        message: `High connection count: ${this.performanceMetrics.activeConnections}`,
        timestamp: new Date()
      });
    }
    
    // Check average latency
    if (this.performanceMetrics.averageLatency > thresholds.latency) {
      this.emit('alert', {
        type: 'high_latency',
        severity: 'warning', 
        message: `High average latency: ${this.performanceMetrics.averageLatency}ms`,
        timestamp: new Date()
      });
    }
  }

  // Enhanced message sending with compression and queuing
  private sendEnhancedMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    try {
      let messageData = JSON.stringify(message);
      
      // Apply compression if enabled and message is large enough
      if (this.config.performance?.compressionEnabled && messageData.length > 1024) {
        const compressed = this.compressMessage(messageData);
        if (compressed.length < messageData.length * 0.8) { // Only use if 20%+ compression
          messageData = compressed.toString('base64');
          message.compression = true;
          
          const compressionRatio = compressed.length / messageData.length;
          this.metrics.recordMetric('websocket.compression_ratio', compressionRatio);
        }
      }
      
      ws.send(messageData);
      
      // Update performance metrics
      const authWs = ws as AuthenticatedWebSocket;
      if (authWs.performance) {
        authWs.performance.messagesSent++;
      }
      
    } catch (error) {
      this.logger.error('Failed to send enhanced message', {
        error: error.message,
        messageType: message.type,
        messageId: message.id
      });
      this.metrics.recordMetric('websocket.send_errors', 1);
    }
  }

  private compressMessage(data: string): Buffer {
    // Simple compression using gzip (in production, consider more sophisticated compression)
    const zlib = require('zlib');
    return zlib.gzipSync(Buffer.from(data));
  }

  private generateConnectionId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}-${process.pid}`)
      .digest('hex')
      .substring(0, 16);
  }

  private getClientIP(req: any): string {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }

  private startOptimizedPingInterval(ws: WebSocket): void {
    // Adaptive ping interval based on connection quality
    let pingInterval = this.config.pingInterval;
    let missedPings = 0;
    
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        
        // Adjust ping interval based on connection stability
        const timeout = setTimeout(() => {
          missedPings++;
          if (missedPings > 2) {
            pingInterval = Math.max(pingInterval / 2, 5000); // Increase frequency
          }
        }, this.config.pingTimeout);
        
        ws.once('pong', () => {
          clearTimeout(timeout);
          missedPings = 0;
          if (pingInterval < this.config.pingInterval) {
            pingInterval = Math.min(pingInterval * 1.1, this.config.pingInterval); // Gradually reduce frequency
          }
        });
      } else {
        clearInterval(interval);
        this.pingIntervals.delete(ws);
      }
    }, pingInterval);

    this.pingIntervals.set(ws, interval);
  }

  // Enhanced connection cleanup
  private handleEnhancedDisconnection(ws: AuthenticatedWebSocket, code: number, reason: Buffer): void {
    this.removeFromConnectionPool(ws);
    
    // Clear message queue
    if (ws.connectionId) {
      this.messageQueues.delete(ws.connectionId);
    }
    
    // Clear ping interval
    const pingInterval = this.pingIntervals.get(ws);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(ws);
    }
    
    // Clean up device event handlers
    if (ws.deviceEventHandlers) {
      for (const [deviceId, handler] of ws.deviceEventHandlers.entries()) {
        this.deviceManager.removeListener('deviceEvent', handler);
      }
      ws.deviceEventHandlers.clear();
    }

    // Update metrics
    this.performanceMetrics.activeConnections--;
    this.metrics.recordMetric('websocket.disconnections', 1, {
      code: code.toString(),
      region: ws.region || 'unknown'
    });

    this.logger.info('Enhanced WebSocket client disconnected', {
      userId: ws.userId,
      sessionId: ws.sessionId,
      connectionId: ws.connectionId,
      region: ws.region,
      code,
      reason: reason.toString(),
      activeConnections: this.performanceMetrics.activeConnections,
      performance: ws.performance
    });

    this.emit('disconnection', ws, code, reason);
  }

  private removeFromConnectionPool(ws: AuthenticatedWebSocket): void {
    const connectionId = ws.connectionId!;
    
    // Remove from main pool
    this.connectionPool.connections.delete(connectionId);
    
    // Remove from region index
    const regionSet = this.connectionPool.byRegion.get(ws.region!);
    if (regionSet) {
      regionSet.delete(connectionId);
      if (regionSet.size === 0) {
        this.connectionPool.byRegion.delete(ws.region!);
      }
    }
    
    // Remove from device index
    if (ws.deviceId) {
      const deviceSet = this.connectionPool.byDevice.get(ws.deviceId);
      if (deviceSet) {
        deviceSet.delete(connectionId);
        if (deviceSet.size === 0) {
          this.connectionPool.byDevice.delete(ws.deviceId);
        }
      }
    }
    
    // Remove from user index
    if (ws.userId) {
      const userSet = this.connectionPool.byUser.get(ws.userId);
      if (userSet) {
        userSet.delete(connectionId);
        if (userSet.size === 0) {
          this.connectionPool.byUser.delete(ws.userId);
        }
      }
    }
  }

  // Enhanced public methods
  public getPerformanceMetrics(): any {
    return {
      ...this.performanceMetrics,
      connectionPool: {
        total: this.connectionPool.connections.size,
        byRegion: Object.fromEntries(
          Array.from(this.connectionPool.byRegion.entries())
            .map(([region, connections]) => [region, connections.size])
        ),
        byDevice: this.connectionPool.byDevice.size,
        byUser: this.connectionPool.byUser.size
      },
      messageQueues: {
        total: this.messageQueues.size,
        totalMessages: Array.from(this.messageQueues.values())
          .reduce((sum, queue) => sum + queue.messages.length, 0)
      }
    };
  }

  public enhancedBroadcast(
    message: WebSocketMessage, 
    filter?: (ws: AuthenticatedWebSocket) => boolean,
    options?: { region?: string; priority?: 'low' | 'normal' | 'high' | 'critical' }
  ): void {
    let connections = Array.from(this.connectionPool.connections.values());
    
    // Apply region filter if specified
    if (options?.region) {
      const regionConnections = this.connectionPool.byRegion.get(options.region);
      if (regionConnections) {
        connections = connections.filter(ws => regionConnections.has(ws.connectionId!));
      } else {
        return; // No connections in specified region
      }
    }
    
    // Apply custom filter
    if (filter) {
      connections = connections.filter(filter);
    }
    
    // Set priority if specified
    if (options?.priority) {
      message.priority = options.priority;
    }
    
    // Send to all matching connections
    for (const ws of connections) {
      this.sendEnhancedMessage(ws, message);
    }
    
    this.metrics.recordMetric('websocket.broadcast_messages', connections.length, {
      region: options?.region || 'all',
      priority: options?.priority || 'normal'
    });
  }

  public async close(): Promise<void> {
    // Stop batch processor
    if (this.batchProcessor) {
      clearInterval(this.batchProcessor);
    }
    
    // Close Redis connection
    if (this.redis) {
      await this.redis.disconnect();
    }
    
    // Close WebSocket server
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.logger.info('Enhanced WebSocket server closed', {
          totalConnectionsServed: this.performanceMetrics.totalConnections,
          finalMetrics: this.performanceMetrics
        });
        resolve();
      });
    });
  }

  // Enhanced message handlers
  private async handlePing(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    this.sendEnhancedMessage(ws, {
      id: message.id,
      type: 'pong',
      payload: {
        timestamp: Date.now(),
        serverTime: new Date().toISOString()
      },
      timestamp: Date.now(),
      priority: 'high'
    });
  }

  private async handleEnhancedDeviceCommand(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    try {
      const { deviceId, command } = message.payload;

      // Enhanced device access validation
      if (ws.deviceId && ws.deviceId !== deviceId) {
        this.sendError(ws, 'Access denied to device', 'ACCESS_DENIED', message.id);
        this.metrics.recordMetric('security.access_denied', 1, { deviceId, userId: ws.userId! });
        return;
      }

      // Record command metrics
      this.metrics.recordMetric('device.commands', 1, { deviceId, command: command.type });

      const startTime = Date.now();
      await this.deviceManager.sendCommand(deviceId, command);
      const latency = Date.now() - startTime;

      this.sendEnhancedMessage(ws, {
        id: message.id,
        type: 'command_success',
        payload: { deviceId, command, latency },
        timestamp: Date.now(),
        priority: message.priority
      });

      this.metrics.recordMetric('device.latency', latency, { deviceId });
      this.logger.info('Device command executed', {
        userId: ws.userId,
        deviceId,
        command: command.type,
        latency
      });
    } catch (error) {
      this.metrics.recordMetric('device.errors', 1, { deviceId: message.payload.deviceId });
      this.sendError(ws, error.message, 'COMMAND_FAILED', message.id);
    }
  }

  private async handleDeviceStatusRequest(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    try {
      const { deviceId } = message.payload;
      const device = this.deviceManager.getDevice(deviceId);

      this.sendEnhancedMessage(ws, {
        id: message.id,
        type: 'device_status',
        payload: {
          deviceId,
          status: device.status,
          info: device.info,
          performance: {
            uptime: device.status.connected ? Date.now() - device.status.lastSeen.getTime() : 0,
            latency: ws.performance?.lastLatency || 0
          }
        },
        timestamp: Date.now(),
        priority: message.priority
      });
    } catch (error) {
      this.sendError(ws, error.message, 'STATUS_FAILED', message.id);
    }
  }

  private async handleEnhancedDeviceSubscription(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    const { deviceId } = message.payload;

    // Add to subscriptions
    ws.subscriptions!.add(deviceId);

    // Create enhanced event handler
    const handler = (event: any) => {
      if (event.deviceId === deviceId && ws.subscriptions!.has(deviceId)) {
        this.sendEnhancedMessage(ws, {
          id: this.generateMessageId(),
          type: 'device_event',
          payload: {
            ...event,
            subscription: deviceId,
            timestamp: Date.now()
          },
          timestamp: Date.now(),
          priority: event.priority || 'normal'
        });
      }
    };

    ws.deviceEventHandlers!.set(deviceId, handler);
    this.deviceManager.on('deviceEvent', handler);

    this.sendEnhancedMessage(ws, {
      id: message.id,
      type: 'subscription_success',
      payload: {
        deviceId,
        subscriptions: Array.from(ws.subscriptions!)
      },
      timestamp: Date.now(),
      priority: message.priority
    });

    this.metrics.recordMetric('websocket.subscriptions', 1, { deviceId });
  }

  private async handleDeviceUnsubscription(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    const { deviceId } = message.payload;

    // Remove from subscriptions
    ws.subscriptions!.delete(deviceId);

    // Remove event handler
    if (ws.deviceEventHandlers && ws.deviceEventHandlers.has(deviceId)) {
      const handler = ws.deviceEventHandlers.get(deviceId);
      if (handler) {
        this.deviceManager.removeListener('deviceEvent', handler);
        ws.deviceEventHandlers.delete(deviceId);
      }
    }

    this.sendEnhancedMessage(ws, {
      id: message.id,
      type: 'unsubscription_success',
      payload: {
        deviceId,
        subscriptions: Array.from(ws.subscriptions!)
      },
      timestamp: Date.now(),
      priority: message.priority
    });
  }

  private async handleListDevices(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    try {
      const devices = this.deviceManager.getAllDevices();
      const enhancedDevices = devices.map(device => ({
        ...device,
        performance: {
          connectedClients: this.connectionPool.byDevice.get(device.info.id)?.size || 0,
          averageLatency: 0 // Could calculate from device metrics
        }
      }));

      this.sendEnhancedMessage(ws, {
        id: message.id,
        type: 'device_list',
        payload: {
          devices: enhancedDevices,
          total: devices.length,
          connected: devices.filter(d => d.status.connected).length
        },
        timestamp: Date.now(),
        priority: message.priority
      });
    } catch (error) {
      this.sendError(ws, error.message, 'LIST_FAILED', message.id);
    }
  }

  private async handleGetPerformanceMetrics(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    const metrics = this.getPerformanceMetrics();

    this.sendEnhancedMessage(ws, {
      id: message.id,
      type: 'performance_metrics',
      payload: metrics,
      timestamp: Date.now(),
      priority: message.priority
    });
  }

  private async handleJoinRoom(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    const { room } = message.payload;

    // Add room to routing table
    if (!this.routingTable.has(room)) {
      this.routingTable.set(room, []);
    }

    const roomConnections = this.routingTable.get(room)!;
    if (!roomConnections.includes(ws.connectionId!)) {
      roomConnections.push(ws.connectionId!);
    }

    this.sendEnhancedMessage(ws, {
      id: message.id,
      type: 'room_joined',
      payload: {
        room,
        participants: roomConnections.length
      },
      timestamp: Date.now(),
      priority: message.priority
    });

    this.metrics.recordMetric('websocket.room_joins', 1, { room });
  }

  private async handleLeaveRoom(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    const { room } = message.payload;

    const roomConnections = this.routingTable.get(room);
    if (roomConnections) {
      const index = roomConnections.indexOf(ws.connectionId!);
      if (index !== -1) {
        roomConnections.splice(index, 1);
      }

      if (roomConnections.length === 0) {
        this.routingTable.delete(room);
      }
    }

    this.sendEnhancedMessage(ws, {
      id: message.id,
      type: 'room_left',
      payload: {
        room,
        participants: roomConnections?.length || 0
      },
      timestamp: Date.now(),
      priority: message.priority
    });
  }

  private handleEnhancedPong(ws: AuthenticatedWebSocket): void {
    ws.lastActivity = new Date();
    this.metrics.recordMetric('websocket.heartbeats', 1, { connectionId: ws.connectionId! });
  }

  private handleClientError(ws: AuthenticatedWebSocket, error: Error): void {
    this.logger.error('Enhanced WebSocket client error', {
      userId: ws.userId,
      sessionId: ws.sessionId,
      connectionId: ws.connectionId,
      error: error.message
    });

    this.metrics.recordMetric('websocket.client_errors', 1, {
      connectionId: ws.connectionId!,
      error: error.name
    });

    this.emit('clientError', ws, error);
  }

  private handleServerError(error: Error): void {
    this.logger.error('Enhanced WebSocket server error', { error: error.message });
    this.metrics.recordMetric('websocket.server_errors', 1, { error: error.name });
    this.emit('serverError', error);
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

  private sendError(ws: WebSocket, message: string, code: string, messageId?: string, details?: string): void {
    this.sendEnhancedMessage(ws, {
      id: messageId || this.generateMessageId(),
      type: 'error',
      payload: {
        message,
        code,
        details,
        timestamp: Date.now()
      },
      timestamp: Date.now(),
      priority: 'high'
    });
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Redis clustering support
  private async setupRedisSubscriptions(): Promise<void> {
    if (!this.redis) return;

    // Subscribe to cluster events
    await this.redis.subscribe('websocket:broadcast', 'websocket:metrics', 'websocket:alerts');

    this.redis.on('message', async (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);

        switch (channel) {
          case 'websocket:broadcast':
            this.handleClusterBroadcast(data);
            break;
          case 'websocket:metrics':
            this.handleClusterMetrics(data);
            break;
          case 'websocket:alerts':
            this.handleClusterAlert(data);
            break;
        }
      } catch (error) {
        this.logger.error('Redis message processing error', { channel, error: error.message });
      }
    });
  }

  private handleClusterBroadcast(data: any): void {
    // Handle broadcasts from other cluster nodes
    if (data.excludeNode !== process.pid) {
      this.enhancedBroadcast(data.message, data.filter, data.options);
    }
  }

  private handleClusterMetrics(data: any): void {
    // Aggregate metrics from other cluster nodes
    this.metrics.recordMetric('cluster.node_metrics', 1, {
      sourceNode: data.nodeId,
      metric: data.metric
    });
  }

  private handleClusterAlert(data: any): void {
    // Handle alerts from other cluster nodes
    this.emit('clusterAlert', data);
  }

  // Enhanced public API methods
  public broadcastToRegion(region: string, message: WebSocketMessage): void {
    this.enhancedBroadcast(message, undefined, { region });
  }

  public broadcastToDevice(deviceId: string, message: WebSocketMessage): void {
    const deviceConnections = this.connectionPool.byDevice.get(deviceId);
    if (!deviceConnections) return;

    for (const connectionId of deviceConnections) {
      const ws = this.connectionPool.connections.get(connectionId);
      if (ws) {
        this.sendEnhancedMessage(ws, message);
      }
    }
  }

  public broadcastToUser(userId: string, message: WebSocketMessage): void {
    const userConnections = this.connectionPool.byUser.get(userId);
    if (!userConnections) return;

    for (const connectionId of userConnections) {
      const ws = this.connectionPool.connections.get(connectionId);
      if (ws) {
        this.sendEnhancedMessage(ws, message);
      }
    }
  }

  public broadcastToRoom(room: string, message: WebSocketMessage): void {
    const roomConnections = this.routingTable.get(room);
    if (!roomConnections) return;

    for (const connectionId of roomConnections) {
      const ws = this.connectionPool.connections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendEnhancedMessage(ws, message);
      }
    }
  }

  public getConnectedClients(): AuthenticatedWebSocket[] {
    return Array.from(this.connectionPool.connections.values());
  }

  public getClientCount(): number {
    return this.connectionPool.connections.size;
  }

  public getClientsByRegion(region: string): AuthenticatedWebSocket[] {
    const connectionIds = this.connectionPool.byRegion.get(region);
    if (!connectionIds) return [];

    return Array.from(connectionIds)
      .map(id => this.connectionPool.connections.get(id))
      .filter(ws => ws !== undefined) as AuthenticatedWebSocket[];
  }

  public disconnectClient(userId: string, sessionId: string): void {
    const userConnections = this.connectionPool.byUser.get(userId);
    if (!userConnections) return;

    for (const connectionId of userConnections) {
      const ws = this.connectionPool.connections.get(connectionId);
      if (ws && ws.sessionId === sessionId) {
        ws.close(1000, 'Disconnected by server');
        break;
      }
    }
  }

  public getHealthStatus(): any {
    return {
      status: 'healthy',
      timestamp: new Date(),
      metrics: this.performanceMetrics,
      connectionPool: {
        total: this.connectionPool.connections.size,
        regions: this.connectionPool.byRegion.size,
        devices: this.connectionPool.byDevice.size,
        users: this.connectionPool.byUser.size
      },
      messageQueues: {
        total: this.messageQueues.size,
        totalMessages: Array.from(this.messageQueues.values())
          .reduce((sum, queue) => sum + queue.messages.length, 0)
      },
      clustering: {
        enabled: this.config.clustering?.enabled || false,
        redisConnected: this.redis?.status === 'ready'
      }
    };
  }
}