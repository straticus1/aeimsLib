import { BaseProtocol } from './BaseProtocol';
import { ProtocolCapabilities } from './ProtocolRegistry';
import { ProtocolError, ProtocolErrorType, ProtocolOptions } from './BaseProtocol';
import { EventEmitter } from 'events';

interface BLEOptions extends ProtocolOptions {
  serviceUUID?: string;
  characteristicUUID?: string;
  scanTimeout?: number;
  mtu?: number;
  autoReconnect?: boolean;
  rssiThreshold?: number;
}

interface BLEDeviceInfo {
  id: string;
  name?: string;
  rssi: number;
  services: string[];
  manufacturer?: {
    id: number;
    data?: Buffer;
  };
}

/**
 * BLE Protocol Implementation
 */
export class BLEProtocol extends BaseProtocol {
  private device: any; // Noble/Web Bluetooth device
  private characteristic: any;
  private scanTimer?: NodeJS.Timeout;
  private mtu: number = 20;
  private pendingRead?: {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  };

  constructor(options: BLEOptions = {}) {
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

    this.initializeBLE();
  }

  /**
   * Connect to BLE device
   */
  protected async doConnect(options: {
    deviceId?: string;
    name?: string;
    serviceUUID?: string;
    rssiThreshold?: number;
  }): Promise<void> {
    const device = await this.findDevice(options);
    if (!device) {
      throw new ProtocolError(
        ProtocolErrorType.CONNECTION_FAILED,
        'Device not found'
      );
    }

    try {
      await this.connectToDevice(device);
      await this.setupCharacteristic();
    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.CONNECTION_FAILED,
        'Failed to setup device',
        error
      );
    }
  }

  /**
   * Disconnect from BLE device
   */
  protected async doDisconnect(): Promise<void> {
    if (!this.device) return;

    try {
      await this.device.disconnect();
      this.device = null;
      this.characteristic = null;
    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.DISCONNECTION_FAILED,
        'Failed to disconnect',
        error
      );
    }
  }

  /**
   * Send command via BLE
   */
  protected async doSendCommand(command: any): Promise<any> {
    if (!this.characteristic) {
      throw new ProtocolError(
        ProtocolErrorType.INVALID_STATE,
        'No characteristic available'
      );
    }

    try {
      const data = await this.encode(command);
      await this.writeData(data);
      return await this.readResponse();
    } catch (error) {
      throw new ProtocolError(
        ProtocolErrorType.COMMAND_FAILED,
        'Failed to send command',
        error
      );
    }
  }

  private async initializeBLE() {
    // Initialize BLE stack based on platform
    if (typeof window !== 'undefined') {
      // Browser environment - Web Bluetooth
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth not available');
      }
    } else {
      // Node environment - Noble
      try {
        const noble = require('@abandonware/noble');
        await noble.ready();
      } catch (error) {
        throw new Error('Failed to initialize Noble');
      }
    }
  }

  private async findDevice(options: {
    deviceId?: string;
    name?: string;
    serviceUUID?: string;
    rssiThreshold?: number;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopScanning();
        reject(new Error('Scan timeout'));
      }, (this.options as BLEOptions).scanTimeout || 10000);

      const onDiscovery = (device: BLEDeviceInfo) => {
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

  private matchDevice(
    device: BLEDeviceInfo,
    options: {
      deviceId?: string;
      name?: string;
      serviceUUID?: string;
      rssiThreshold?: number;
    }
  ): boolean {
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
                     (this.options as BLEOptions).rssiThreshold || 
                     -70;
    if (device.rssi < threshold) {
      return false;
    }

    return true;
  }

  private async startScanning(
    serviceUUID?: string,
    onDiscovery?: (device: BLEDeviceInfo) => void
  ): Promise<void> {
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
    } else {
      // Noble
      const noble = require('@abandonware/noble');
      noble.on('discover', (peripheral: any) => {
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

      await noble.startScanningAsync(
        serviceUUID ? [serviceUUID] : [],
        false
      );
    }
  }

  private stopScanning(): void {
    if (typeof window !== 'undefined') {
      // Web Bluetooth doesn't need explicit stop
    } else {
      // Noble
      const noble = require('@abandonware/noble');
      noble.stopScanning();
    }
  }

  private async connectToDevice(device: any): Promise<void> {
    if (typeof window !== 'undefined') {
      // Web Bluetooth
      await device.gatt.connect();
      this.device = device;
    } else {
      // Noble
      await device.connectAsync();
      this.device = device;
    }

    // Setup disconnect handler
    this.device.on('disconnect', () => {
      this.handleDisconnect();
    });
  }

  private async setupCharacteristic(): Promise<void> {
    const serviceUUID = (this.options as BLEOptions).serviceUUID;
    const characteristicUUID = (this.options as BLEOptions).characteristicUUID;

    if (!serviceUUID || !characteristicUUID) {
      throw new Error('Service or characteristic UUID not specified');
    }

    if (typeof window !== 'undefined') {
      // Web Bluetooth
      const service = await this.device.gatt.getPrimaryService(serviceUUID);
      this.characteristic = await service.getCharacteristic(characteristicUUID);
    } else {
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

  private async setupNotifications(): Promise<void> {
    if (typeof window !== 'undefined') {
      // Web Bluetooth
      this.characteristic.addEventListener(
        'characteristicvaluechanged',
        (event: any) => {
          this.handleNotification(event.target.value);
        }
      );
      await this.characteristic.startNotifications();
    } else {
      // Noble
      this.characteristic.on('notify', (data: Buffer) => {
        this.handleNotification(data);
      });
      await this.characteristic.subscribeAsync();
    }
  }

  private async writeData(data: Buffer): Promise<void> {
    const chunks = this.chunkData(data);
    
    for (const chunk of chunks) {
      if (typeof window !== 'undefined') {
        // Web Bluetooth
        await this.characteristic.writeValue(chunk);
      } else {
        // Noble
        await this.characteristic.writeAsync(chunk, false);
      }
    }
  }

  private chunkData(data: Buffer): Buffer[] {
    const chunks: Buffer[] = [];
    for (let i = 0; i < data.length; i += this.mtu) {
      chunks.push(data.slice(i, i + this.mtu));
    }
    return chunks;
  }

  private async readResponse(): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRead) {
          const { reject } = this.pendingRead;
          this.pendingRead = undefined;
          reject(new Error('Read timeout'));
        }
      }, this.options.commandTimeout || 5000);

      this.pendingRead = {
        resolve: (value: any) => {
          clearTimeout(timeout);
          this.pendingRead = undefined;
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.pendingRead = undefined;
          reject(error);
        }
      };
    });
  }

  private handleNotification(data: Buffer): void {
    if (this.pendingRead) {
      const { resolve } = this.pendingRead;
      this.pendingRead = undefined;
      resolve(this.decode(data));
    }
  }

  private handleDisconnect(): void {
    this.connected = false;
    this.characteristic = null;

    if (this.pendingRead) {
      const { reject } = this.pendingRead;
      this.pendingRead = undefined;
      reject(new Error('Device disconnected'));
    }

    this.emit('disconnected');

    // Attempt reconnection if enabled
    if ((this.options as BLEOptions).autoReconnect) {
      this.connect({});
    }
  }

  // Optional compression implementation
  protected async compress(data: Buffer): Promise<Buffer> {
    // Implement compression if needed
    return data;
  }

  protected async decompress(data: Buffer): Promise<Buffer> {
    // Implement decompression if needed
    return data;
  }
}
