"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkDiscoveryProvider = void 0;
const events_1 = require("events");
const dgram = __importStar(require("dgram"));
const dns = __importStar(require("dns"));
const os = __importStar(require("os"));
const net = __importStar(require("net"));
/**
 * Network Discovery Provider
 * Discovers network-connected devices using multiple methods:
 * - Network scanning
 * - Service discovery
 * - Broadcast discovery
 * - MDNS/Bonjour
 */
class NetworkDiscoveryProvider extends events_1.EventEmitter {
    constructor(options = {}) {
        super();
        this.id = 'network';
        this.name = 'Network Device Discovery';
        this.scanning = false;
        this.discoveredDevices = new Map();
        this.activeScans = new Set();
        this.mdnsResponders = new Map();
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
        try {
            // Initialize broadcast discovery
            if (this.options.broadcastEnabled) {
                await this.startBroadcastDiscovery();
            }
            // Initialize MDNS discovery
            if (this.options.mdnsEnabled) {
                await this.startMdnsDiscovery();
            }
            // Initial network scan
            await this.scanNetworks();
        }
        catch (error) {
            this.emit('error', {
                type: 'start_error',
                error
            });
            await this.stop();
        }
    }
    /**
     * Stop device discovery
     */
    async stop() {
        this.scanning = false;
        // Stop broadcast discovery
        if (this.broadcastTimer) {
            clearInterval(this.broadcastTimer);
            this.broadcastTimer = undefined;
        }
        if (this.broadcastSocket) {
            this.broadcastSocket.close();
            this.broadcastSocket = undefined;
        }
        // Stop MDNS discovery
        for (const [type, responder] of this.mdnsResponders) {
            responder.stop();
            this.mdnsResponders.delete(type);
        }
        // Clear discovered devices
        this.discoveredDevices.clear();
    }
    /**
     * Scan for devices
     */
    async scan(duration) {
        if (!this.scanning) {
            return;
        }
        // Start network scan
        await this.scanNetworks();
        if (duration) {
            // Wait for specified duration
            await new Promise(resolve => setTimeout(resolve, duration));
        }
    }
    initializeOptions(options) {
        return {
            networks: options.networks || [],
            ports: options.ports || [80, 443, 22, 23],
            excludeNetworks: options.excludeNetworks || [],
            excludePorts: options.excludePorts || [],
            services: options.services || [
                {
                    name: 'http',
                    protocol: 'tcp',
                    port: 80,
                    probe: {
                        data: Buffer.from('GET / HTTP/1.0\r\n\r\n'),
                        responsePattern: /^HTTP\/\d\.\d/,
                        timeout: 2000
                    }
                }
            ],
            broadcastEnabled: options.broadcastEnabled || false,
            broadcastPort: options.broadcastPort || 1900,
            broadcastInterval: options.broadcastInterval || 10000,
            broadcastMessage: options.broadcastMessage || 'DISCOVER',
            mdnsEnabled: options.mdnsEnabled || false,
            mdnsTypes: options.mdnsTypes || ['_http._tcp.local'],
            scanTimeout: options.scanTimeout || 5000,
            scanConcurrency: options.scanConcurrency || 100,
            probeTimeout: options.probeTimeout || 2000,
            retryAttempts: options.retryAttempts || 2,
            deviceMatchers: options.deviceMatchers || []
        };
    }
    /**
     * Get list of networks to scan
     */
    getNetworksToScan() {
        const networks = [];
        const interfaces = os.networkInterfaces();
        for (const [name, addrs] of Object.entries(interfaces)) {
            if (!addrs)
                continue;
            for (const addr of addrs) {
                if (addr.family !== 'IPv4' || addr.internal) {
                    continue;
                }
                const network = this.getNetworkAddress(addr.address, addr.netmask);
                // Apply filters
                if (this.shouldScanNetwork(network)) {
                    networks.push(network);
                }
            }
        }
        return networks;
    }
    /**
     * Get network address from IP and netmask
     */
    getNetworkAddress(ip, netmask) {
        const ipParts = ip.split('.').map(Number);
        const maskParts = netmask.split('.').map(Number);
        return ipParts
            .map((part, i) => part & maskParts[i])
            .join('.');
    }
    /**
     * Check if network should be scanned
     */
    shouldScanNetwork(network) {
        // Check exclude list
        if (this.options.excludeNetworks.includes(network)) {
            return false;
        }
        // Check allow list
        if (this.options.networks.length > 0) {
            return this.options.networks.includes(network);
        }
        return true;
    }
    /**
     * Scan networks for devices
     */
    async scanNetworks() {
        const networks = this.getNetworksToScan();
        const tasks = [];
        for (const network of networks) {
            // Skip if already scanning
            if (this.activeScans.has(network)) {
                continue;
            }
            this.activeScans.add(network);
            const task = this.scanNetwork(network)
                .finally(() => {
                this.activeScans.delete(network);
            });
            tasks.push(task);
        }
        await Promise.all(tasks);
    }
    /**
     * Scan individual network
     */
    async scanNetwork(network) {
        const addresses = this.generateAddresses(network);
        const chunks = this.chunkArray(addresses, this.options.scanConcurrency);
        for (const chunk of chunks) {
            await Promise.all(chunk.map(address => this.scanAddress(address)));
        }
    }
    /**
     * Generate IP addresses for network
     */
    generateAddresses(network) {
        const addresses = [];
        const base = network.split('.').slice(0, 3).join('.');
        for (let i = 1; i < 255; i++) {
            addresses.push(`${base}.${i}`);
        }
        return addresses;
    }
    /**
     * Scan individual IP address
     */
    async scanAddress(address) {
        try {
            // Check if host is reachable
            const alive = await this.pingHost(address);
            if (!alive)
                return;
            // Initialize device info
            let device = this.discoveredDevices.get(address);
            if (!device) {
                device = {
                    address,
                    ports: new Set(),
                    services: new Map(),
                    responseData: new Map(),
                    lastSeen: Date.now()
                };
                this.discoveredDevices.set(address, device);
            }
            // Update basic info
            device.lastSeen = Date.now();
            await this.updateDeviceInfo(device);
            // Scan ports
            await this.scanPorts(device);
            // Emit discovery
            const discoveredDevice = await this.createDeviceInfo(device);
            if (discoveredDevice) {
                this.emit('deviceDiscovered', discoveredDevice);
            }
        }
        catch (error) {
            this.emit('error', {
                type: 'scan_error',
                address,
                error
            });
        }
    }
    /**
     * Check if host is reachable
     */
    async pingHost(address) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(this.options.probeTimeout);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });
            socket.connect(80, address);
        });
    }
    /**
     * Update device information
     */
    async updateDeviceInfo(device) {
        try {
            // Resolve hostname
            const hostnames = await dns.promises.reverse(device.address);
            if (hostnames && hostnames.length > 0) {
                device.hostname = hostnames[0];
            }
            // TODO: Implement MAC address lookup
            // TODO: Implement vendor lookup
        }
        catch (error) {
            // Ignore resolution errors
        }
    }
    /**
     * Scan ports on device
     */
    async scanPorts(device) {
        const ports = this.options.ports.filter(port => !this.options.excludePorts.includes(port));
        const chunks = this.chunkArray(ports, this.options.scanConcurrency);
        for (const chunk of chunks) {
            await Promise.all(chunk.map(port => this.scanPort(device, port)));
        }
    }
    /**
     * Scan individual port
     */
    async scanPort(device, port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(this.options.probeTimeout);
            socket.on('connect', () => {
                device.ports.add(port);
                // Check for service
                const service = this.options.services.find(s => s.protocol === 'tcp' && s.port === port);
                if (service?.probe) {
                    this.probeService(device, service, socket)
                        .finally(() => {
                        socket.destroy();
                        resolve();
                    });
                }
                else {
                    socket.destroy();
                    resolve();
                }
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve();
            });
            socket.on('error', () => {
                socket.destroy();
                resolve();
            });
            socket.connect(port, device.address);
        });
    }
    /**
     * Probe service for additional info
     */
    async probeService(device, service, socket) {
        if (!service.probe)
            return;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Probe timeout'));
            }, service.probe.timeout || this.options.probeTimeout);
            const responses = [];
            const cleanup = () => {
                socket.removeListener('data', onData);
                clearTimeout(timeout);
            };
            const onData = (data) => {
                responses.push(data);
                if (service.probe?.responsePattern) {
                    const response = Buffer.concat(responses).toString();
                    const match = response.match(service.probe.responsePattern);
                    if (match) {
                        cleanup();
                        // Store service info
                        device.services.set(service.name, {
                            port: service.port,
                            protocol: service.protocol,
                            response: this.parseProbeResponse(match)
                        });
                        resolve();
                    }
                }
            };
            socket.on('data', onData);
            // Send probe
            const data = typeof service.probe.data === 'string' ?
                Buffer.from(service.probe.data) :
                service.probe.data;
            socket.write(data, (error) => {
                if (error) {
                    cleanup();
                    reject(error);
                }
            });
            // Resolve after timeout if no pattern
            if (!service.probe.responsePattern) {
                setTimeout(() => {
                    cleanup();
                    device.services.set(service.name, {
                        port: service.port,
                        protocol: service.protocol,
                        response: this.parseProbeResponse(Buffer.concat(responses).toString())
                    });
                    resolve();
                }, service.probe.timeout || this.options.probeTimeout);
            }
        });
    }
    /**
     * Start broadcast discovery
     */
    async startBroadcastDiscovery() {
        if (!this.options.broadcastEnabled)
            return;
        try {
            // Create UDP socket
            this.broadcastSocket = dgram.createSocket('udp4');
            // Handle responses
            this.broadcastSocket.on('message', (msg, rinfo) => {
                this.handleBroadcastResponse(msg, rinfo);
            });
            // Bind socket
            await new Promise((resolve, reject) => {
                this.broadcastSocket.bind(undefined, () => {
                    this.broadcastSocket.setBroadcast(true);
                    resolve();
                });
                this.broadcastSocket.once('error', reject);
            });
            // Start broadcast timer
            this.broadcastTimer = setInterval(() => {
                this.sendBroadcast();
            }, this.options.broadcastInterval);
            // Initial broadcast
            this.sendBroadcast();
        }
        catch (error) {
            this.emit('error', {
                type: 'broadcast_error',
                error
            });
        }
    }
    /**
     * Send broadcast message
     */
    sendBroadcast() {
        if (!this.broadcastSocket)
            return;
        const message = Buffer.from(this.options.broadcastMessage);
        this.broadcastSocket.send(message, 0, message.length, this.options.broadcastPort, '255.255.255.255');
    }
    /**
     * Handle broadcast response
     */
    async handleBroadcastResponse(msg, rinfo) {
        try {
            const { address } = rinfo;
            // Initialize device
            let device = this.discoveredDevices.get(address);
            if (!device) {
                device = {
                    address,
                    ports: new Set(),
                    services: new Map(),
                    responseData: new Map(),
                    lastSeen: Date.now()
                };
                this.discoveredDevices.set(address, device);
            }
            // Update device
            device.lastSeen = Date.now();
            device.responseData.set('broadcast', msg.toString());
            await this.updateDeviceInfo(device);
            // Emit discovery
            const discoveredDevice = await this.createDeviceInfo(device);
            if (discoveredDevice) {
                this.emit('deviceDiscovered', discoveredDevice);
            }
        }
        catch (error) {
            this.emit('error', {
                type: 'broadcast_response_error',
                error
            });
        }
    }
    /**
     * Start MDNS discovery
     */
    async startMdnsDiscovery() {
        if (!this.options.mdnsEnabled)
            return;
        try {
            // TODO: Implement MDNS discovery using appropriate library
            // this.mdnsResponders...
        }
        catch (error) {
            this.emit('error', {
                type: 'mdns_error',
                error
            });
        }
    }
    /**
     * Parse probe response
     */
    parseProbeResponse(response) {
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
            // Use named capture groups
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
     * Create device info from discovered device
     */
    async createDeviceInfo(device) {
        // Try to determine protocol
        const protocol = this.findMatchingProtocol(device);
        if (!protocol)
            return undefined;
        // Build capabilities list
        const capabilities = [];
        for (const [service] of device.services) {
            capabilities.push(service);
        }
        // Get primary service info
        const serviceInfo = device.services.get(protocol);
        // Build device info
        const info = {
            id: `net:${device.mac || device.address}`,
            name: device.hostname || device.address,
            type: 'network',
            protocol,
            address: device.address,
            manufacturer: device.vendor,
            capabilities,
            metadata: {
                mac: device.mac,
                ports: Array.from(device.ports),
                services: Object.fromEntries(device.services),
                responses: Object.fromEntries(device.responseData)
            },
            discoveryTime: Date.now(),
            lastSeen: device.lastSeen
        };
        // Add service-specific info
        if (serviceInfo?.response) {
            if (serviceInfo.response.model) {
                info.model = serviceInfo.response.model;
            }
            if (serviceInfo.response.serial) {
                info.serialNumber = serviceInfo.response.serial;
            }
            if (serviceInfo.response.firmware) {
                info.firmware = serviceInfo.response.firmware;
            }
        }
        return info;
    }
    /**
     * Find matching protocol for device
     */
    findMatchingProtocol(device) {
        for (const matcher of this.options.deviceMatchers) {
            // Check hostname
            if (device.hostname && matcher.pattern.test(device.hostname)) {
                return matcher.protocol;
            }
            // Check service responses
            for (const [_, service] of device.services) {
                if (service.response) {
                    for (const value of Object.values(service.response)) {
                        if (typeof value === 'string' && matcher.pattern.test(value)) {
                            return matcher.protocol;
                        }
                    }
                }
            }
            // Check broadcast responses
            const broadcastResponse = device.responseData.get('broadcast');
            if (broadcastResponse && matcher.pattern.test(broadcastResponse)) {
                return matcher.protocol;
            }
        }
        // Default to first service if no matcher
        if (device.services.size > 0) {
            return Array.from(device.services.keys())[0];
        }
        return undefined;
    }
    /**
     * Split array into chunks
     */
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}
exports.NetworkDiscoveryProvider = NetworkDiscoveryProvider;
//# sourceMappingURL=NetworkDiscoveryProvider.js.map