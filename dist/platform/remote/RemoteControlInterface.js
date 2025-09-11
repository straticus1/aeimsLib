"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteControlInterface = void 0;
const events_1 = require("events");
/**
 * Remote Control Interface
 * Provides remote device control and management capabilities
 */
class RemoteControlInterface extends events_1.EventEmitter {
    constructor(deviceManager, security, telemetry, options = {}) {
        super();
        this.deviceManager = deviceManager;
        this.security = security;
        this.telemetry = telemetry;
        this.ws = null;
        this.connected = false;
        this.pendingCommands = new Map();
        this.options = this.initializeOptions(options);
        this.setupEventHandlers();
    }
    /**
     * Connect to remote control server
     */
    async connect() {
        if (this.connected) {
            throw new Error('Already connected');
        }
        // Create WebSocket connection
        this.ws = new WebSocket(this.options.websocketUrl);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 10000);
            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.connected = true;
                this.startHeartbeat();
                resolve();
                // Track connection
                this.telemetry.track({
                    type: 'remote_control_connected',
                    timestamp: Date.now(),
                    data: {
                        url: this.options.websocketUrl
                    }
                });
            };
            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                reject(error);
            };
            this.ws.onclose = () => {
                this.handleDisconnect();
            };
            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };
        });
    }
    /**
     * Disconnect from remote control server
     */
    async disconnect() {
        if (!this.connected)
            return;
        this.connected = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        // Track disconnection
        await this.telemetry.track({
            type: 'remote_control_disconnected',
            timestamp: Date.now()
        });
    }
    /**
     * Execute remote command
     */
    async executeCommand(command) {
        if (!this.connected) {
            throw new Error('Not connected');
        }
        // Generate command ID and timestamp
        const id = this.generateCommandId();
        const timestamp = Date.now();
        const fullCommand = {
            id,
            timestamp,
            ...command
        };
        // Add signature if required
        if (this.options.verifySignatures) {
            fullCommand.signature = await this.signCommand(fullCommand);
        }
        // Send command
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingCommands.delete(id);
                reject(new Error('Command timeout'));
            }, this.options.commandTimeout);
            this.pendingCommands.set(id, {
                command: fullCommand,
                resolve,
                reject,
                timestamp
            });
            this.sendMessage({
                type: 'command',
                data: fullCommand
            });
            // Track command
            this.telemetry.track({
                type: 'remote_control_command',
                timestamp,
                data: {
                    commandId: id,
                    commandType: command.type,
                    target: command.target
                }
            });
        });
    }
    /**
     * Query device status
     */
    async queryDevice(deviceId) {
        return this.executeCommand({
            type: 'query',
            target: { deviceId },
            params: {}
        });
    }
    /**
     * Start pattern playback
     */
    async startPattern(deviceId, patternName, options = {}) {
        return this.executeCommand({
            type: 'pattern',
            target: { deviceId },
            params: {
                action: 'start',
                pattern: patternName,
                options
            }
        });
    }
    /**
     * Stop pattern playback
     */
    async stopPattern(deviceId) {
        return this.executeCommand({
            type: 'pattern',
            target: { deviceId },
            params: {
                action: 'stop'
            }
        });
    }
    initializeOptions(options) {
        return {
            websocketUrl: options.websocketUrl || 'ws://localhost:8080',
            heartbeatInterval: options.heartbeatInterval || 30000,
            reconnectDelay: options.reconnectDelay || 5000,
            commandTimeout: options.commandTimeout || 10000,
            maxRetries: options.maxRetries || 3,
            batchSize: options.batchSize || 10,
            requireAuth: options.requireAuth || true,
            encryptCommands: options.encryptCommands || true,
            verifySignatures: options.verifySignatures || true
        };
    }
    setupEventHandlers() {
        // Handle device events
        this.deviceManager.on('deviceConnected', async (device) => {
            await this.broadcastDeviceEvent('device_connected', device);
        });
        this.deviceManager.on('deviceDisconnected', async (device) => {
            await this.broadcastDeviceEvent('device_disconnected', device);
        });
        this.deviceManager.on('deviceError', async (device, error) => {
            await this.broadcastDeviceEvent('device_error', device, error);
        });
        // Clean up pending commands periodically
        setInterval(() => {
            this.cleanupPendingCommands();
        }, 60000);
    }
    startHeartbeat() {
        setInterval(() => {
            if (this.connected && this.ws) {
                this.sendMessage({
                    type: 'heartbeat',
                    data: {
                        timestamp: Date.now()
                    }
                });
            }
        }, this.options.heartbeatInterval);
    }
    async handleMessage(data) {
        try {
            const message = JSON.parse(data);
            switch (message.type) {
                case 'response':
                    this.handleCommandResponse(message.data);
                    break;
                case 'event':
                    this.handleRemoteEvent(message.data);
                    break;
                case 'heartbeat':
                    // Process heartbeat
                    break;
                default:
                    console.warn('Unknown message type:', message.type);
            }
        }
        catch (error) {
            console.error('Failed to handle message:', error);
            // Track error
            await this.telemetry.track({
                type: 'remote_control_message_error',
                timestamp: Date.now(),
                data: {
                    error: error.message,
                    data
                }
            });
        }
    }
    handleCommandResponse(response) {
        const pending = this.pendingCommands.get(response.commandId);
        if (!pending)
            return;
        this.pendingCommands.delete(response.commandId);
        if (response.status === 'success') {
            pending.resolve(response.data);
        }
        else {
            pending.reject(new Error(response.error?.message || 'Command failed'));
        }
        // Track response
        this.telemetry.track({
            type: 'remote_control_response',
            timestamp: Date.now(),
            data: {
                commandId: response.commandId,
                status: response.status,
                latency: Date.now() - pending.timestamp
            }
        });
    }
    async handleRemoteEvent(event) {
        // Process remote events
        this.emit('remote_event', event);
        // Track significant events
        if (this.isSignificantEvent(event)) {
            await this.telemetry.track({
                type: 'remote_control_event',
                timestamp: Date.now(),
                data: event
            });
        }
    }
    handleDisconnect() {
        this.connected = false;
        // Reject pending commands
        for (const [id, pending] of this.pendingCommands) {
            pending.reject(new Error('Connection lost'));
            this.pendingCommands.delete(id);
        }
        // Attempt reconnection
        setTimeout(() => {
            if (!this.connected) {
                this.connect().catch(console.error);
            }
        }, this.options.reconnectDelay);
    }
    async broadcastDeviceEvent(type, device, data = {}) {
        if (!this.connected)
            return;
        this.sendMessage({
            type: 'event',
            data: {
                type,
                device: {
                    id: device.id,
                    type: device.type
                },
                data,
                timestamp: Date.now()
            }
        });
    }
    sendMessage(message) {
        if (!this.connected || !this.ws)
            return;
        // Encrypt message if needed
        const data = this.options.encryptCommands ?
            this.encryptMessage(message) :
            JSON.stringify(message);
        this.ws.send(data);
    }
    encryptMessage(message) {
        // Implement message encryption
        // This is a placeholder - real implementation would use SecurityService
        return JSON.stringify(message);
    }
    async signCommand(command) {
        // Implement command signing
        // This is a placeholder - real implementation would use SecurityService
        return '';
    }
    generateCommandId() {
        return `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    cleanupPendingCommands() {
        const now = Date.now();
        for (const [id, pending] of this.pendingCommands) {
            if (now - pending.timestamp > this.options.commandTimeout) {
                pending.reject(new Error('Command timeout'));
                this.pendingCommands.delete(id);
            }
        }
    }
    isSignificantEvent(event) {
        return (event.type === 'error' ||
            event.type.startsWith('device_') ||
            event.type.startsWith('session_') ||
            event.type.startsWith('pattern_'));
    }
}
exports.RemoteControlInterface = RemoteControlInterface;
//# sourceMappingURL=RemoteControlInterface.js.map