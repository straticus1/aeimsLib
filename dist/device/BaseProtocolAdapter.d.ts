import { EventEmitter } from 'events';
import { DeviceProtocol, DeviceCommand, CommandResult, DeviceStatus, DeviceEvent } from '../interfaces/device';
import { DeviceEncryption } from '../interfaces/security';
import { Logger } from '../utils/Logger';
export declare abstract class BaseProtocolAdapter extends EventEmitter implements DeviceProtocol {
    protected connected: boolean;
    protected lastStatus: DeviceStatus;
    protected encryption?: DeviceEncryption;
    protected logger: Logger;
    protected eventCallbacks: Set<(event: DeviceEvent) => void>;
    constructor();
    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract sendCommand(command: DeviceCommand): Promise<CommandResult>;
    getStatus(): Promise<DeviceStatus>;
    setEncryption(encryption: DeviceEncryption): void;
    subscribe(callback: (event: DeviceEvent) => void): void;
    unsubscribe(callback: (event: DeviceEvent) => void): void;
    protected emitEvent(event: DeviceEvent): Promise<void>;
    protected encryptCommand(command: DeviceCommand): Promise<Buffer>;
    protected decryptResponse(response: Buffer): Promise<any>;
    protected createCommandResult(success: boolean, command: DeviceCommand, error?: string): CommandResult;
}
