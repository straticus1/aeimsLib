import { CommandProcessor, CommandProcessorConfig } from '../CommandProcessor';
import { Device, DeviceCommand, DeviceInfo } from '../../interfaces/device';
import { Logger } from '../../utils/Logger';

class MockDevice implements Device {
  info: DeviceInfo;
  private commandHistory: DeviceCommand[] = [];
  private connected: boolean = true;
  private commandDelay: number = 0;

  constructor(id: string, commandDelay: number = 0) {
    this.info = {
      id,
      name: `Mock Device ${id}`,
      protocol: 'mock',
      manufacturer: 'Test',
      model: 'Mock',
      capabilities: ['vibrate', 'pattern']
    };
    this.commandDelay = commandDelay;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    if (this.commandDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.commandDelay));
    }

    this.commandHistory.push(command);
  }

  getCommandHistory(): DeviceCommand[] {
    return [...this.commandHistory];
  }

  clearCommandHistory(): void {
    this.commandHistory = [];
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
  }
}

describe('CommandProcessor', () => {
  let processor: CommandProcessor;
  let device: MockDevice;
  let config: Partial<CommandProcessorConfig>;

  beforeEach(() => {
    device = new MockDevice('test_device');
    
    config = {
      batch: {
        maxBatchSize: 5,
        maxDelay: 20,
        minDelay: 5
      },
      rateLimit: {
        tokensPerInterval: 10,
        interval: 100,
        burstSize: 15
      }
    };

    processor = CommandProcessor.getInstance(config);
    processor.registerDevice(device);

    // Mock logger
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    processor.unregisterDevice(device.info.id);
    device.clearCommandHistory();
  });

  describe('Command Batching', () => {
    test('should batch multiple commands', async () => {
      const commands = [
        { type: 'vibrate', intensity: 50 },
        { type: 'vibrate', intensity: 60 },
        { type: 'vibrate', intensity: 70 }
      ];

      // Send commands rapidly
      await Promise.all(commands.map(cmd => 
        processor.sendCommand(device.info.id, cmd)
      ));

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 30));

      const history = device.getCommandHistory();
      expect(history.length).toBeLessThan(commands.length);
      expect(history[history.length - 1].intensity).toBe(70);
    });

    test('should respect max batch size', async () => {
      const commands = Array(10).fill(null).map((_, i) => ({
        type: 'vibrate' as const,
        intensity: i * 10
      }));

      await Promise.all(commands.map(cmd =>
        processor.sendCommand(device.info.id, cmd)
      ));

      await new Promise(resolve => setTimeout(resolve, 50));

      const history = device.getCommandHistory();
      expect(history.length).toBeGreaterThan(1);
      expect(history.length).toBeLessThanOrEqual(
        Math.ceil(commands.length / config.batch!.maxBatchSize!)
      );
    });

    test('should optimize similar commands', async () => {
      const commands = [
        { type: 'vibrate', intensity: 50 },
        { type: 'vibrate', intensity: 51 },
        { type: 'pattern', pattern: 'wave' },
        { type: 'vibrate', intensity: 52 }
      ];

      await Promise.all(commands.map(cmd =>
        processor.sendCommand(device.info.id, cmd)
      ));

      await new Promise(resolve => setTimeout(resolve, 30));

      const history = device.getCommandHistory();
      expect(history.length).toBe(3); // Combined vibrate commands
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const commands = Array(20).fill(null).map((_, i) => ({
        type: 'vibrate' as const,
        intensity: i * 5
      }));

      const startTime = Date.now();
      await Promise.all(commands.map(cmd =>
        processor.sendCommand(device.info.id, cmd)
      ));

      await new Promise(resolve => setTimeout(resolve, 300));

      const history = device.getCommandHistory();
      const endTime = Date.now();

      // Should take at least one rate limit interval
      expect(endTime - startTime).toBeGreaterThan(config.rateLimit!.interval!);
      expect(history.length).toBe(commands.length);
    });

    test('should allow burst of commands', async () => {
      const burstSize = config.rateLimit!.burstSize!;
      const commands = Array(burstSize).fill(null).map((_, i) => ({
        type: 'vibrate' as const,
        intensity: i * 5
      }));

      const startTime = Date.now();
      await Promise.all(commands.map(cmd =>
        processor.sendCommand(device.info.id, cmd)
      ));

      const endTime = Date.now();
      const history = device.getCommandHistory();

      // Burst should complete quickly
      expect(endTime - startTime).toBeLessThan(config.rateLimit!.interval!);
      expect(history.length).toBe(commands.length);
    });

    test('should recover rate limit tokens over time', async () => {
      // Use all tokens
      const commands = Array(config.rateLimit!.burstSize!).fill(null).map(() => ({
        type: 'vibrate' as const,
        intensity: 50
      }));

      await Promise.all(commands.map(cmd =>
        processor.sendCommand(device.info.id, cmd)
      ));

      const tokensAfterBurst = processor.getRateLimitTokens(device.info.id);
      expect(tokensAfterBurst).toBe(0);

      // Wait for token recovery
      await new Promise(resolve => 
        setTimeout(resolve, config.rateLimit!.interval! * 1.1)
      );

      const tokensAfterRecovery = processor.getRateLimitTokens(device.info.id);
      expect(tokensAfterRecovery).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle device errors', async () => {
      device.setConnected(false);

      const command = { type: 'vibrate', intensity: 50 };
      await expect(processor.sendCommand(device.info.id, cmd))
        .rejects.toThrow();

      const history = device.getCommandHistory();
      expect(history.length).toBe(0);
    });

    test('should handle queue clearing', async () => {
      const commands = Array(10).fill(null).map(() => ({
        type: 'vibrate' as const,
        intensity: 50
      }));

      // Queue commands
      const promises = commands.map(cmd =>
        processor.sendCommand(device.info.id, cmd)
      );

      // Clear queue
      processor.clearQueue(device.info.id);

      // All promises should reject
      await Promise.all(promises.map(p =>
        expect(p).rejects.toThrow('Queue cleared')
      ));
    });
  });

  describe('Configuration', () => {
    test('should update configuration', () => {
      const newConfig: Partial<CommandProcessorConfig> = {
        batch: {
          maxBatchSize: 3,
          maxDelay: 10,
          minDelay: 2
        },
        rateLimit: {
          tokensPerInterval: 5,
          interval: 200,
          burstSize: 8
        }
      };

      processor.updateConfig(newConfig);
      const currentConfig = processor.getConfig();

      expect(currentConfig.batch.maxBatchSize).toBe(3);
      expect(currentConfig.rateLimit.tokensPerInterval).toBe(5);
    });

    test('should maintain partial configuration updates', () => {
      const originalConfig = processor.getConfig();
      
      processor.updateConfig({
        batch: { maxBatchSize: 3 }
      });

      const newConfig = processor.getConfig();
      expect(newConfig.batch.maxBatchSize).toBe(3);
      expect(newConfig.batch.maxDelay).toBe(originalConfig.batch.maxDelay);
      expect(newConfig.rateLimit).toEqual(originalConfig.rateLimit);
    });
  });

  describe('Device Management', () => {
    test('should handle device registration', () => {
      const newDevice = new MockDevice('test_device_2');
      processor.registerDevice(newDevice);

      expect(processor.getQueueLength(newDevice.info.id)).toBe(0);
      expect(processor.getRateLimitTokens(newDevice.info.id))
        .toBe(config.rateLimit!.burstSize);
    });

    test('should handle device unregistration', async () => {
      const command = { type: 'vibrate', intensity: 50 };
      const promise = processor.sendCommand(device.info.id, command);

      processor.unregisterDevice(device.info.id);

      await expect(promise).rejects.toThrow();
      expect(processor.getQueueLength(device.info.id)).toBe(0);
    });

    test('should reject commands for unknown devices', async () => {
      await expect(processor.sendCommand('unknown_device', {
        type: 'vibrate',
        intensity: 50
      })).rejects.toThrow('Device not found');
    });
  });

  describe('Performance', () => {
    test('should handle high command throughput', async () => {
      const commandCount = 100;
      const commands = Array(commandCount).fill(null).map((_, i) => ({
        type: 'vibrate' as const,
        intensity: i % 100
      }));

      const startTime = Date.now();
      await Promise.all(commands.map(cmd =>
        processor.sendCommand(device.info.id, cmd)
      ));

      // Wait for all commands to process
      await new Promise(resolve => setTimeout(resolve, 1000));

      const history = device.getCommandHistory();
      const endTime = Date.now();

      expect(history.length).toBeLessThan(commandCount); // Due to batching
      expect(endTime - startTime).toBeLessThan(2000); // Reasonable time limit
    });

    test('should handle slow devices', async () => {
      const slowDevice = new MockDevice('slow_device', 50); // 50ms delay
      processor.registerDevice(slowDevice);

      const commands = Array(10).fill(null).map((_, i) => ({
        type: 'vibrate' as const,
        intensity: i * 10
      }));

      await Promise.all(commands.map(cmd =>
        processor.sendCommand(slowDevice.info.id, cmd)
      ));

      await new Promise(resolve => setTimeout(resolve, 600));

      const history = slowDevice.getCommandHistory();
      expect(history.length).toBeLessThan(commands.length); // Should batch commands
    });
  });
});
