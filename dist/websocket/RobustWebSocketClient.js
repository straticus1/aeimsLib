"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RobustWebSocketClient = exports.WebSocketEvent = void 0;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const Logger_1 = __importDefault(require("../utils/Logger"));
var WebSocketEvent;
(function (WebSocketEvent) {
    WebSocketEvent["CONNECTING"] = "connecting";
    WebSocketEvent["CONNECTED"] = "connected";
    WebSocketEvent["DISCONNECTED"] = "disconnected";
    WebSocketEvent["RECONNECTING"] = "reconnecting";
    WebSocketEvent["MESSAGE"] = "message";
    WebSocketEvent["ERROR"] = "error";
    WebSocketEvent["HEARTBEAT"] = "heartbeat";
    WebSocketEvent["STATE_CHANGE"] = "stateChange";
})(WebSocketEvent || (exports.WebSocketEvent = WebSocketEvent = {}));
class RobustWebSocketClient extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.ws = null;
        this.reconnectTimeout = null;
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;
        this.config = {
            ...config,
            reconnect: {
                enabled: true,
                initialDelay: 1000,
                maxDelay: 30000,
                maxAttempts: 10,
                ...config.reconnect
            },
            heartbeat: {
                enabled: true,
                interval: 30000,
                timeout: 5000,
                ...config.heartbeat
            }
        };
        this.state = {
            connected: false,
            connecting: false,
            reconnecting: false,
            lastConnected: null,
            lastError: null,
            reconnectAttempts: 0,
            heartbeatMissed: 0
        };
        this.logger = Logger_1.default.getInstance();
    }
    async connect() {
        if (this.ws?.readyState === ws_1.default.OPEN ||
            this.ws?.readyState === ws_1.default.CONNECTING) {
            return;
        }
        this.updateState({ connecting: true });
        this.emit(WebSocketEvent.CONNECTING);
        try {
            // Get authentication token if security is configured
            const headers = { ...this.config.headers };
            if (this.config.security) {
                const token = await this.config.security.tokenProvider();
                headers.Authorization = `Bearer ${token}`;
            }
            // Create WebSocket connection
            this.ws = new ws_1.default(this.config.url, this.config.protocols, {
                headers
            });
            // Set up event handlers
            this.setupEventHandlers();
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    setupEventHandlers() {
        if (!this.ws)
            return;
        this.ws.on('open', () => {
            this.handleConnect();
        });
        this.ws.on('close', () => {
            this.handleDisconnect();
        });
        this.ws.on('message', (data) => {
            this.handleMessage(data);
        });
        this.ws.on('error', (error) => {
            this.handleError(error);
        });
        this.ws.on('ping', () => {
            this.handleHeartbeat();
        });
        this.ws.on('pong', () => {
            this.handleHeartbeat();
        });
    }
    handleConnect() {
        this.updateState({
            connected: true,
            connecting: false,
            reconnecting: false,
            lastConnected: new Date(),
            reconnectAttempts: 0,
            heartbeatMissed: 0
        });
        // Start heartbeat if enabled
        if (this.config.heartbeat.enabled) {
            this.startHeartbeat();
        }
        this.emit(WebSocketEvent.CONNECTED);
    }
    handleDisconnect() {
        const wasConnected = this.state.connected;
        this.updateState({
            connected: false,
            connecting: false
        });
        this.stopHeartbeat();
        if (wasConnected) {
            this.emit(WebSocketEvent.DISCONNECTED);
        }
        // Attempt reconnection if enabled
        if (this.config.reconnect.enabled &&
            this.state.reconnectAttempts < this.config.reconnect.maxAttempts) {
            this.scheduleReconnect();
        }
    }
    handleMessage(data) {
        try {
            // Reset heartbeat counter on any message
            this.state.heartbeatMissed = 0;
            // Parse and emit message
            const message = this.parseMessage(data);
            this.emit(WebSocketEvent.MESSAGE, message);
        }
        catch (error) {
            this.logger.error('Error handling message', { error });
            this.emit(WebSocketEvent.ERROR, error);
        }
    }
    handleError(error) {
        this.updateState({
            lastError: error
        });
        this.logger.error('WebSocket error', { error });
        this.emit(WebSocketEvent.ERROR, error);
    }
    handleHeartbeat() {
        this.state.heartbeatMissed = 0;
        this.emit(WebSocketEvent.HEARTBEAT);
        // Clear existing timeout and set new one
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
        }
        this.heartbeatTimeout = setTimeout(() => {
            this.handleHeartbeatTimeout();
        }, this.config.heartbeat.timeout);
    }
    handleHeartbeatTimeout() {
        this.state.heartbeatMissed++;
        if (this.state.heartbeatMissed >= 2) {
            this.logger.warn('Multiple heartbeats missed, reconnecting');
            this.reconnect();
        }
    }
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.heartbeatInterval = setInterval(() => {
            if (this.ws?.readyState === ws_1.default.OPEN) {
                this.ws.ping();
            }
        }, this.config.heartbeat.interval);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        const delay = Math.min(this.config.reconnect.initialDelay * Math.pow(2, this.state.reconnectAttempts), this.config.reconnect.maxDelay);
        this.updateState({
            reconnecting: true,
            reconnectAttempts: this.state.reconnectAttempts + 1
        });
        this.emit(WebSocketEvent.RECONNECTING, {
            attempt: this.state.reconnectAttempts,
            delay
        });
        this.reconnectTimeout = setTimeout(() => {
            this.reconnect();
        }, delay);
    }
    async reconnect() {
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
        try {
            await this.connect();
        }
        catch (error) {
            this.handleError(error);
        }
    }
    send(data) {
        if (!this.isConnected()) {
            throw new Error('WebSocket is not connected');
        }
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.ws.send(message);
    }
    close() {
        this.config.reconnect.enabled = false; // Disable reconnection
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
        }
    }
    isConnected() {
        return this.state.connected && this.ws?.readyState === ws_1.default.OPEN;
    }
    getState() {
        return { ...this.state };
    }
    updateState(updates) {
        const previousState = { ...this.state };
        this.state = { ...this.state, ...updates };
        if (JSON.stringify(previousState) !== JSON.stringify(this.state)) {
            this.emit(WebSocketEvent.STATE_CHANGE, this.state);
        }
    }
    parseMessage(data) {
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            }
            catch {
                return data;
            }
        }
        return data;
    }
}
exports.RobustWebSocketClient = RobustWebSocketClient;
//# sourceMappingURL=RobustWebSocketClient.js.map