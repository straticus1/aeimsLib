"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USBDiscoveryProvider = void 0;
const events_1 = require("events");
const serialport_1 = require("serialport");
/**
 * USB Discovery Provider Implementation
 */
class USBDiscoveryProvider extends events_1.EventEmitter {
    constructor(options = {}) {
        super();
        this.id = 'usb';
        this.name = 'USB Device Discovery';
        this.scanning = false;
        this.discoveredPorts = new Map();
        this.activeConnections = new Map();
        this.probeResults = new Map();
        this.options = this.initializeOptions(options);
    }
    /**
     * Check if provider is active
     */
    isActive() {
        return this.scanning;
    }
    /**
     * Start device discovery
     */
    async start() {
        if (this.scanning) {
            return;
        }
        this.scanning = true;
        // Initial port scan
        await this.scanPorts();
        // Start polling if enabled
        if (this.options.pollInterval > 0) {
            this.pollTimer = setInterval(() => this.scanPorts(), this.options.pollInterval);
        }
    }
    /**
     * Stop device discovery
     */
    async stop() {
        this.scanning = false;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
        // Close active connections
        for (const [path, connection] of this.activeConnections) {
            await this.closeConnection(path, connection);
        }
        this.discoveredPorts.clear();
        this.probeResults.clear();
    }
    /**
     * Scan for devices
     */
    async scan(duration) {
        if (!this.scanning) {
            return;
        }
        // Single scan
        await this.scanPorts();
        if (duration) {
            // Wait for specified duration
            await new Promise(resolve => setTimeout(resolve, duration));
        }
    }
    initializeOptions(options) {
        return {
            allowedPorts: options.allowedPorts || [],
            ignorePorts: options.ignorePorts || [],
            matchPatterns: options.matchPatterns || [],
            pollInterval: options.pollInterval || 1000,
            autoConnect: options.autoConnect || false,
            connectionTimeout: options.connectionTimeout || 1000,
            probeCommands: options.probeCommands || [],
            supportedDrivers: options.supportedDrivers || [],
            driverMatchers: options.driverMatchers || []
        };
    }
    /**
     * Scan available USB ports
     */
    async scanPorts() {
        try {
            // Get current ports
            const ports = await serialport_1.SerialPort.list();
            // Track new and removed ports
            const currentPaths = new Set(ports.map(p => p.path));
            const knownPaths = new Set(this.discoveredPorts.keys());
            // Handle removed ports
            for (const path of knownPaths) {
                if (!currentPaths.has(path)) {
                    await this.handleRemovedPort(path);
                }
            }
            // Process each port
            for (const port of ports) {
                await this.processPort(port);
            }
        }
        catch (error) {
            this.emit('error', {
                type: 'scan_error',
                error
            });
        }
    }
    /**
     * Process discovered port
     */
    async processPort(port) {
        const { path } = port;
        // Skip if port should be ignored
        if (this.shouldIgnorePort(port)) {
            return;
        }
        // Check if port is new or updated
        const existing = this.discoveredPorts.get(path);
        if (!existing || this.hasPortChanged(existing, port)) {
            // Store port info
            this.discoveredPorts.set(path, port);
            // Probe port if needed
            if (this.options.probeCommands.length > 0) {
                await this.probePort(port);
            }
            // Emit device
            const device = await this.createDeviceInfo(port);
            if (device) {
                this.emit('deviceDiscovered', device);
            }
        }
    }
    /**
     * Handle removed port
     */
    async handleRemovedPort(path) {
        // Close connection if active
        const connection = this.activeConnections.get(path);
        if (connection) {
            await this.closeConnection(path, connection);
        }
        // Clear port data
        this.discoveredPorts.delete(path);
        this.probeResults.delete(path);
        // Emit removed event
        this.emit('deviceRemoved', { path });
    }
    /**
     * Check if port should be ignored
     */
    shouldIgnorePort(port) {
        const { path } = port;
        // Check ignore list
        if (this.options.ignorePorts.includes(path)) {
            return true;
        }
        // Check allow list
        if (this.options.allowedPorts.length > 0 &&
            !this.options.allowedPorts.includes(path)) {
            return true;
        }
        // Check patterns
        if (this.options.matchPatterns.length > 0) {
            return !this.options.matchPatterns.some(pattern => path.includes(pattern));
        }
        return false;
    }
    /**
     * Check if port info has changed
     */
    hasPortChanged(a, b) {
        return a.manufacturer !== b.manufacturer ||
            a.serialNumber !== b.serialNumber ||
            a.vendorId !== b.vendorId ||
            a.productId !== b.productId;
    }
    /**
     * Probe port for device info
     */
    async probePort(port) {
        const { path } = port;
        try {
            // Create connection
            const connection = await this.openConnection(port);
            if (!connection)
                return;
            // Send probe commands
            const results = {};
            for (const probe of this.options.probeCommands) {
                try {
                    const result = await this.sendProbe(connection, probe);
                    if (result) {
                        Object.assign(results, result);
                    }
                }
                catch (error) {
                    this.emit('error', {
                        type: 'probe_error',
                        port: path,
                        error
                    });
                }
            }
            // Store results
            if (Object.keys(results).length > 0) {
                this.probeResults.set(path, results);
            }
            // Close connection if not auto-connecting
            if (!this.options.autoConnect) {
                await this.closeConnection(path, connection);
            }
        }
        catch (error) {
            this.emit('error', {
                type: 'probe_error',
                port: path,
                error
            });
        }
    }
    /**
     * Open serial connection
     */
    async openConnection(port) {
        const { path } = port;
        try {
            const connection = new serialport_1.SerialPort({
                path,
                baudRate: 9600,
                autoOpen: false
            });
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new Error('Connection timeout'));
                }, this.options.connectionTimeout);
                const cleanup = () => {
                    connection.removeListener('open', onOpen);
                    connection.removeListener('error', onError);
                    clearTimeout(timeout);
                };
                const onOpen = () => {
                    cleanup();
                    this.activeConnections.set(path, connection);
                    resolve(connection);
                };
                const onError = (error) => {
                    cleanup();
                    reject(error);
                };
                connection.once('open', onOpen);
                connection.once('error', onError);
                connection.open();
            });
        }
        catch (error) {
            this.emit('error', {
                type: 'connection_error',
                port: path,
                error
            });
            return undefined;
        }
    }
    /**
     * Close serial connection
     */
    async closeConnection(path, connection) {
        return new Promise((resolve) => {
            if (connection.isOpen) {
                connection.close(() => {
                    this.activeConnections.delete(path);
                    resolve();
                });
            }
            else {
                this.activeConnections.delete(path);
                resolve();
            }
        });
    }
    /**
     * Send probe command
     */
    async sendProbe(connection, probe) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Probe timeout'));
            }, probe.timeout || 1000);
            const responses = [];
            const cleanup = () => {
                connection.removeListener('data', onData);
                clearTimeout(timeout);
            };
            const onData = (data) => {
                responses.push(data);
                // Check pattern match if specified
                if (probe.responsePattern) {
                    const response = Buffer.concat(responses).toString();
                    const match = response.match(probe.responsePattern);
                    if (match) {
                        cleanup();
                        resolve(this.parseProbeResponse(match));
                    }
                }
            };
            connection.on('data', onData);
            // Send probe command
            const data = typeof probe.data === 'string' ?
                Buffer.from(probe.data) :
                probe.data;
            connection.write(data, (error) => {
                if (error) {
                    cleanup();
                    reject(error);
                }
            });
            // Resolve after timeout if no pattern specified
            if (!probe.responsePattern) {
                setTimeout(() => {
                    cleanup();
                    resolve(this.parseProbeResponse(Buffer.concat(responses).toString()));
                }, probe.timeout || 1000);
            }
        });
    }
    /**
     * Parse probe response
     */
    parseProbeResponse(response) {
        // Simple key-value parsing
        const result = {};
        if (typeof response === 'string') {
            // Split into lines
            const lines = response.split(/[\r\n]+/);
            for (const line of lines) {
                const [key, value] = line.split(/[=:]+/).map(s => s.trim());
                if (key && value) {
                    result[key.toLowerCase()] = value;
                }
            }
        }
        else {
            // Use named capture groups if available
            const groups = response.groups;
            if (groups) {
                for (const [key, value] of Object.entries(groups)) {
                    if (value) {
                        result[key.toLowerCase()] = value;
                    }
                }
            }
        }
        return result;
    }
    /**
     * Create device info from port
     */
    async createDeviceInfo(port) {
        const { path } = port;
        // Get probe results
        const probeInfo = this.probeResults.get(path) || {};
        // Try to determine device type and driver
        const driver = this.findMatchingDriver(port, probeInfo);
        if (!driver && this.options.supportedDrivers.length > 0) {
            return undefined;
        }
        // Build device info
        const device = {
            id: this.generateDeviceId(port),
            name: port.friendlyName || path,
            type: 'usb',
            address: path,
            protocol: driver,
            manufacturer: port.manufacturer || probeInfo.manufacturer,
            model: probeInfo.model,
            serialNumber: port.serialNumber || probeInfo.serial,
            firmware: probeInfo.firmware,
            capabilities: [],
            discoveryTime: Date.now(),
            lastSeen: Date.now(),
            metadata: {
                vendorId: port.vendorId,
                productId: port.productId,
                locationId: port.locationId,
                ...probeInfo
            }
        };
        return device;
    }
    /**
     * Find matching driver for device
     */
    findMatchingDriver(port, info) {
        for (const matcher of this.options.driverMatchers) {
            // Check port info
            if (port.manufacturer && matcher.pattern.test(port.manufacturer)) {
                return matcher.driver;
            }
            if (port.friendlyName && matcher.pattern.test(port.friendlyName)) {
                return matcher.driver;
            }
            // Check probe info
            for (const value of Object.values(info)) {
                if (typeof value === 'string' && matcher.pattern.test(value)) {
                    return matcher.driver;
                }
            }
        }
        return undefined;
    }
    /**
     * Generate unique device ID
     */
    generateDeviceId(port) {
        // Use serial number if available
        if (port.serialNumber) {
            return `usb:${port.serialNumber}`;
        }
        // Use vendor/product ID if available
        if (port.vendorId && port.productId) {
            return `usb:${port.vendorId}:${port.productId}:${port.path}`;
        }
        // Fallback to path
        return `usb:${port.path}`;
    }
}
exports.USBDiscoveryProvider = USBDiscoveryProvider;
//# sourceMappingURL=USBDiscoveryProvider.js.map