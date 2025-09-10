import { DeviceStateManager, DeviceStateEvent, StateRecoveryConfig } from '../DeviceStateManager';
import { Device, DeviceCommand, DeviceInfo, DeviceStatus } from '../../interfaces/device';
import { CommandProcessor } from '../CommandProcessor';
import { Logger } from '../../utils/Logger';

class MockDevice implements Device {
  info: DeviceInfo;
  private status: DeviceStatus;
  private connectionDelay: number;

  constructor(id: string, connectionDelay: number = 0) {
    this.info = {
      id,
      name: `Mock Device ${id}`,
      protocol: 'mock',
      manufacturer: 'Test',
      model: 'Mock',
      capabilities: ['vibrate']
    };
    this.status = {
      connected: false,
      lastSeen: new Date()
    };
    this.connectionDelay = connectionDelay;
  }

  async connect(): Promise<void> {
    if (this.connectionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.connectionDelay));
    }
    this.status.connected = true;
    this.status.lastSeen = new Date();
  }

  async disconnect(): Promise<void> {
    this.status.connected = false;
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    if (!this.status.connected) {
      throw new Error('Device not connected');
    }
    this.status.lastSeen = new Date();
  }

  getStatus(): DeviceStatus {
    return { ...this.status };
  }

  setStatus(status: Partial<DeviceStatus>): void {
    this.status = { ...this.status, ...status };
  }
}

