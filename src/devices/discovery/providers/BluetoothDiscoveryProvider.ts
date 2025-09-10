import { EventEmitter } from 'events';
import { DiscoveryProvider, DiscoveredDevice } from '../DeviceDiscovery';
import * as noble from '@abandonware/noble';
import * as bluetooth from 'node-bluetooth';

interface BluetoothDiscoveryOptions {
  // Device filtering
  allowedDevices?: string[];           // Allowed device names/addresses
  ignoredDevices?: string[];          // Ignored device names/addresses
  serviceUUIDs?: string[];            // Required service UUIDs (BLE)
  rssiThreshold?: number;             // Minimum signal strength
  
  // Discovery modes
  enableClassic?: boolean;            // Enable classic Bluetooth
  enableBLE?: boolean;                // Enable BLE
  
  // Scan settings
  scanDuration?: number;              // Scan duration in ms
  scanInterval?: number;              // Time between scans
  connectTimeout?: number;            // Connection timeout
  
  // Device identification
  deviceMatchers?: Array<{
    pattern: RegExp;
    protocol: string;
  }>;
}

interface BluetoothDevice {
  // Common properties
  id: string;
  address: string;
  name?: string;
  type: 'classic' | 'ble';
  rssi?: number;
  manufacturerData?: Buffer;
  serviceData?: Map<string, Buffer>;
  lastSeen: number;

  // Classic Bluetooth specific
  deviceClass?: number;
  majorClass?: number;
  minorClass?: number;
  services?: string[];

  // BLE specific
  peripheral?: noble.Peripheral;
  advertisement?: noble.Advertisement;
  connectable?: boolean;
  servicesResolved?: boolean;
  characteristics?: Map<string, noble.Characteristic>;
}

/**
 * Bluetooth Discovery Provider
 * Discovers both classic Bluetooth and BLE devices
 */
export class BluetoothDiscoveryProvider extends EventEmitter implements DiscoveryProvider {
  readonly id: string = 'bluetooth';
  readonly name: string = 'Bluetooth Device Discovery';

  private options: Required<BluetoothDiscoveryOptions>;
  private scanning: boolean = false;
  private scanTimer?: NodeJS.Timeout;
  private discoveredDevices = new Map<string, BluetoothDevice>();
  
  // Device discovery instances
  private bleManager?: typeof noble;
  private classicManager?: bluetooth.DeviceINQ;

  constructor(options: BluetoothDiscoveryOptions = {}) {
    super();
    this.options = this.initializeOptions(options);
  }

  /**
   * Check if provider is active
   */
  isActive(): boolean {
    return this.scanning;
  }

