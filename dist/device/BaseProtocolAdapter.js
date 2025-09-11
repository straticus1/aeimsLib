"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProtocolAdapter = void 0;
const events_1 = require("events");
const device_1 = require("../interfaces/device");
const Logger_1 = require("../utils/Logger");
class BaseProtocolAdapter extends events_1.EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.lastStatus = {
            connected: false,
            lastSeen: new Date()
        };
        this.logger = Logger_1.Logger.getInstance();
        this.eventCallbacks = new Set();
    }
    async getStatus() {
        return this.lastStatus;
    }
    setEncryption(encryption) {
        this.encryption = encryption;
    }
    subscribe(callback) {
        this.eventCallbacks.add(callback);
    }
    unsubscribe(callback) {
        this.eventCallbacks.delete(callback);
    }
    async emitEvent(event) {
        // Update last status if it's a status-related event
        if (event.type === device_1.DeviceEventType.STATUS_CHANGED && event.data) {
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
            }
            catch (error) {
                this.logger.error(`Error in event callback: ${error}`);
            }
        }
    }
    async encryptCommand(command) {
        if (!this.encryption) {
            return Buffer.from(JSON.stringify(command));
        }
        try {
            return await this.encryption.encryptCommand(Buffer.from(JSON.stringify(command)));
        }
        catch (error) {
            this.logger.error(`Encryption failed: ${error}`);
            throw new Error('Failed to encrypt command');
        }
    }
    async decryptResponse(response) {
        if (!this.encryption) {
            return JSON.parse(response.toString());
        }
        try {
            const decrypted = await this.encryption.decryptResponse(response);
            return JSON.parse(decrypted.toString());
        }
        catch (error) {
            this.logger.error(`Decryption failed: ${error}`);
            throw new Error('Failed to decrypt response');
        }
    }
    createCommandResult(success, command, error) {
        return {
            success,
            error,
            timestamp: new Date(),
            command
        };
    }
}
exports.BaseProtocolAdapter = BaseProtocolAdapter;
//# sourceMappingURL=BaseProtocolAdapter.js.map