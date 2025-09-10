import { DeviceManager } from '../server/DeviceManager';
import { MockDeviceProtocol, createTestDeviceInfo, waitFor, createMockLogger } from './test-utils';

describe('DeviceManager', () => {
  let deviceManager: DeviceManager;
  let mockLogger: ReturnType<typeof createMockLogger>;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
    deviceManager = new DeviceManager({ logger: mockLogger });
  });
  
  afterEach(async () => {
    await deviceManager.shutdown();
  });
  
  describe('device management', () => {
    it('should add a device', async () => {
      const deviceInfo = createTestDeviceInfo();
      const device = new MockDeviceProtocol(deviceInfo);
      
      await deviceManager.addDevice(device);
      
      const devices = deviceManager.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe(deviceInfo.id);
    });
    
    it('should remove a device', async () => {
      const deviceInfo = createTestDeviceInfo();
      const device = new MockDeviceProtocol(deviceInfo);
      
      await deviceManager.addDevice(device);
      await deviceManager.removeDevice(deviceInfo.id);
      
      const devices = deviceManager.getDevices();
      expect(devices).toHaveLength(0);
    });
    
    it('should get a device by ID', async () => {
      const deviceInfo = createTestDeviceInfo();
      const device = new MockDeviceProtocol(deviceInfo);
      
      await deviceManager.addDevice(device);
      const foundDevice = deviceManager.getDevice(deviceInfo.id);
      
      expect(foundDevice).toBeDefined();
      expect(foundDevice?.id).toBe(deviceInfo.id);
    });
    
    it('should handle duplicate device addition', async () => {
      const deviceInfo = createTestDeviceInfo();
      const device1 = new MockDeviceProtocol(deviceInfo);
      const device2 = new MockDeviceProtocol(deviceInfo);
      
      await deviceManager.addDevice(device1);
      
      await expect(deviceManager.addDevice(device2)).rejects.toThrow('already exists');
    });
  });
  
  describe('device commands', () => {
    let device: MockDeviceProtocol;
    
    beforeEach(async () => {
      const deviceInfo = createTestDeviceInfo();
      device = new MockDeviceProtocol(deviceInfo);
      await deviceManager.addDevice(device);
    });
    
    it('should send a command to a device', async () => {
      const response = await deviceManager.sendCommand(device.deviceInfo.id, {
        type: 'vibrate',
        intensity: 50,
        duration: 1000
      });
      
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('type', 'vibrate_response');
    });
    
    it('should handle command errors', async () => {
      // Simulate a device error
      jest.spyOn(device, 'sendCommand').mockRejectedValue(new Error('Device error'));
      
      await expect(
        deviceManager.sendCommand(device.deviceInfo.id, {
          type: 'invalid_command',
          params: {}
        })
      ).rejects.toThrow('Device error');
    });
  });
  
  describe('event handling', () => {
    let device: MockDeviceProtocol;
    let eventHandler: jest.Mock;
    
    beforeEach(async () => {
      const deviceInfo = createTestDeviceInfo();
      device = new MockDeviceProtocol(deviceInfo);
      await deviceManager.addDevice(device);
      
      eventHandler = jest.fn();
      deviceManager.on('deviceEvent', eventHandler);
    });
    
    it('should forward device events', async () => {
      const testEvent = {
        type: 'battery',
        data: { batteryLevel: 75 },
        timestamp: new Date()
      };
      
      // Simulate a device event
      device.simulateDeviceEvent(testEvent);
      
      // Wait for the event to be processed
      await waitFor(() => eventHandler.mock.calls.length > 0);
      
      expect(eventHandler).toHaveBeenCalledWith({
        deviceId: device.deviceInfo.id,
        event: testEvent
      });
    });
    
    it('should handle device disconnection', async () => {
      const disconnectHandler = jest.fn();
      deviceManager.on('deviceDisconnected', disconnectHandler);
      
      // Simulate device disconnection
      device.simulateDisconnect();
      
      // Wait for the event to be processed
      await waitFor(() => disconnectHandler.mock.calls.length > 0);
      
      expect(disconnectHandler).toHaveBeenCalledWith({
        deviceId: device.deviceInfo.id,
        reason: 'simulated'
      });
    });
  });
  
  describe('connection management', () => {
    let device: MockDeviceProtocol;
    
    beforeEach(async () => {
      const deviceInfo = createTestDeviceInfo();
      device = new MockDeviceProtocol(deviceInfo);
      await deviceManager.addDevice(device);
    });
    
    it('should connect to a device', async () => {
      const connectSpy = jest.spyOn(device, 'connect');
      
      await deviceManager.connectDevice(device.deviceInfo.id);
      
      expect(connectSpy).toHaveBeenCalled();
      
      const status = await deviceManager.getDeviceStatus(device.deviceInfo.id);
      expect(status.connected).toBe(true);
    });
    
    it('should disconnect from a device', async () => {
      await deviceManager.connectDevice(device.deviceInfo.id);
      
      const disconnectSpy = jest.spyOn(device, 'disconnect');
      await deviceManager.disconnectDevice(device.deviceInfo.id);
      
      expect(disconnectSpy).toHaveBeenCalled();
      
      const status = await deviceManager.getDeviceStatus(device.deviceInfo.id);
      expect(status.connected).toBe(false);
    });
    
    it('should handle connection errors', async () => {
      // Simulate a connection error
      jest.spyOn(device, 'connect').mockRejectedValue(new Error('Connection failed'));
      
      await expect(deviceManager.connectDevice(device.deviceInfo.id)).rejects.toThrow('Connection failed');
    });
  });
  
  describe('shutdown', () => {
    it('should disconnect all devices on shutdown', async () => {
      const device1 = new MockDeviceProtocol(createTestDeviceInfo({ id: 'device-1' }));
      const device2 = new MockDeviceProtocol(createTestDeviceInfo({ id: 'device-2' }));
      
      await deviceManager.addDevice(device1);
      await deviceManager.addDevice(device2);
      
      await deviceManager.connectDevice('device-1');
      await deviceManager.connectDevice('device-2');
      
      const disconnectSpy1 = jest.spyOn(device1, 'disconnect');
      const disconnectSpy2 = jest.spyOn(device2, 'disconnect');
      
      await deviceManager.shutdown();
      
      expect(disconnectSpy1).toHaveBeenCalled();
      expect(disconnectSpy2).toHaveBeenCalled();
    });
    
    it('should handle shutdown errors gracefully', async () => {
      const device = new MockDeviceProtocol(createTestDeviceInfo());
      await deviceManager.addDevice(device);
      
      // Simulate a disconnection error
      jest.spyOn(device, 'disconnect').mockRejectedValue(new Error('Disconnect failed'));
      
      // Should not throw
      await expect(deviceManager.shutdown()).resolves.not.toThrow();
      
      // Should log the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error disconnecting device during shutdown',
        expect.objectContaining({
          error: expect.any(Error),
          deviceId: device.deviceInfo.id
        })
      );
    });
  });
  
  describe('reconnection', () => {
    it('should automatically reconnect to a device', async () => {
      const deviceInfo = createTestDeviceInfo();
      const device = new MockDeviceProtocol(deviceInfo);
      await deviceManager.addDevice(device);
      
      // Enable auto-reconnect with a short delay for testing
      await deviceManager.setAutoReconnect(deviceInfo.id, true, {
        initialDelay: 10,
        maxDelay: 100,
        maxRetries: 3
      });
      
      // Simulate a disconnection
      device.simulateDisconnect();
      
      // Wait for reconnection attempts
      await waitFor(async () => {
        const status = await deviceManager.getDeviceStatus(deviceInfo.id);
        return status.connected === true;
      }, 1000);
      
      const status = await deviceManager.getDeviceStatus(deviceInfo.id);
      expect(status.connected).toBe(true);
    });
    
    it('should stop reconnection after max retries', async () => {
      const deviceInfo = createTestDeviceInfo();
      const device = new MockDeviceProtocol(deviceInfo);
      await deviceManager.addDevice(device);
      
      // Make connect always fail
      jest.spyOn(device, 'connect').mockRejectedValue(new Error('Connection failed'));
      
      // Enable auto-reconnect with minimal settings
      await deviceManager.setAutoReconnect(deviceInfo.id, true, {
        initialDelay: 10,
        maxDelay: 20,
        maxRetries: 2
      });
      
      // Simulate a disconnection
      device.simulateDisconnect();
      
      // Wait for reconnection attempts to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should have given up after max retries
      const connectSpy = device.connect as jest.Mock;
      expect(connectSpy.mock.calls.length).toBe(2); // Initial connect + 2 retries
    });
  });
});
