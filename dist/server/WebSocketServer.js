"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const ws_1 = require("ws");
const events_1 = require("events");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Logger_1 = require("../utils/Logger");
const url_1 = require("url");
class WebSocketServer extends events_1.EventEmitter {
    constructor(server, config, deviceManager, securityService, rateLimitConfig) {
        super();
        this.server = server;
        this.config = config;
        this.deviceManager = deviceManager;
        this.securityService = securityService;
        this.rateLimitConfig = rateLimitConfig;
        this.logger = Logger_1.Logger.getInstance();
        this.clients = new Map();
        this.pingIntervals = new Map();
        this.initializeWebSocketServer();
    }
    initializeWebSocketServer() {
        this.wss = new ws_1.WebSocketServer({
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
    verifyClient(info) {
        try {
            // Check connection limits
            if (this.config.maxConnections && this.wss.clients.size >= this.config.maxConnections) {
                this.logger.warn('WebSocket connection rejected: max connections reached');
                return false;
            }
            // Extract token from query parameters or headers
            const url = new url_1.URL(info.req.url, `http://${info.req.headers.host}`);
            const token = url.searchParams.get('token') || info.req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                this.logger.warn('WebSocket connection rejected: no token provided');
                return false;
            }
            // Verify JWT token
            const decoded = jsonwebtoken_1.default.verify(token, this.config.authSecret);
            // Store user info for later use
            info.req.userId = decoded.userId;
            info.req.deviceId = decoded.deviceId;
            info.req.sessionId = decoded.sessionId;
            return true;
        }
        catch (error) {
            this.logger.error('WebSocket authentication failed', { error: error.message });
            return false;
        }
    }
    handleConnection(ws, request) {
        // Set up authenticated connection
        ws.userId = request.userId;
        ws.deviceId = request.deviceId;
        ws.sessionId = request.sessionId;
        ws.lastActivity = new Date();
        ws.rateLimitCount = 0;
        ws.rateLimitWindow = Date.now();
        ws.deviceEventHandlers = new Map();
        const clientId = `${ws.userId}-${ws.sessionId}`;
        this.clients.set(clientId, ws);
        this.logger.info('WebSocket client connected', {
            userId: ws.userId,
            deviceId: ws.deviceId,
            sessionId: ws.sessionId,
            clientsCount: this.clients.size
        });
        // Set up event handlers
        ws.on('message', (data) => this.handleMessage(ws, data));
        ws.on('close', (code, reason) => this.handleDisconnection(ws, code, reason));
        ws.on('error', (error) => this.handleClientError(ws, error));
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
    async handleMessage(ws, data) {
        try {
            // Check rate limiting
            if (!this.checkRateLimit(ws)) {
                this.sendError(ws, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
                return;
            }
            ws.lastActivity = new Date();
            const message = JSON.parse(data.toString());
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
        }
        catch (error) {
            this.logger.error('Error handling WebSocket message', {
                userId: ws.userId,
                error: error.message
            });
            this.sendError(ws, 'Invalid message format', 'INVALID_MESSAGE', undefined, error.message);
        }
    }
    checkRateLimit(ws) {
        const now = Date.now();
        // Initialize rate limit properties if not set
        if (ws.rateLimitWindow === undefined || ws.rateLimitCount === undefined) {
            ws.rateLimitWindow = now;
            ws.rateLimitCount = 0;
        }
        // Reset window if needed
        if (now - ws.rateLimitWindow > this.rateLimitConfig.windowMs) {
            ws.rateLimitWindow = now;
            ws.rateLimitCount = 0;
        }
        ws.rateLimitCount++;
        return ws.rateLimitCount <= this.rateLimitConfig.max;
    }
    async handlePing(ws, message) {
        this.sendMessage(ws, {
            id: message.id,
            type: 'pong',
            payload: { timestamp: Date.now() },
            timestamp: Date.now()
        });
    }
    async handleDeviceCommand(ws, message) {
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
        }
        catch (error) {
            this.sendError(ws, error.message, 'COMMAND_FAILED', message.id);
        }
    }
    async handleDeviceStatusRequest(ws, message) {
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
        }
        catch (error) {
            this.sendError(ws, error.message, 'STATUS_FAILED', message.id);
        }
    }
    async handleDeviceSubscription(ws, message) {
        const { deviceId } = message.payload;
        // Create event handler
        const handler = (event) => {
            if (event.deviceId === deviceId) {
                this.sendMessage(ws, {
                    id: this.generateMessageId(),
                    type: 'device_event',
                    payload: event,
                    timestamp: Date.now()
                });
            }
        };
        // Store handler reference for cleanup
        if (ws.deviceEventHandlers) {
            ws.deviceEventHandlers.set(deviceId, handler);
        }
        // Subscribe to device events
        this.deviceManager.on('deviceEvent', handler);
        this.sendMessage(ws, {
            id: message.id,
            type: 'subscription_success',
            payload: { deviceId },
            timestamp: Date.now()
        });
    }
    async handleDeviceUnsubscription(ws, message) {
        const { deviceId } = message.payload;
        // Remove specific listener if it exists
        if (ws.deviceEventHandlers && ws.deviceEventHandlers.has(deviceId)) {
            const handler = ws.deviceEventHandlers.get(deviceId);
            if (handler) {
                this.deviceManager.removeListener('deviceEvent', handler);
                ws.deviceEventHandlers.delete(deviceId);
            }
        }
        this.sendMessage(ws, {
            id: message.id,
            type: 'unsubscription_success',
            payload: { deviceId },
            timestamp: Date.now()
        });
    }
    async handleListDevices(ws, message) {
        try {
            const devices = this.deviceManager.getAllDevices();
            this.sendMessage(ws, {
                id: message.id,
                type: 'device_list',
                payload: { devices },
                timestamp: Date.now()
            });
        }
        catch (error) {
            this.sendError(ws, error.message, 'LIST_FAILED', message.id);
        }
    }
    handleDisconnection(ws, code, reason) {
        const clientId = `${ws.userId}-${ws.sessionId}`;
        this.clients.delete(clientId);
        // Clear ping interval
        const pingInterval = this.pingIntervals.get(ws);
        if (pingInterval) {
            clearInterval(pingInterval);
            this.pingIntervals.delete(ws);
        }
        // Clean up device event handlers to prevent memory leaks
        if (ws.deviceEventHandlers) {
            for (const [deviceId, handler] of ws.deviceEventHandlers.entries()) {
                this.deviceManager.removeListener('deviceEvent', handler);
            }
            ws.deviceEventHandlers.clear();
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
    handleClientError(ws, error) {
        this.logger.error('WebSocket client error', {
            userId: ws.userId,
            sessionId: ws.sessionId,
            error: error.message
        });
        this.emit('clientError', ws, error);
    }
    handleServerError(error) {
        this.logger.error('WebSocket server error', { error: error.message });
        this.emit('serverError', error);
    }
    handlePong(ws) {
        ws.lastActivity = new Date();
    }
    startPingInterval(ws) {
        const interval = setInterval(() => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.ping();
            }
            else {
                clearInterval(interval);
                this.pingIntervals.delete(ws);
            }
        }, this.config.pingInterval);
        this.pingIntervals.set(ws, interval);
    }
    sendMessage(ws, message) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    sendError(ws, message, code, messageId, details) {
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
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // Public methods
    broadcast(message, filter) {
        this.clients.forEach((ws) => {
            if (!filter || filter(ws)) {
                this.sendMessage(ws, message);
            }
        });
    }
    broadcastToDevice(deviceId, message) {
        this.broadcast(message, (ws) => ws.deviceId === deviceId);
    }
    broadcastToUser(userId, message) {
        this.broadcast(message, (ws) => ws.userId === userId);
    }
    getConnectedClients() {
        return Array.from(this.clients.values());
    }
    getClientCount() {
        return this.clients.size;
    }
    disconnectClient(userId, sessionId) {
        const clientId = `${userId}-${sessionId}`;
        const ws = this.clients.get(clientId);
        if (ws) {
            ws.close(1000, 'Disconnected by server');
        }
    }
    close() {
        return new Promise((resolve) => {
            this.wss.close(() => {
                this.logger.info('WebSocket server closed');
                resolve();
            });
        });
    }
}
exports.WebSocketServer = WebSocketServer;
//# sourceMappingURL=WebSocketServer.js.map