  /**
   * Start device discovery
   */
  async start(): Promise<void> {
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

    } catch (error) {
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
  async stop(): Promise<void> {
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
  async scan(duration?: number): Promise<void> {
    if (!this.scanning) {
      return;
    }

    await this.startScanning(duration);
  }

  private initializeOptions(options: BluetoothDiscoveryOptions): Required<BluetoothDiscoveryOptions> {
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
  private async initializeBLE(): Promise<void> {
    this.bleManager = noble;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('BLE initialization timeout'));
      }, this.options.connectTimeout);

      const cleanup = () => {
        this.bleManager!.removeListener('stateChange', onStateChange);
        clearTimeout(timeout);
      };

      const onStateChange = (state: string) => {
        if (state === 'poweredOn') {
          cleanup();
          resolve();
        } else if (state === 'poweredOff') {
          cleanup();
          reject(new Error('Bluetooth adapter is powered off'));
        }
      };

      this.bleManager.on('stateChange', onStateChange);

      // Setup discovery handlers
      this.bleManager.on('discover', (peripheral: noble.Peripheral) => {
        this.handleBLEDiscovery(peripheral);
      });
    });
  }

  /**
   * Initialize Classic Bluetooth discovery
   */
  private async initializeClassic(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.classicManager = new bluetooth.DeviceINQ();

        this.classicManager.on('found', (address: string, name: string) => {
          this.handleClassicDiscovery(address, name);
        });

        this.classicManager.on('finished', () => {
          // Classic scan complete
          this.scanTimer = setTimeout(() => {
            this.startScanning();
          }, this.options.scanInterval);
        });

        resolve();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start scanning for devices
   */
  private async startScanning(duration?: number): Promise<void> {
    const scanDuration = duration || this.options.scanDuration;

    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = undefined;
    }

    // Start BLE scanning
    if (this.options.enableBLE && this.bleManager) {
      this.bleManager.startScanning(
        this.options.serviceUUIDs,
        true  // Allow duplicates for continuous RSSI updates
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
  private async handleBLEDiscovery(peripheral: noble.Peripheral): Promise<void> {
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
          serviceData: new Map(
            Object.entries(advertisement.serviceData || {})
          ),
          connectable: advertisement.connectable,
          lastSeen: Date.now()
        };
        this.discoveredDevices.set(address, device);

        // Resolve services if connectable
        if (advertisement.connectable) {
          await this.resolveBLEServices(device);
        }

      } else {
        // Update existing device
        device.rssi = peripheral.rssi;
        device.lastSeen = Date.now();
        
        if (advertisement.manufacturerData) {
          device.manufacturerData = advertisement.manufacturerData;
        }
        if (advertisement.serviceData) {
          device.serviceData = new Map(
            Object.entries(advertisement.serviceData)
          );
        }
      }

      // Emit discovery
      const discoveredDevice = await this.createDeviceInfo(device);
      if (discoveredDevice) {
        this.emit('deviceDiscovered', discoveredDevice);
      }

    } catch (error) {
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
  private async handleClassicDiscovery(address: string, name: string): Promise<void> {
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

      } else {
        // Update existing device
        device.lastSeen = Date.now();
      }

      // Emit discovery
      const discoveredDevice = await this.createDeviceInfo(device);
      if (discoveredDevice) {
        this.emit('deviceDiscovered', discoveredDevice);
      }

    } catch (error) {
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
  private async resolveBLEServices(device: BluetoothDevice): Promise<void> {
    if (!device.peripheral || device.servicesResolved) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Service discovery timeout'));
      }, this.options.connectTimeout);

      const cleanup = () => {
        device.peripheral!.disconnect();
        clearTimeout(timeout);
      };

      // Connect and discover services
      device.peripheral.connect((error) => {
        if (error) {
          cleanup();
          reject(error);
          return;
        }

        device.peripheral!.discoverAllServicesAndCharacteristics(
          (error, services, characteristics) => {
            if (error) {
              cleanup();
              reject(error);
              return;
            }

            // Store characteristics by UUID
            device.characteristics = new Map(
              characteristics.map(c => [c.uuid, c])
            );
            
            device.servicesResolved = true;
            cleanup();
            resolve();
          }
        );
      });
    });
  }

  /**
   * Resolve Classic Bluetooth services
   */
  private async resolveClassicServices(device: BluetoothDevice): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
  private shouldProcessDevice(address: string, name?: string): boolean {
    // Check ignore list
    if (this.options.ignoredDevices.some(pattern => 
      address.includes(pattern) || (name && name.includes(pattern))
    )) {
      return false;
    }

    // Check allow list
    if (this.options.allowedDevices.length > 0) {
      return this.options.allowedDevices.some(pattern =>
        address.includes(pattern) || (name && name.includes(pattern))
      );
    }

    return true;
  }

  /**
   * Create device info from discovered device
   */
  private async createDeviceInfo(device: BluetoothDevice): Promise<DiscoveredDevice | undefined> {
    // Try to determine protocol
    const protocol = this.findMatchingProtocol(device);
    if (!protocol) return undefined;

    // Build capabilities list
    const capabilities: string[] = [];
    if (device.type === 'ble') {
      capabilities.push('ble');
      if (device.connectable) {
        capabilities.push('connectable');
      }
      if (device.characteristics) {
        capabilities.push('gatt');
      }
    } else {
      capabilities.push('bluetooth-classic');
      if (device.services) {
        capabilities.push(...device.services);
      }
    }

    // Build device info
    const info: DiscoveredDevice = {
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
        serviceData: Object.fromEntries(
          Array.from(device.serviceData || []).map(([k, v]) => [k, v.toString('hex')])
        ),
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
  private findMatchingProtocol(device: BluetoothDevice): string | undefined {
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
