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
exports.BluetoothDiscoveryProvider = void 0;
const events_1 = require("events");
const noble = __importStar(require("@abandonware/noble"));
const bluetooth = __importStar(require("node-bluetooth"));
/**
 * Bluetooth Discovery Provider
 * Discovers both classic Bluetooth and BLE devices
 */
class BluetoothDiscoveryProvider extends events_1.EventEmitter {
    constructor(options = {}) {
        super();
        this.id = 'bluetooth';
        this.name = 'Bluetooth Device Discovery';
        this.scanning = false;
        this.discoveredDevices = new Map();
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
        try {
            // Initialize BLE
            if (this.options.enableBLE) {
                await this.initializeBLE();
            }
            // Initialize Classic Bluetooth
            if (this.options.enableClassic) {
                await this.initializeClassic();
            }
            this.scanning = true;
            await this.startScanning();
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
        if (this.scanTimer) {
            clearTimeout(this.scanTimer);
            this.scanTimer = undefined;
        }
        // Stop BLE scanning
        if (this.bleManager) {
            this.bleManager.stopScanning();
        }
        // Stop Classic scanning
        if (this.classicManager) {
            // Classic scanning stops automatically
            this.classicManager.close();
            this.classicManager = undefined;
        }
        // Cleanup discovered devices
        for (const device of this.discoveredDevices.values()) {
            if (device.type === 'ble' && device.peripheral) {
                device.peripheral.disconnect();
            }
        }
        this.discoveredDevices.clear();
    }
    /**
     * Scan for devices
     */
    async scan(duration) {
        if (!this.scanning) {
            return;
        }
        await this.startScanning(duration);
    }
    initializeOptions(options) {
        return {
            allowedDevices: options.allowedDevices || [],
            ignoredDevices: options.ignoredDevices || [],
            serviceUUIDs: options.serviceUUIDs || [],
            rssiThreshold: options.rssiThreshold || -80,
            enableClassic: options.enableClassic !== false,
            enableBLE: options.enableBLE !== false,
            scanDuration: options.scanDuration || 10000,
            scanInterval: options.scanInterval || 5000,
            connectTimeout: options.connectTimeout || 5000,
            deviceMatchers: options.deviceMatchers || []
        };
    }
    /**
     * Initialize BLE discovery
     */
    async initializeBLE() {
        this.bleManager = noble;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('BLE initialization timeout'));
            }, this.options.connectTimeout);
            const cleanup = () => {
                this.bleManager.removeListener('stateChange', onStateChange);
                clearTimeout(timeout);
            };
            const onStateChange = (state) => {
                if (state === 'poweredOn') {
                    cleanup();
                    resolve();
                }
                else if (state === 'poweredOff') {
                    cleanup();
                    reject(new Error('Bluetooth adapter is powered off'));
                }
            };
            this.bleManager.on('stateChange', onStateChange);
            // Setup discovery handlers
            this.bleManager.on('discover', (peripheral) => {
                this.handleBLEDiscovery(peripheral);
            });
        });
    }
    /**
     * Initialize Classic Bluetooth discovery
     */
    async initializeClassic() {
        return new Promise((resolve, reject) => {
            try {
                this.classicManager = new bluetooth.DeviceINQ();
                this.classicManager.on('found', (address, name) => {
                    this.handleClassicDiscovery(address, name);
                });
                this.classicManager.on('finished', () => {
                    // Classic scan complete
                    this.scanTimer = setTimeout(() => {
                        this.startScanning();
                    }, this.options.scanInterval);
                });
                resolve();
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Start scanning for devices
     */
    async startScanning(duration) {
        const scanDuration = duration || this.options.scanDuration;
        if (this.scanTimer) {
            clearTimeout(this.scanTimer);
            this.scanTimer = undefined;
        }
        // Start BLE scanning
        if (this.options.enableBLE && this.bleManager) {
            this.bleManager.startScanning(this.options.serviceUUIDs, true // Allow duplicates for continuous RSSI updates
            );
        }
        // Start Classic scanning
        if (this.options.enableClassic && this.classicManager) {
            this.classicManager.inquire();
        }
        // Set scan timeout
        this.scanTimer = setTimeout(() => {
            if (this.bleManager) {
                this.bleManager.stopScanning();
            }
            // Schedule next scan
            this.scanTimer = setTimeout(() => {
                this.startScanning();
            }, this.options.scanInterval);
        }, scanDuration);
    }
    /**
     * Handle BLE device discovery
     */
    async handleBLEDiscovery(peripheral) {
        const { address, advertisement } = peripheral;
        // Check filters
        if (!this.shouldProcessDevice(address, advertisement.localName)) {
            return;
        }
        // Check signal strength
        if (peripheral.rssi < this.options.rssiThreshold) {
            return;
        }
        try {
            // Get or create device
            let device = this.discoveredDevices.get(address);
            if (!device) {
                device = {
                    id: address,
                    address,
                    name: advertisement.localName,
                    type: 'ble',
                    peripheral,
                    advertisement,
                    rssi: peripheral.rssi,
                    manufacturerData: advertisement.manufacturerData,
                    serviceData: new Map(Object.entries(advertisement.serviceData || {})),
                    connectable: advertisement.connectable,
                    lastSeen: Date.now()
                };
                this.discoveredDevices.set(address, device);
                // Resolve services if connectable
                if (advertisement.connectable) {
                    await this.resolveBLEServices(device);
                }
            }
            else {
                // Update existing device
                device.rssi = peripheral.rssi;
                device.lastSeen = Date.now();
                if (advertisement.manufacturerData) {
                    device.manufacturerData = advertisement.manufacturerData;
                }
                if (advertisement.serviceData) {
                    device.serviceData = new Map(Object.entries(advertisement.serviceData));
                }
            }
            // Emit discovery
            const discoveredDevice = await this.createDeviceInfo(device);
            if (discoveredDevice) {
                this.emit('deviceDiscovered', discoveredDevice);
            }
        }
        catch (error) {
            this.emit('error', {
                type: 'ble_discovery_error',
                device: address,
                error
            });
        }
    }
    /**
     * Handle Classic Bluetooth discovery
     */
    async handleClassicDiscovery(address, name) {
        // Check filters
        if (!this.shouldProcessDevice(address, name)) {
            return;
        }
        try {
            // Get or create device
            let device = this.discoveredDevices.get(address);
            if (!device) {
                device = {
                    id: address,
                    address,
                    name,
                    type: 'classic',
                    lastSeen: Date.now()
                };
                this.discoveredDevices.set(address, device);
                // Resolve device class and services
                await this.resolveClassicServices(device);
            }
            else {
                // Update existing device
                device.lastSeen = Date.now();
            }
            // Emit discovery
            const discoveredDevice = await this.createDeviceInfo(device);
            if (discoveredDevice) {
                this.emit('deviceDiscovered', discoveredDevice);
            }
        }
        catch (error) {
            this.emit('error', {
                type: 'classic_discovery_error',
                device: address,
                error
            });
        }
    }
    /**
     * Resolve BLE device services
     */
    async resolveBLEServices(device) {
        if (!device.peripheral || device.servicesResolved) {
            return;
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Service discovery timeout'));
            }, this.options.connectTimeout);
            const cleanup = () => {
                device.peripheral.disconnect();
                clearTimeout(timeout);
            };
            // Connect and discover services
            device.peripheral.connect((error) => {
                if (error) {
                    cleanup();
                    reject(error);
                    return;
                }
                device.peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
                    if (error) {
                        cleanup();
                        reject(error);
                        return;
                    }
                    // Store characteristics by UUID
                    device.characteristics = new Map(characteristics.map(c => [c.uuid, c]));
                    device.servicesResolved = true;
                    cleanup();
                    resolve();
                });
            });
        });
    }
    /**
     * Resolve Classic Bluetooth services
     */
    async resolveClassicServices(device) {
        return new Promise((resolve, reject) => {
            if (!this.classicManager) {
                resolve();
                return;
            }
            this.classicManager.findServices(device.address, (error, services) => {
                if (error) {
                    reject(error);
                    return;
                }
                device.services = services;
                resolve();
            });
        });
    }
    /**
     * Check if device should be processed
     */
    shouldProcessDevice(address, name) {
        // Check ignore list
        if (this.options.ignoredDevices.some(pattern => address.includes(pattern) || (name && name.includes(pattern)))) {
            return false;
        }
        // Check allow list
        if (this.options.allowedDevices.length > 0) {
            return this.options.allowedDevices.some(pattern => address.includes(pattern) || (name && name.includes(pattern)));
        }
        return true;
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
        if (device.type === 'ble') {
            capabilities.push('ble');
            if (device.connectable) {
                capabilities.push('connectable');
            }
            if (device.characteristics) {
                capabilities.push('gatt');
            }
        }
        else {
            capabilities.push('bluetooth-classic');
            if (device.services) {
                capabilities.push(...device.services);
            }
        }
        // Build device info
        const info = {
            id: `bt:${device.address}`,
            name: device.name || device.address,
            type: device.type,
            protocol,
            address: device.address,
            rssi: device.rssi,
            capabilities,
            metadata: {
                deviceClass: device.deviceClass,
                majorClass: device.majorClass,
                minorClass: device.minorClass,
                manufacturerData: device.manufacturerData?.toString('hex'),
                serviceData: Object.fromEntries(Array.from(device.serviceData || []).map(([k, v]) => [k, v.toString('hex')])),
                services: device.services
            },
            discoveryTime: Date.now(),
            lastSeen: device.lastSeen
        };
        return info;
    }
    /**
     * Find matching protocol for device
     */
    findMatchingProtocol(device) {
        for (const matcher of this.options.deviceMatchers) {
            // Check device name
            if (device.name && matcher.pattern.test(device.name)) {
                return matcher.protocol;
            }
            // Check services (Classic)
            if (device.services) {
                for (const service of device.services) {
                    if (matcher.pattern.test(service)) {
                        return matcher.protocol;
                    }
                }
            }
            // Check service data (BLE)
            if (device.serviceData) {
                for (const [uuid, data] of device.serviceData) {
                    if (matcher.pattern.test(uuid) || matcher.pattern.test(data.toString())) {
                        return matcher.protocol;
                    }
                }
            }
            // Check manufacturer data (BLE)
            if (device.manufacturerData &&
                matcher.pattern.test(device.manufacturerData.toString())) {
                return matcher.protocol;
            }
        }
        // Default protocols based on type
        return device.type === 'ble' ? 'ble' : 'bluetooth';
    }
}
exports.BluetoothDiscoveryProvider = BluetoothDiscoveryProvider;
//# sourceMappingURL=BluetoothDiscoveryProvider.js.map