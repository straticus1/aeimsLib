import { EventEmitter } from 'events';
import {
  DeviceProtocol,
  DeviceCommand,
  CommandResult,
  DeviceStatus,
  DeviceEvent,
  DeviceEventType
} from '../interfaces/device';
import { DeviceEncryption } from '../interfaces/security';
import { Logger } from '../utils/Logger';

export abstract class BaseProtocolAdapter extends EventEmitter implements DeviceProtocol {
  protected connected: boolean;
  protected lastStatus: DeviceStatus;
  protected encryption?: DeviceEncryption;
  protected logger: Logger;
  protected eventCallbacks: Set<(event: DeviceEvent) => void>;

  constructor() {
    super();
    this.connected = false;
    this.lastStatus = {
      connected: false,
      lastSeen: new Date()
    };
    this.logger = Logger.getInstance();
    this.eventCallbacks = new Set();
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendCommand(command: DeviceCommand): Promise<CommandResult>;

  async getStatus(): Promise<DeviceStatus> {
    return this.lastStatus;
  }

  setEncryption(encryption: DeviceEncryption): void {
    this.encryption = encryption;
  }

  subscribe(callback: (event: DeviceEvent) => void): void {
    this.eventCallbacks.add(callback);
  }

  unsubscribe(callback: (event: DeviceEvent) => void): void {
    this.eventCallbacks.delete(callback);
  }

  protected async emitEvent(event: DeviceEvent): Promise<void> {
    // Update last status if it's a status-related event
    if (event.type === DeviceEventType.STATUS_CHANGED && event.data) {
      this.lastStatus = {
        ...this.lastStatus,
        ...event.data,
        lastSeen: event.timestamp
      };
    }

    // Notify all subscribers
    for (const callback of this.eventCallbacks) {
      try {
        await callback(event);
      } catch (error) {
        this.logger.error(`Error in event callback: ${error}`);
      }
    }
  }

  protected async encryptCommand(command: DeviceCommand): Promise<Buffer> {
    if (!this.encryption) {
      return Buffer.from(JSON.stringify(command));
    }

    try {
      return await this.encryption.encryptCommand(
        Buffer.from(JSON.stringify(command))
      );
    } catch (error) {
      this.logger.error(`Encryption failed: ${error}`);
      throw new Error('Failed to encrypt command');
    }
  }

  protected async decryptResponse(response: Buffer): Promise<any> {
    if (!this.encryption) {
      return JSON.parse(response.toString());
    }

    try {
      const decrypted = await this.encryption.decryptResponse(response);
      return JSON.parse(decrypted.toString());
    } catch (error) {
      this.logger.error(`Decryption failed: ${error}`);
      throw new Error('Failed to decrypt response');
    }
  }

  protected createCommandResult(
    success: boolean,
    command: DeviceCommand,
    error?: string
  ): CommandResult {
    return {
      success,
      error,
      timestamp: new Date(),
      command
    };
  }
}
