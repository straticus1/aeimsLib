import { EventEmitter } from 'events';
import { DiscoveryProvider } from '../DeviceDiscovery';
interface NetworkDiscoveryOptions {
    networks?: string[];
    ports?: number[];
    excludeNetworks?: string[];
    excludePorts?: number[];
    services?: Array<{
        name: string;
        protocol: 'tcp' | 'udp';
        port: number;
        probe?: {
            data: Buffer | string;
            responsePattern?: RegExp;
            timeout?: number;
        };
    }>;
    broadcastEnabled?: boolean;
    broadcastPort?: number;
    broadcastInterval?: number;
    broadcastMessage?: string;
    mdnsEnabled?: boolean;
    mdnsTypes?: string[];
    scanTimeout?: number;
    scanConcurrency?: number;
    probeTimeout?: number;
    retryAttempts?: number;
    deviceMatchers?: Array<{
        pattern: RegExp;
        protocol: string;
    }>;
}
/**
 * Network Discovery Provider
 * Discovers network-connected devices using multiple methods:
 * - Network scanning
 * - Service discovery
 * - Broadcast discovery
 * - MDNS/Bonjour
 */
export declare class NetworkDiscoveryProvider extends EventEmitter implements DiscoveryProvider {
    readonly id: string;
    readonly name: string;
    private options;
    private scanning;
    private broadcastTimer?;
    private discoveredDevices;
    private activeScans;
    private broadcastSocket?;
    private mdnsResponders;
    constructor(options?: NetworkDiscoveryOptions);
    /**
     * Check if provider is active
     */
    isActive(): boolean;
    /**
     * Start device discovery
     */
    start(): Promise<void>;
    /**
     * Stop device discovery
     */
    stop(): Promise<void>;
    /**
     * Scan for devices
     */
    scan(duration?: number): Promise<void>;
    private initializeOptions;
    /**
     * Get list of networks to scan
     */
    private getNetworksToScan;
    /**
     * Get network address from IP and netmask
     */
    private getNetworkAddress;
    /**
     * Check if network should be scanned
     */
    private shouldScanNetwork;
    /**
     * Scan networks for devices
     */
    private scanNetworks;
    /**
     * Scan individual network
     */
    private scanNetwork;
    /**
     * Generate IP addresses for network
     */
    private generateAddresses;
    /**
     * Scan individual IP address
     */
    private scanAddress;
    /**
     * Check if host is reachable
     */
    private pingHost;
    /**
     * Update device information
     */
    private updateDeviceInfo;
    /**
     * Scan ports on device
     */
    private scanPorts;
    /**
     * Scan individual port
     */
    private scanPort;
    /**
     * Probe service for additional info
     */
    private probeService;
    /**
     * Start broadcast discovery
     */
    private startBroadcastDiscovery;
    /**
     * Send broadcast message
     */
    private sendBroadcast;
    /**
     * Handle broadcast response
     */
    private handleBroadcastResponse;
    /**
     * Start MDNS discovery
     */
    private startMdnsDiscovery;
    /**
     * Parse probe response
     */
    private parseProbeResponse;
    /**
     * Create device info from discovered device
     */
    private createDeviceInfo;
    /**
     * Find matching protocol for device
     */
    private findMatchingProtocol;
    /**
     * Split array into chunks
     */
    private chunkArray;
}
export {};
