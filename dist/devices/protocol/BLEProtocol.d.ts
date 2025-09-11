import { BaseProtocol } from './BaseProtocol';
import { ProtocolOptions } from './BaseProtocol';
interface BLEOptions extends ProtocolOptions {
    serviceUUID?: string;
    characteristicUUID?: string;
    scanTimeout?: number;
    mtu?: number;
    autoReconnect?: boolean;
    rssiThreshold?: number;
}
/**
 * BLE Protocol Implementation
 */
export declare class BLEProtocol extends BaseProtocol {
    private device;
    private characteristic;
    private scanTimer?;
    private mtu;
    private pendingRead?;
    constructor(options?: BLEOptions);
    /**
     * Connect to BLE device
     */
    protected doConnect(options: {
        deviceId?: string;
        name?: string;
        serviceUUID?: string;
        rssiThreshold?: number;
    }): Promise<void>;
    /**
     * Disconnect from BLE device
     */
    protected doDisconnect(): Promise<void>;
    /**
     * Send command via BLE
     */
    protected doSendCommand(command: any): Promise<any>;
    private initializeBLE;
    private findDevice;
    private matchDevice;
    private startScanning;
    private stopScanning;
    private connectToDevice;
    private setupCharacteristic;
    private setupNotifications;
    private writeData;
    private chunkData;
    private readResponse;
    private handleNotification;
    private handleDisconnect;
    protected compress(data: Buffer): Promise<Buffer>;
    protected decompress(data: Buffer): Promise<Buffer>;
}
export {};
