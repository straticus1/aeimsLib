"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistenceManager = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const DeviceError_1 = require("../errors/DeviceError");
/**
 * Persistence Manager
 * Handles device state persistence with proper locking and transaction support
 */
class PersistenceManager {
    constructor() {
        this.locked = false;
        this.dataDir = process.env.AEIMS_DATA_DIR ||
            (0, path_1.join)(process.cwd(), '.aeims');
        this.lockFile = (0, path_1.join)(this.dataDir, 'lock');
        this.stateFile = (0, path_1.join)(this.dataDir, 'devices.json');
    }
    /**
     * Initialize storage
     */
    async initialize() {
        try {
            await (0, promises_1.mkdir)(this.dataDir, { recursive: true });
        }
        catch (error) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.PERSISTENCE_ERROR, `Failed to initialize storage: ${error.message}`);
        }
    }
    /**
     * Acquire lock for atomic operations
     */
    async acquireLock() {
        if (this.locked) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.PERSISTENCE_ERROR, 'State is already locked');
        }
        try {
            await (0, promises_1.writeFile)(this.lockFile, String(process.pid));
            this.locked = true;
        }
        catch (error) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.PERSISTENCE_ERROR, `Failed to acquire lock: ${error.message}`);
        }
    }
    /**
     * Release lock
     */
    async releaseLock() {
        if (!this.locked)
            return;
        try {
            await (0, promises_1.unlink)(this.lockFile);
            this.locked = false;
        }
        catch (error) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.PERSISTENCE_ERROR, `Failed to release lock: ${error.message}`);
        }
    }
    /**
     * Load device state
     */
    async loadDevices() {
        try {
            await this.initialize();
            let data;
            try {
                data = await (0, promises_1.readFile)(this.stateFile, 'utf8');
            }
            catch (error) {
                // Return empty state if file doesn't exist
                if (error.code === 'ENOENT') {
                    return {
                        devices: new Map(),
                        defaultDevice: null,
                        lastUpdated: Date.now()
                    };
                }
                throw error;
            }
            const state = JSON.parse(data);
            return {
                devices: new Map(state.devices),
                defaultDevice: state.defaultDevice,
                lastUpdated: state.lastUpdated
            };
        }
        catch (error) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.PERSISTENCE_ERROR, `Failed to load device state: ${error.message}`);
        }
    }
    /**
     * Save device state
     */
    async saveDevices(devices) {
        try {
            await this.initialize();
            const state = {
                devices: Array.from(devices.entries()),
                defaultDevice: Array.from(devices.values())
                    .find(device => device.isDefault)?.id || null,
                lastUpdated: Date.now()
            };
            await (0, promises_1.writeFile)(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
        }
        catch (error) {
            throw new DeviceError_1.DeviceError(DeviceError_1.ErrorType.PERSISTENCE_ERROR, `Failed to save device state: ${error.message}`);
        }
    }
    /**
     * Execute operations in a transaction
     */
    async transaction(operations) {
        await this.acquireLock();
        try {
            const result = await operations();
            await this.releaseLock();
            return result;
        }
        catch (error) {
            await this.releaseLock();
            throw error;
        }
    }
}
exports.PersistenceManager = PersistenceManager;
//# sourceMappingURL=PersistenceManager.js.map