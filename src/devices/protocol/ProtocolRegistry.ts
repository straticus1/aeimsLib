import { EventEmitter } from 'events';

/**
 * Protocol Capabilities
 * Defines what features a protocol supports
 */
export interface ProtocolCapabilities {
  bidirectional: boolean;
  binary: boolean;
  encryption: boolean;
  compression: boolean;
  batching: boolean;
  maxPacketSize?: number;
  maxBatchSize?: number;
  features: Set<string>;
}

/**
 * Protocol Handler Interface
 */
export interface ProtocolHandler {
  capabilities: ProtocolCapabilities;
  
  // Connection management
  connect(options: any): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Command handling
  sendCommand(command: any): Promise<any>;
  sendBatch?(commands: any[]): Promise<any[]>;

  // Data handling
  encode(data: any): Promise<Buffer>;
  decode(data: Buffer): Promise<any>;
}

/**
 * Protocol Registration
 */
export interface ProtocolRegistration {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: ProtocolCapabilities;
  handler: new () => ProtocolHandler;
  matchDevice?(info: any): boolean;
}

/**
 * Protocol Registry
 * Central registry for device communication protocols
 */
export class ProtocolRegistry extends EventEmitter {
  private static instance: ProtocolRegistry;
  private protocols: Map<string, ProtocolRegistration> = new Map();
  private defaultProtocol?: string;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ProtocolRegistry {
    if (!ProtocolRegistry.instance) {
      ProtocolRegistry.instance = new ProtocolRegistry();
    }
    return ProtocolRegistry.instance;
  }

  /**
   * Register a new protocol
   */
  registerProtocol(protocol: ProtocolRegistration): void {
    if (this.protocols.has(protocol.id)) {
      throw new Error(`Protocol ${protocol.id} is already registered`);
    }

    this.validateProtocol(protocol);
    this.protocols.set(protocol.id, protocol);

    // Set as default if first protocol
    if (!this.defaultProtocol) {
      this.defaultProtocol = protocol.id;
    }

    this.emit('protocolRegistered', protocol);
  }

  /**
   * Unregister a protocol
   */
  unregisterProtocol(protocolId: string): void {
    if (!this.protocols.has(protocolId)) {
      throw new Error(`Protocol ${protocolId} is not registered`);
    }

    // Clear default if this was the default
    if (this.defaultProtocol === protocolId) {
      this.defaultProtocol = undefined;
    }

    this.protocols.delete(protocolId);
    this.emit('protocolUnregistered', protocolId);
  }

  /**
   * Get protocol by ID
   */
  getProtocol(protocolId: string): ProtocolRegistration {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      throw new Error(`Protocol ${protocolId} not found`);
    }
    return protocol;
  }

  /**
   * Get all registered protocols
   */
  getProtocols(): ProtocolRegistration[] {
    return Array.from(this.protocols.values());
  }

  /**
   * Set default protocol
   */
  setDefaultProtocol(protocolId: string): void {
    if (!this.protocols.has(protocolId)) {
      throw new Error(`Protocol ${protocolId} not found`);
    }
    this.defaultProtocol = protocolId;
    this.emit('defaultProtocolChanged', protocolId);
  }

  /**
   * Get default protocol
   */
  getDefaultProtocol(): ProtocolRegistration | undefined {
    return this.defaultProtocol ? 
      this.protocols.get(this.defaultProtocol) : 
      undefined;
  }

  /**
   * Find suitable protocol for device
   */
  findProtocolForDevice(deviceInfo: any): ProtocolRegistration | undefined {
    // Try explicit matching first
    for (const protocol of this.protocols.values()) {
      if (protocol.matchDevice && protocol.matchDevice(deviceInfo)) {
        return protocol;
      }
    }

    // Fall back to default protocol
    return this.getDefaultProtocol();
  }

  /**
   * Create protocol handler instance
   */
  createHandler(protocolId: string): ProtocolHandler {
    const protocol = this.getProtocol(protocolId);
    return new protocol.handler();
  }

  private validateProtocol(protocol: ProtocolRegistration): void {
    // Validate required fields
    if (!protocol.id || !protocol.name || !protocol.version) {
      throw new Error('Protocol registration missing required fields');
    }

    // Validate capabilities
    const caps = protocol.capabilities;
    if (!caps || typeof caps !== 'object') {
      throw new Error('Protocol must specify capabilities');
    }

    // Required capability fields
    const requiredCaps = [
      'bidirectional',
      'binary',
      'encryption',
      'compression',
      'batching',
      'features'
    ];

    for (const cap of requiredCaps) {
      if (!(cap in caps)) {
        throw new Error(`Protocol capabilities missing ${cap}`);
      }
    }

    // Validate sizes if specified
    if (caps.maxPacketSize !== undefined && caps.maxPacketSize <= 0) {
      throw new Error('maxPacketSize must be positive');
    }
    if (caps.maxBatchSize !== undefined && caps.maxBatchSize <= 0) {
      throw new Error('maxBatchSize must be positive');
    }

    // Validate features
    if (!(caps.features instanceof Set)) {
      throw new Error('features must be a Set');
    }

    // Validate handler
    if (typeof protocol.handler !== 'function') {
      throw new Error('Protocol must provide a handler constructor');
    }

    // Validate matcher if provided
    if (protocol.matchDevice && typeof protocol.matchDevice !== 'function') {
      throw new Error('matchDevice must be a function');
    }
  }
}
