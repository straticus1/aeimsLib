import { EventEmitter } from 'events';
import { DiscoveryProvider, DiscoveredDevice } from '../DeviceDiscovery';
import { SerialPort } from 'serialport';

/**
 * USB Discovery Provider Options
 */
interface USBDiscoveryOptions {
  // Port filtering
  allowedPorts?: string[];
  ignorePorts?: string[];
  matchPatterns?: string[];
  
  // Discovery settings
  pollInterval?: number;
  autoConnect?: boolean;
  connectionTimeout?: number;
  
  // Device identification
  probeCommands?: Array<{
    data: Buffer | string;
    responsePattern?: RegExp;
    timeout?: number;
  }>;
  
  // Driver support
  supportedDrivers?: string[];
  driverMatchers?: Array<{
    pattern: RegExp;
    driver: string;
  }>;
}

/**
 * USB Device Port Info
 */
interface USBPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  locationId?: string;
  vendorId?: string;
  productId?: string;
  friendlyName?: string;
}

/**
 * USB Discovery Provider Implementation
 */
export class USBDiscoveryProvider extends EventEmitter implements DiscoveryProvider {
  readonly id: string = 'usb';
  readonly name: string = 'USB Device Discovery';

  private options: Required<USBDiscoveryOptions>;
  private scanning: boolean = false;
  private pollTimer?: NodeJS.Timeout;
  private discoveredPorts = new Map<string, USBPortInfo>();
  private activeConnections = new Map<string, SerialPort>();
  private probeResults = new Map<string, any>();

  constructor(options: USBDiscoveryOptions = {}) {
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

    this.scanning = true;

    // Initial port scan
    await this.scanPorts();

    // Start polling if enabled
    if (this.options.pollInterval > 0) {
      this.pollTimer = setInterval(
        () => this.scanPorts(),
        this.options.pollInterval
      );
    }
  }

  /**
   * Stop device discovery
   */
  async stop(): Promise<void> {
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
  async scan(duration?: number): Promise<void> {
    if (!this.scanning) {
      return;
    }

    // Single scan
    await this.scanPorts();

    if (duration) {
      // Wait for specified duration
      await new Promise(resolve => 
        setTimeout(resolve, duration)
      );
    }
  }

  private initializeOptions(options: USBDiscoveryOptions): Required<USBDiscoveryOptions> {
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
  private async scanPorts(): Promise<void> {
    try {
      // Get current ports
      const ports = await SerialPort.list();

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

    } catch (error) {
      this.emit('error', {
        type: 'scan_error',
        error
      });
    }
  }

  /**
   * Process discovered port
   */
  private async processPort(port: USBPortInfo): Promise<void> {
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
  private async handleRemovedPort(path: string): Promise<void> {
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
  private shouldIgnorePort(port: USBPortInfo): boolean {
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
      return !this.options.matchPatterns.some(pattern =>
        path.includes(pattern)
      );
    }

    return false;
  }

  /**
   * Check if port info has changed
   */
  private hasPortChanged(a: USBPortInfo, b: USBPortInfo): boolean {
    return a.manufacturer !== b.manufacturer ||
           a.serialNumber !== b.serialNumber ||
           a.vendorId !== b.vendorId ||
           a.productId !== b.productId;
  }

  /**
   * Probe port for device info
   */
  private async probePort(port: USBPortInfo): Promise<void> {
    const { path } = port;

    try {
      // Create connection
      const connection = await this.openConnection(port);
      if (!connection) return;

      // Send probe commands
      const results: any = {};
      
      for (const probe of this.options.probeCommands) {
        try {
          const result = await this.sendProbe(connection, probe);
          if (result) {
            Object.assign(results, result);
          }
        } catch (error) {
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

    } catch (error) {
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
  private async openConnection(port: USBPortInfo): Promise<SerialPort | undefined> {
    const { path } = port;

    try {
      const connection = new SerialPort({
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

        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        connection.once('open', onOpen);
        connection.once('error', onError);
        connection.open();
      });

    } catch (error) {
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
  private async closeConnection(path: string, connection: SerialPort): Promise<void> {
    return new Promise<void>((resolve) => {
      if (connection.isOpen) {
        connection.close(() => {
          this.activeConnections.delete(path);
          resolve();
        });
      } else {
        this.activeConnections.delete(path);
        resolve();
      }
    });
  }

  /**
   * Send probe command
   */
  private async sendProbe(
    connection: SerialPort,
    probe: USBDiscoveryOptions['probeCommands'][0]
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Probe timeout'));
      }, probe.timeout || 1000);

      const responses: Buffer[] = [];
      
      const cleanup = () => {
        connection.removeListener('data', onData);
        clearTimeout(timeout);
      };

      const onData = (data: Buffer) => {
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
          resolve(this.parseProbeResponse(
            Buffer.concat(responses).toString()
          ));
        }, probe.timeout || 1000);
      }
    });
  }

  /**
   * Parse probe response
   */
  private parseProbeResponse(response: string | RegExpMatchArray): any {
    // Simple key-value parsing
    const result: any = {};

    if (typeof response === 'string') {
      // Split into lines
      const lines = response.split(/[\r\n]+/);
      
      for (const line of lines) {
        const [key, value] = line.split(/[=:]+/).map(s => s.trim());
        if (key && value) {
          result[key.toLowerCase()] = value;
        }
      }
    } else {
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
  private async createDeviceInfo(port: USBPortInfo): Promise<DiscoveredDevice | undefined> {
    const { path } = port;

    // Get probe results
    const probeInfo = this.probeResults.get(path) || {};

    // Try to determine device type and driver
    const driver = this.findMatchingDriver(port, probeInfo);
    if (!driver && this.options.supportedDrivers.length > 0) {
      return undefined;
    }

    // Build device info
    const device: DiscoveredDevice = {
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
  private findMatchingDriver(port: USBPortInfo, info: any): string | undefined {
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
  private generateDeviceId(port: USBPortInfo): string {
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