describe('DeviceStateManager', () => {
  let stateManager: DeviceStateManager;
  let device: MockDevice;
  let config: Partial<StateRecoveryConfig>;
  let commandProcessor: CommandProcessor;

  beforeEach(() => {
    device = new MockDevice('test_device');
    
    config = {
      maxAttempts: 3,
      retryDelay: 100,
      maxRetryDelay: 500,
      recoveryTimeout: 1000,
      validateState: true
    };

    // Mock command processor
    jest.spyOn(CommandProcessor, 'getInstance').mockImplementation(() => ({
      registerDevice: jest.fn(),
      unregisterDevice: jest.fn(),
      sendCommand: jest.fn(),
      clearQueue: jest.fn()
    } as unknown as CommandProcessor));

    commandProcessor = CommandProcessor.getInstance();
    stateManager = DeviceStateManager.getInstance(config);

    // Mock logger
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stateManager.unregisterDevice(device.info.id);
    jest.clearAllMocks();
  });

  describe('Device Registration', () => {
    test('should register device and initialize state', () => {
      stateManager.registerDevice(device);
      const state = stateManager.getDeviceState(device.info.id);

      expect(state).toBeDefined();
      expect(state?.status.connected).toBe(false);
      expect(commandProcessor.registerDevice).toHaveBeenCalledWith(device);
    });

    test('should unregister device and clean up state', () => {
      stateManager.registerDevice(device);
      stateManager.unregisterDevice(device.info.id);

      const state = stateManager.getDeviceState(device.info.id);
      expect(state).toBeUndefined();
      expect(commandProcessor.unregisterDevice).toHaveBeenCalledWith(device.info.id);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      stateManager.registerDevice(device);
    });

    test('should update device state', async () => {
      const newStatus: Partial<DeviceStatus> = {
        connected: true,
        batteryLevel: 80
      };

      await stateManager.updateDeviceState(device.info.id, newStatus);
      const state = stateManager.getDeviceState(device.info.id);

      expect(state?.status.connected).toBe(true);
      expect(state?.status.batteryLevel).toBe(80);
    });

    test('should update custom state', async () => {
      const customState = {
        mode: 'pattern',
        intensity: 50
      };

      await stateManager.updateDeviceState(device.info.id, {}, customState);
      const state = stateManager.getDeviceState(device.info.id);

      expect(state?.customState).toEqual(customState);
    });

    test('should emit state change events', async () => {
      const stateChanges: any[] = [];
      stateManager.on(DeviceStateEvent.STATE_CHANGED, (change) => {
        stateChanges.push(change);
      });

      await stateManager.updateDeviceState(device.info.id, { connected: true });
      await stateManager.updateDeviceState(device.info.id, { batteryLevel: 90 });

      expect(stateChanges.length).toBe(2);
      expect(stateChanges[0].state.status.connected).toBe(true);
      expect(stateChanges[1].state.status.batteryLevel).toBe(90);
    });

    test('should save and track commands', async () => {
      const command: DeviceCommand = {
        type: 'vibrate',
        intensity: 75
      };

      await stateManager.saveCommand(device.info.id, command);
      const state = stateManager.getDeviceState(device.info.id);

      expect(state?.lastCommand).toEqual(command);
      expect(state?.lastCommandTime).toBeDefined();
    });
  });

  describe('State Recovery', () => {
    beforeEach(() => {
      stateManager.registerDevice(device);
    });

    test('should attempt recovery on disconnection', async () => {
      const recoveryEvents: string[] = [];
      stateManager.on(DeviceStateEvent.RECOVERY_STARTED, () => 
        recoveryEvents.push('started')
      );
      stateManager.on(DeviceStateEvent.RECOVERY_COMPLETED, () => 
        recoveryEvents.push('completed')
      );

      // Simulate disconnection
      await stateManager.updateDeviceState(device.info.id, {
        connected: false,
        error: 'Connection lost'
      });

      // Wait for recovery attempt
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(recoveryEvents).toContain('started');
    });

    test('should respect max recovery attempts', async () => {
      let recoveryFailures = 0;
      stateManager.on(DeviceStateEvent.RECOVERY_FAILED, () => recoveryFailures++);

      // Force multiple recovery attempts
      for (let i = 0; i < config.maxAttempts! + 1; i++) {
        await stateManager.updateDeviceState(device.info.id, {
          connected: false,
          error: `Attempt ${i}`
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      expect(recoveryFailures).toBe(1);
    });

    test('should use exponential backoff', async () => {
      const delays: number[] = [];
      const startTimes: number[] = [];

      stateManager.on(DeviceStateEvent.RECOVERY_STARTED, () => {
        startTimes.push(Date.now());
        if (startTimes.length > 1) {
          delays.push(startTimes[startTimes.length - 1] - startTimes[startTimes.length - 2]);
        }
      });

      // Force multiple recovery attempts
      for (let i = 0; i < 3; i++) {
        await stateManager.updateDeviceState(device.info.id, {
          connected: false,
          error: `Attempt ${i}`
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Verify increasing delays
      expect(delays[1]).toBeGreaterThan(delays[0]);
    });

    test('should restore device state after recovery', async () => {
      // Save initial state
      const command: DeviceCommand = {
        type: 'vibrate',
        intensity: 50
      };
      await stateManager.saveCommand(device.info.id, command);

      // Simulate disconnection and recovery
      await stateManager.updateDeviceState(device.info.id, {
        connected: false
      });

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify command was restored
      expect(commandProcessor.sendCommand)
        .toHaveBeenCalledWith(device.info.id, command);
    });
  });

  describe('State Validation', () => {
    beforeEach(() => {
      stateManager.registerDevice(device);
    });

    test('should validate state updates', async () => {
      const invalidState = {
        mode: undefined,
        settings: null
      };

      await expect(stateManager.updateDeviceState(
        device.info.id,
        {},
        invalidState
      )).rejects.toThrow();
    });

    test('should handle validation failures', async () => {
      const validationFailures: number = 0;
      stateManager.on(DeviceStateEvent.RECOVERY_STARTED, () => {
        validationFailures++;
      });

      // Force validation failure
      await stateManager.updateDeviceState(device.info.id, {
        connected: true,
        lastSeen: undefined as any
      });

      expect(validationFailures).toBeGreaterThan(0);
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle rapid state updates', async () => {
      stateManager.registerDevice(device);

      const updates = Array(100).fill(null).map((_, i) => ({
        connected: true,
        batteryLevel: i % 100
      }));

      await Promise.all(updates.map(update =>
        stateManager.updateDeviceState(device.info.id, update)
      ));

      const finalState = stateManager.getDeviceState(device.info.id);
      expect(finalState?.status.batteryLevel).toBe(99);
    });

    test('should handle slow devices', async () => {
      const slowDevice = new MockDevice('slow_device', 100);
      stateManager.registerDevice(slowDevice);

      const recoveryPromise = new Promise<void>(resolve => {
        stateManager.once(DeviceStateEvent.RECOVERY_COMPLETED, () => resolve());
      });

      await stateManager.updateDeviceState(slowDevice.info.id, {
        connected: false
      });

      await expect(recoveryPromise).resolves.toBeUndefined();
    });

    test('should handle concurrent recovery attempts', async () => {
      stateManager.registerDevice(device);

      const recoveryAttempts = Array(5).fill(null).map(() =>
        stateManager.updateDeviceState(device.info.id, {
          connected: false,
          error: 'Connection lost'
        })
      );

      await Promise.all(recoveryAttempts);
      const state = stateManager.getDeviceState(device.info.id);

      expect(state?.recoveryAttempts).toBeLessThanOrEqual(config.maxAttempts!);
    });
  });
});
