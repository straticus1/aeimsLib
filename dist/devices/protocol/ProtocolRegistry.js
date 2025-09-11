"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolRegistry = void 0;
const events_1 = require("events");
/**
 * Protocol Registry
 * Central registry for device communication protocols
 */
class ProtocolRegistry extends events_1.EventEmitter {
    constructor() {
        super();
        this.protocols = new Map();
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!ProtocolRegistry.instance) {
            ProtocolRegistry.instance = new ProtocolRegistry();
        }
        return ProtocolRegistry.instance;
    }
    /**
     * Register a new protocol
     */
    registerProtocol(protocol) {
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
    unregisterProtocol(protocolId) {
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
    getProtocol(protocolId) {
        const protocol = this.protocols.get(protocolId);
        if (!protocol) {
            throw new Error(`Protocol ${protocolId} not found`);
        }
        return protocol;
    }
    /**
     * Get all registered protocols
     */
    getProtocols() {
        return Array.from(this.protocols.values());
    }
    /**
     * Set default protocol
     */
    setDefaultProtocol(protocolId) {
        if (!this.protocols.has(protocolId)) {
            throw new Error(`Protocol ${protocolId} not found`);
        }
        this.defaultProtocol = protocolId;
        this.emit('defaultProtocolChanged', protocolId);
    }
    /**
     * Get default protocol
     */
    getDefaultProtocol() {
        return this.defaultProtocol ?
            this.protocols.get(this.defaultProtocol) :
            undefined;
    }
    /**
     * Find suitable protocol for device
     */
    findProtocolForDevice(deviceInfo) {
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
    createHandler(protocolId) {
        const protocol = this.getProtocol(protocolId);
        return new protocol.handler();
    }
    validateProtocol(protocol) {
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
exports.ProtocolRegistry = ProtocolRegistry;
//# sourceMappingURL=ProtocolRegistry.js.map