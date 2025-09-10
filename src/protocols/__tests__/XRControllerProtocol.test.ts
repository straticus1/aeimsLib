import { XRControllerProtocol, XRControllerCommand } from '../XRControllerProtocol';
import { DeviceSimulator } from '../../testing/DeviceSimulator';

describe('XRControllerProtocol', () => {
  let protocol: XRControllerProtocol;
  let simulator: DeviceSimulator;
  const deviceId = 'test_xr_device';

  beforeEach(() => {
    protocol = new XRControllerProtocol(deviceId, 'index');
    simulator = new DeviceSimulator({
      id: deviceId,
      name: 'Valve Index Controller',
      protocol: 'xr',
      manufacturer: 'Valve Corporation',
      model: 'index',
      capabilities: ['vibrate', 'pattern', 'continuous', 'frequency', 'amplitude']
    });
  });

  afterEach(async () => {
    await protocol.disconnect();
    await simulator.disconnect();
  });

  describe('Device Info', () => {
    test('should initialize with correct device info', () => {
      const info = protocol.getInfo();
      expect(info.name).toBe('INDEX Controller');
      expect(info.protocol).toBe('xr');
      expect(info.manufacturer).toBe('Valve Corporation');
      expect(info.controllerType).toBe('index');
      expect(info.trackingType).toBe('outside-in');
      expect(info.degreesOfFreedom).toBe(6);
      expect(info.capabilities).toContain('vibrate');
    });

    test('should provide correct haptic capabilities', () => {
      const info = protocol.getInfo();
      const { hapticCapabilities } = info;

      expect(hapticCapabilities.frequency.max).toBe(1000);
      expect(hapticCapabilities.amplitude.max).toBe(1.0);
      expect(hapticCapabilities.patterns).toBe(true);
      expect(hapticCapabilities.continuous).toBe(true);
    });

    test('should initialize different controller types correctly', () => {
      const controllers = ['index', 'oculus', 'vive', 'wmr'] as const;
      
      controllers.forEach(type => {
        const controller = new XRControllerProtocol(deviceId, type);
        const info = controller.getInfo();
        
        expect(info.controllerType).toBe(type);
        expect(info.manufacturer).toBeDefined();
        expect(info.hapticCapabilities).toBeDefined();
      });
    });
  });

  describe('Connection', () => {
    test('should connect and initialize status', async () => {
      await protocol.connect();
      const status = protocol.getStatus();
      
      expect(status.connected).toBe(true);
      expect(status.trackingState).toBeDefined();
      expect(status.batteryLevel).toBeDefined();
      expect(status.hapticState.active).toBe(false);
    });

    test('should handle disconnection', async () => {
      await protocol.connect();
      await protocol.disconnect();
      
      const status = protocol.getStatus();
      expect(status.connected).toBe(false);
      expect(status.hapticState.active).toBe(false);
    });
  });

  describe('Haptic Commands', () => {
    beforeEach(async () => {
      await protocol.connect();
    });

    test('should handle basic vibration', async () => {
      const command: XRControllerCommand = {
        type: 'vibrate',
        frequency: 160,
        amplitude: 0.5,
        duration: 100
      };

      await protocol.sendCommand(command);
      const status = protocol.getStatus();
      
      expect(status.hapticState.active).toBe(true);
      expect(status.hapticState.frequency).toBe(160);
      expect(status.hapticState.amplitude).toBe(0.5);

      // Wait for vibration to stop
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(protocol.getStatus().hapticState.active).toBe(false);
    });

    test('should validate haptic parameters', async () => {
      const info = protocol.getInfo();
      const { frequency, amplitude } = info.hapticCapabilities;

      // Test invalid frequency
      await expect(protocol.sendCommand({
        type: 'vibrate',
        frequency: frequency.max + 100,
        amplitude: 0.5
      })).rejects.toThrow(/Frequency must be between/);

      // Test invalid amplitude
      await expect(protocol.sendCommand({
        type: 'vibrate',
        frequency: 160,
        amplitude: amplitude.max + 1
      })).rejects.toThrow(/Amplitude must be between/);
    });

    test('should play patterns', async () => {
      const pattern: XRControllerCommand['pattern'] = {
        points: [
          { frequency: 160, amplitude: 0.5, duration: 100 },
          { frequency: 200, amplitude: 0.7, duration: 100 },
          { frequency: 120, amplitude: 0.3, duration: 100 }
        ]
      };

      await protocol.sendCommand({
        type: 'pattern',
        pattern
      });

      // Check first point
      let status = protocol.getStatus();
      expect(status.hapticState.active).toBe(true);
      expect(status.hapticState.frequency).toBe(160);

      // Wait for pattern to complete
      await new Promise(resolve => setTimeout(resolve, 350));
      status = protocol.getStatus();
      expect(status.hapticState.active).toBe(false);
    });

    test('should stop active patterns', async () => {
      const pattern: XRControllerCommand['pattern'] = {
        points: [
          { frequency: 160, amplitude: 0.5, duration: 1000 },
          { frequency: 200, amplitude: 0.7, duration: 1000 }
        ],
        repeat: true
      };

      await protocol.sendCommand({
        type: 'pattern',
        pattern
      });

      // Wait briefly then stop
      await new Promise(resolve => setTimeout(resolve, 100));
      await protocol.sendCommand({ type: 'stop' });

      const status = protocol.getStatus();
      expect(status.hapticState.active).toBe(false);
      expect(status.hapticState.frequency).toBe(0);
      expect(status.hapticState.amplitude).toBe(0);
    });
  });

  describe('Status Updates', () => {
    test('should track battery level changes', async () => {
      const statusUpdates: any[] = [];
      protocol.on('statusChanged', status => {
        statusUpdates.push(status);
      });

      await protocol.connect();
      simulator.setBatteryLevel(75);

      expect(statusUpdates.some(s => s.batteryLevel === 75)).toBe(true);
    });

    test('should track tracking state changes', async () => {
      const statusUpdates: any[] = [];
      protocol.on('statusChanged', status => {
        statusUpdates.push(status);
      });

      await protocol.connect();
      
      // Simulate tracking state changes
      const states = ['tracked', 'limited', 'not-tracked'] as const;
      for (const state of states) {
        simulator.emit('statusChanged', {
          type: 'statusChanged',
          deviceId,
          timestamp: new Date(),
          data: { trackingState: state }
        });
      }

      expect(statusUpdates.some(s => s.trackingState === 'limited')).toBe(true);
      expect(statusUpdates.some(s => s.trackingState === 'not-tracked')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should reject commands when disconnected', async () => {
      await expect(protocol.sendCommand({
        type: 'vibrate',
        frequency: 160,
        amplitude: 0.5
      })).rejects.toThrow('Device not connected');
    });

    test('should handle invalid patterns', async () => {
      await protocol.connect();

      await expect(protocol.sendCommand({
        type: 'pattern',
        pattern: { points: [] }
      })).rejects.toThrow('Invalid pattern');

      await expect(protocol.sendCommand({
        type: 'pattern'
      })).rejects.toThrow('Pattern not specified');
    });

    test('should handle unknown command types', async () => {
      await protocol.connect();

      await expect(protocol.sendCommand({
        type: 'invalid' as any
      })).rejects.toThrow('Unknown command type');
    });
  });
});
