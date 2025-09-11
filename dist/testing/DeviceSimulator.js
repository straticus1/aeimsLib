"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceSimulator = void 0;
exports.createSimulatedDevice = createSimulatedDevice;
const events_1 = require("events");
class DeviceSimulator extends events_1.EventEmitter {
    constructor(info, config) {
        super();
        this.batteryLevel = 100;
        this.batteryInterval = null;
        this.info = info;
        this.status = {
            connected: false,
            lastSeen: new Date(),
            batteryLevel: 100,
        };
        this.config = {
            latency: config?.latency ?? 50,
            packetLoss: config?.packetLoss ?? 0.01,
            disconnectProbability: config?.disconnectProbability ?? 0.001,
            batteryDrainRate: config?.batteryDrainRate ?? 0.1,
            errorProbability: config?.errorProbability ?? 0.05
        };
    }
    async connect() {
        if (Math.random() < this.config.errorProbability) {
            throw new Error('Simulated connection failure');
        }
        await this.simulateLatency();
        this.status.connected = true;
        this.status.lastSeen = new Date();
        // Start battery simulation
        this.startBatterySimulation();
        this.emit('connected', {
            type: 'connected',
            deviceId: this.info.id,
            timestamp: new Date()
        });
    }
    async disconnect() {
        await this.simulateLatency();
        this.status.connected = false;
        this.status.lastSeen = new Date();
        if (this.batteryInterval) {
            clearInterval(this.batteryInterval);
            this.batteryInterval = null;
        }
        this.emit('disconnected', {
            type: 'disconnected',
            deviceId: this.info.id,
            timestamp: new Date()
        });
    }
    async sendCommand(command) {
        if (!this.status.connected) {
            throw new Error('Device not connected');
        }
        // Simulate packet loss
        if (Math.random() < this.config.packetLoss) {
            throw new Error('Simulated packet loss');
        }
        await this.simulateLatency();
        // Simulate random disconnections
        if (Math.random() < this.config.disconnectProbability) {
            await this.disconnect();
            throw new Error('Simulated random disconnection');
        }
        // Simulate command processing
        this.status.lastSeen = new Date();
        this.emit('commandReceived', {
            type: 'commandReceived',
            deviceId: this.info.id,
            timestamp: new Date(),
            data: command
        });
        // Simulate command errors
        if (Math.random() < this.config.errorProbability) {
            throw new Error('Simulated command error');
        }
    }
    async getStatus() {
        if (!this.status.connected) {
            throw new Error('Device not connected');
        }
        await this.simulateLatency();
        return { ...this.status };
    }
    getInfo() {
        return { ...this.info };
    }
    async simulateLatency() {
        const latency = this.config.latency * (1 + (Math.random() - 0.5) * 0.5);
        await new Promise(resolve => setTimeout(resolve, latency));
    }
    startBatterySimulation() {
        this.batteryInterval = setInterval(() => {
            if (this.status.connected) {
                this.batteryLevel = Math.max(0, this.batteryLevel - this.config.batteryDrainRate);
                this.status.batteryLevel = Math.round(this.batteryLevel);
                this.emit('statusChanged', {
                    type: 'statusChanged',
                    deviceId: this.info.id,
                    timestamp: new Date(),
                    data: { batteryLevel: this.status.batteryLevel }
                });
                // Simulate low battery disconnection
                if (this.batteryLevel < 5 && Math.random() < 0.1) {
                    this.disconnect();
                }
            }
        }, 1000);
    }
    // Utility methods for testing
    simulateError(error) {
        this.emit('error', {
            type: 'error',
            deviceId: this.info.id,
            timestamp: new Date(),
            data: { message: error }
        });
    }
    setBatteryLevel(level) {
        this.batteryLevel = Math.min(100, Math.max(0, level));
        this.status.batteryLevel = Math.round(this.batteryLevel);
    }
    setConnected(connected) {
        if (connected) {
            this.connect();
        }
        else {
            this.disconnect();
        }
    }
}
exports.DeviceSimulator = DeviceSimulator;
// Factory function to create simulated devices
function createSimulatedDevice(protocol, options) {
    const deviceInfo = {
        id: `sim_${Math.random().toString(36).substr(2, 9)}`,
        name: `Simulated ${protocol} Device`,
        protocol: protocol,
        manufacturer: 'Simulator',
        model: 'Test Device',
        firmwareVersion: '1.0.0',
        capabilities: ['vibrate', 'battery', 'pattern']
    };
    return new DeviceSimulator(deviceInfo, options);
}
//# sourceMappingURL=DeviceSimulator.js.map