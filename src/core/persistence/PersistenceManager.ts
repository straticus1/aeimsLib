import { readFile, writeFile, mkdir, unlink, readdir, stat, rename } from 'fs/promises';
import { join } from 'path';
import { DeviceError, ErrorType } from '../errors/DeviceError';
import { Device } from '../DeviceManager';

interface DeviceState {
  devices: Map<string, Device>;
  defaultDevice: string | null;
  lastUpdated: number;
}

/**
 * Persistence Manager
 * Handles device state persistence with proper locking and transaction support
 */
export class PersistenceManager {
  private dataDir: string;
  private lockFile: string;
  private stateFile: string;
  private locked: boolean = false;

  constructor() {
    this.dataDir = process.env.AEIMS_DATA_DIR || 
      join(process.cwd(), '.aeims');
    this.lockFile = join(this.dataDir, 'lock');
    this.stateFile = join(this.dataDir, 'devices.json');
  }

  /**
   * Initialize storage
   */
  private async initialize() {
    try {
      await mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      throw new DeviceError(
        ErrorType.PERSISTENCE_ERROR,
        `Failed to initialize storage: ${error.message}`
      );
    }
  }

  /**
   * Acquire lock for atomic operations
   */
  private async acquireLock(): Promise<void> {
    if (this.locked) {
      throw new DeviceError(
        ErrorType.PERSISTENCE_ERROR,
        'State is already locked'
      );
    }

    try {
      await writeFile(this.lockFile, String(process.pid));
      this.locked = true;
    } catch (error) {
      throw new DeviceError(
        ErrorType.PERSISTENCE_ERROR,
        `Failed to acquire lock: ${error.message}`
      );
    }
  }

  /**
   * Release lock
   */
  private async releaseLock(): Promise<void> {
    if (!this.locked) return;

    try {
      await unlink(this.lockFile);
      this.locked = false;
    } catch (error) {
      throw new DeviceError(
        ErrorType.PERSISTENCE_ERROR,
        `Failed to release lock: ${error.message}`
      );
    }
  }

  /**
   * Load device state
   */
  async loadDevices(): Promise<DeviceState> {
    try {
      await this.initialize();
      
      let data: string;
      try {
        data = await readFile(this.stateFile, 'utf8');
      } catch (error) {
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

    } catch (error) {
      throw new DeviceError(
        ErrorType.PERSISTENCE_ERROR,
        `Failed to load device state: ${error.message}`
      );
    }
  }

  /**
   * Save device state
   */
  async saveDevices(devices: Map<string, Device>): Promise<void> {
    try {
      await this.initialize();
      
      const state = {
        devices: Array.from(devices.entries()),
        defaultDevice: Array.from(devices.values())
          .find(device => device.isDefault)?.id || null,
        lastUpdated: Date.now()
      };

      await writeFile(
        this.stateFile,
        JSON.stringify(state, null, 2),
        'utf8'
      );

    } catch (error) {
      throw new DeviceError(
        ErrorType.PERSISTENCE_ERROR,
        `Failed to save device state: ${error.message}`
      );
    }
  }

  /**
   * Execute operations in a transaction
   */
  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    await this.acquireLock();
    
    try {
      const result = await operations();
      await this.releaseLock();
      return result;
    } catch (error) {
      await this.releaseLock();
      throw error;
    }
  }
}
