"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLEProtocol = void 0;
const BaseProtocol_1 = require("./BaseProtocol");
const BaseProtocol_2 = require("./BaseProtocol");
/**
 * BLE Protocol Implementation
 */
class BLEProtocol extends BaseProtocol_1.BaseProtocol {
    constructor(options = {}) {
        super(options, {
            bidirectional: true,
            binary: true,
            encryption: false,
            compression: false,
            batching: false,
            maxPacketSize: options.mtu || 20,
            features: new Set([
                'notify',
                'write',
                'read',
                'rssi'
            ])
        });
        this.mtu = 20;
        this.initializeBLE();
    }
    /**
     * Connect to BLE device
     */
    async doConnect(options) {
        const device = await this.findDevice(options);
        if (!device) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.CONNECTION_FAILED, 'Device not found');
        }
        try {
            await this.connectToDevice(device);
            await this.setupCharacteristic();
        }
        catch (error) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.CONNECTION_FAILED, 'Failed to setup device', error);
        }
    }
    /**
     * Disconnect from BLE device
     */
    async doDisconnect() {
        if (!this.device)
            return;
        try {
            await this.device.disconnect();
            this.device = null;
            this.characteristic = null;
        }
        catch (error) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.DISCONNECTION_FAILED, 'Failed to disconnect', error);
        }
    }
    /**
     * Send command via BLE
     */
    async doSendCommand(command) {
        if (!this.characteristic) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.INVALID_STATE, 'No characteristic available');
        }
        try {
            const data = await this.encode(command);
            await this.writeData(data);
            return await this.readResponse();
        }
        catch (error) {
            throw new BaseProtocol_2.ProtocolError(BaseProtocol_2.ProtocolErrorType.COMMAND_FAILED, 'Failed to send command', error);
        }
    }
    async initializeBLE() {
        // Initialize BLE stack based on platform
        if (typeof window !== 'undefined') {
            // Browser environment - Web Bluetooth
            if (!navigator.bluetooth) {
                throw new Error('Web Bluetooth not available');
            }
        }
        else {
            // Node environment - Noble
            try {
                const noble = require('@abandonware/noble');
                await noble.ready();
            }
            catch (error) {
                throw new Error('Failed to initialize Noble');
            }
        }
    }
    async findDevice(options) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.stopScanning();
                reject(new Error('Scan timeout'));
            }, this.options.scanTimeout || 10000);
            const onDiscovery = (device) => {
                if (this.matchDevice(device, options)) {
                    clearTimeout(timeout);
                    this.stopScanning();
                    resolve(device);
                }
            };
            this.startScanning(options.serviceUUID, onDiscovery)
                .catch(error => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    matchDevice(device, options) {
        // Check device ID
        if (options.deviceId && device.id !== options.deviceId) {
            return false;
        }
        // Check name
        if (options.name &&
            (!device.name || !device.name.includes(options.name))) {
            return false;
        }
        // Check service UUID
        if (options.serviceUUID &&
            !device.services.includes(options.serviceUUID)) {
            return false;
        }
        // Check RSSI threshold
        const threshold = options.rssiThreshold ||
            this.options.rssiThreshold ||
            -70;
        if (device.rssi < threshold) {
            return false;
        }
        return true;
    }
    async startScanning(serviceUUID, onDiscovery) {
        if (typeof window !== 'undefined') {
            // Web Bluetooth
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    ...(serviceUUID ? [{ services: [serviceUUID] }] : []),
                    ...(this.options.name ? [{ name: this.options.name }] : [])
                ],
                optionalServices: []
            });
            if (onDiscovery) {
                onDiscovery({
                    id: device.id,
                    name: device.name,
                    rssi: -50, // Web Bluetooth doesn't provide RSSI
                    services: [],
                    manufacturer: undefined
                });
            }
        }
        else {
            // Noble
            const noble = require('@abandonware/noble');
            noble.on('discover', (peripheral) => {
                if (onDiscovery) {
                    onDiscovery({
                        id: peripheral.id,
                        name: peripheral.advertisement.localName,
                        rssi: peripheral.rssi,
                        services: peripheral.advertisement.serviceUuids,
                        manufacturer: peripheral.advertisement.manufacturerData ? {
                            id: peripheral.advertisement.manufacturerData.readUInt16LE(0),
                            data: peripheral.advertisement.manufacturerData.slice(2)
                        } : undefined
                    });
                }
            });
            await noble.startScanningAsync(serviceUUID ? [serviceUUID] : [], false);
        }
    }
    stopScanning() {
        if (typeof window !== 'undefined') {
            // Web Bluetooth doesn't need explicit stop
        }
        else {
            // Noble
            const noble = require('@abandonware/noble');
            noble.stopScanning();
        }
    }
    async connectToDevice(device) {
        if (typeof window !== 'undefined') {
            // Web Bluetooth
            await device.gatt.connect();
            this.device = device;
        }
        else {
            // Noble
            await device.connectAsync();
            this.device = device;
        }
        // Setup disconnect handler
        this.device.on('disconnect', () => {
            this.handleDisconnect();
        });
    }
    async setupCharacteristic() {
        const serviceUUID = this.options.serviceUUID;
        const characteristicUUID = this.options.characteristicUUID;
        if (!serviceUUID || !characteristicUUID) {
            throw new Error('Service or characteristic UUID not specified');
        }
        if (typeof window !== 'undefined') {
            // Web Bluetooth
            const service = await this.device.gatt.getPrimaryService(serviceUUID);
            this.characteristic = await service.getCharacteristic(characteristicUUID);
        }
        else {
            // Noble
            const services = await this.device.discoverServicesAsync([serviceUUID]);
            const characteristics = await services[0].discoverCharacteristicsAsync([
                characteristicUUID
            ]);
            this.characteristic = characteristics[0];
        }
        // Setup notification handler
        await this.setupNotifications();
    }
    async setupNotifications() {
        if (typeof window !== 'undefined') {
            // Web Bluetooth
            this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleNotification(event.target.value);
            });
            await this.characteristic.startNotifications();
        }
        else {
            // Noble
            this.characteristic.on('notify', (data) => {
                this.handleNotification(data);
            });
            await this.characteristic.subscribeAsync();
        }
    }
    async writeData(data) {
        const chunks = this.chunkData(data);
        for (const chunk of chunks) {
            if (typeof window !== 'undefined') {
                // Web Bluetooth
                await this.characteristic.writeValue(chunk);
            }
            else {
                // Noble
                await this.characteristic.writeAsync(chunk, false);
            }
        }
    }
    chunkData(data) {
        const chunks = [];
        for (let i = 0; i < data.length; i += this.mtu) {
            chunks.push(data.slice(i, i + this.mtu));
        }
        return chunks;
    }
    async readResponse() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pendingRead) {
                    const { reject } = this.pendingRead;
                    this.pendingRead = undefined;
                    reject(new Error('Read timeout'));
                }
            }, this.options.commandTimeout || 5000);
            this.pendingRead = {
                resolve: (value) => {
                    clearTimeout(timeout);
                    this.pendingRead = undefined;
                    resolve(value);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    this.pendingRead = undefined;
                    reject(error);
                }
            };
        });
    }
    handleNotification(data) {
        if (this.pendingRead) {
            const { resolve } = this.pendingRead;
            this.pendingRead = undefined;
            resolve(this.decode(data));
        }
    }
    handleDisconnect() {
        this.connected = false;
        this.characteristic = null;
        if (this.pendingRead) {
            const { reject } = this.pendingRead;
            this.pendingRead = undefined;
            reject(new Error('Device disconnected'));
        }
        this.emit('disconnected');
        // Attempt reconnection if enabled
        if (this.options.autoReconnect) {
            this.connect({});
        }
    }
    // Optional compression implementation
    async compress(data) {
        // Implement compression if needed
        return data;
    }
    async decompress(data) {
        // Implement decompression if needed
        return data;
    }
}
exports.BLEProtocol = BLEProtocol;
//# sourceMappingURL=BLEProtocol.js.map