"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceSimulator = void 0;
exports.createSimulatedDevice = createSimulatedDevice;
const events_1 = require("events");
const monitoring_1 = require("../../monitoring");
/**
 * Simulated Device Implementation
 */
class DeviceSimulator extends events_1.EventEmitter {
    constructor(info, config = {}) {
        super();
        this.info = info;
        this.updateInterval = null;
        this.monitor = new monitoring_1.DeviceMonitoring(info.id);
        // Set default config
        this.config = {
            connectionDelay: config.connectionDelay || 500,
            randomDisconnects: config.randomDisconnects || false,
            disconnectProbability: config.disconnectProbability || 0.01,
            commandDelay: config.commandDelay || 100,
            commandFailureRate: config.commandFailureRate || 0.05,
            errorTypes: config.errorTypes || ['timeout', 'invalid_command', 'device_busy'],
            batteryLevel: config.batteryLevel || 100,
            batteryDrainRate: config.batteryDrainRate || 0.001,
            supportedCommands: config.supportedCommands || ['vibrate', 'rotate', 'stop'],
            featureFlags: config.featureFlags || {},
            latencyRange: config.latencyRange || [20, 200],
            packetLossRate: config.packetLossRate || 0.01,
            jitterRange: config.jitterRange || [0, 50]
        };
        // Initialize state
        this.state = {
            connected: false,
            batteryLevel: this.config.batteryLevel,
            commandHistory: [],
            errors: [],
            metrics: {
                commandsReceived: 0,
                commandsSucceeded: 0,
                commandsFailed: 0,
                totalLatency: 0,
                disconnections: 0
            }
        };
        // Initialize network simulation
        this.networkConditions = {
            currentLatency: this.getRandomInRange(this.config.latencyRange),
            currentJitter: this.getRandomInRange(this.config.jitterRange),
            packetLossCounter: 0
        };
    }
    /**
     * Connect to the simulated device
     */
    async connect() {
        if (this.state.connected) {
            return;
        }
        await this.simulateNetworkDelay();
        if (this.shouldSimulatePacketLoss()) {
            throw new Error('Connection failed due to packet loss');
        }
        this.state.connected = true;
        this.startStateUpdates();
        this.monitor.onConnect();
        this.emit('connected');
    }
    /**
     * Disconnect from the simulated device
     */
    async disconnect() {
        if (!this.state.connected) {
            return;
        }
        await this.simulateNetworkDelay();
        this.state.connected = false;
        this.stopStateUpdates();
        this.monitor.onDisconnect();
        this.emit('disconnected');
    }
    /**
     * Check connection status
     */
    isConnected() {
        return this.state.connected;
    }
    /**
     * Send command to the simulated device
     */
    async sendCommand(command) {
        if (!this.state.connected) {
            throw new Error('Device not connected');
        }
        this.state.metrics.commandsReceived++;
        this.state.commandHistory.push(command);
        this.state.lastCommand = command;
        // Validate command
        if (!this.config.supportedCommands.includes(command.type)) {
            this.handleCommandError(new Error(`Unsupported command: ${command.type}`));
            return;
        }
        try {
            const startTime = Date.now();
            this.monitor.onCommandStart(command.type);
            // Simulate command execution
            await this.simulateCommandExecution(command);
            const duration = Date.now() - startTime;
            this.state.metrics.commandsSucceeded++;
            this.state.metrics.totalLatency += duration;
            this.monitor.onCommandComplete(command.type, duration, true);
            // Emit state update
            this.emit('stateChanged', this.getDeviceState());
        }
        catch (error) {
            this.handleCommandError(error);
        }
    }
    /**
     * Get current device state
     */
    getDeviceState() {
        return { ...this.state };
    }
    /**
     * Update simulator configuration
     */
    updateConfig(config) {
        Object.assign(this.config, config);
        this.emit('configChanged', this.config);
    }
    /**
     * Reset simulator state
     */
    reset() {
        this.state = {
            connected: false,
            batteryLevel: this.config.batteryLevel,
            commandHistory: [],
            errors: [],
            metrics: {
                commandsReceived: 0,
                commandsSucceeded: 0,
                commandsFailed: 0,
                totalLatency: 0,
                disconnections: 0
            }
        };
        this.stopStateUpdates();
        this.emit('reset');
    }
    startStateUpdates() {
        if (this.updateInterval)
            return;
        this.updateInterval = setInterval(() => {
            // Update battery level
            this.state.batteryLevel = Math.max(0, this.state.batteryLevel - this.config.batteryDrainRate);
            // Simulate random disconnects
            if (this.config.randomDisconnects &&
                Math.random() < this.config.disconnectProbability) {
                this.disconnect();
                this.state.metrics.disconnections++;
            }
            // Update network conditions
            this.networkConditions.currentLatency = this.getRandomInRange(this.config.latencyRange);
            this.networkConditions.currentJitter = this.getRandomInRange(this.config.jitterRange);
            this.emit('stateChanged', this.getDeviceState());
        }, 1000);
    }
    stopStateUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    async simulateCommandExecution(command) {
        await this.simulateNetworkDelay();
        if (this.shouldSimulatePacketLoss()) {
            throw new Error('Command failed due to packet loss');
        }
        // Simulate command failure
        if (Math.random() < this.config.commandFailureRate) {
            const errorType = this.getRandomError();
            throw new Error(errorType);
        }
        // Simulate command delay
        await new Promise(resolve => setTimeout(resolve, this.config.commandDelay));
    }
    async simulateNetworkDelay() {
        const delay = this.networkConditions.currentLatency +
            (Math.random() * this.networkConditions.currentJitter);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    shouldSimulatePacketLoss() {
        this.networkConditions.packetLossCounter++;
        if (this.networkConditions.packetLossCounter >= 100) {
            this.networkConditions.packetLossCounter = 0;
        }
        return Math.random() < this.config.packetLossRate;
    }
    handleCommandError(error) {
        this.state.errors.push(error);
        this.state.metrics.commandsFailed++;
        this.monitor.onError(error, {
            command: this.state.lastCommand,
            batteryLevel: this.state.batteryLevel
        });
        throw error;
    }
    getRandomError() {
        const index = Math.floor(Math.random() * this.config.errorTypes.length);
        return this.config.errorTypes[index];
    }
    getRandomInRange([min, max]) {
        return min + Math.random() * (max - min);
    }
}
exports.DeviceSimulator = DeviceSimulator;
/**
 * Create a simulated device
 */
function createSimulatedDevice(info, config) {
    return new DeviceSimulator(info, config);
}
//# sourceMappingURL=DeviceSimulator.js.map