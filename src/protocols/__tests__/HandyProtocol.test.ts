import { HandyProtocol, HandyCommand } from '../HandyProtocol';
import { DeviceSimulator } from '../../testing/DeviceSimulator';

describe('HandyProtocol', () => {
  let protocol: HandyProtocol;
  let simulator: DeviceSimulator;
  const deviceId = 'test_handy_device';

  beforeEach(() => {
    protocol = new HandyProtocol(deviceId);
    simulator = new DeviceSimulator({
      id: deviceId,
      name: 'TheHandy',
      protocol: 'handy',
      manufacturer: 'Sweet Tech AS',
      model: 'Handy',
      firmwareVersion: '1.0.0',
      capabilities: ['slide', 'velocity', 'position', 'sync']
    });
  });

  afterEach(async () => {
    await protocol.disconnect();
    await simulator.disconnect();
  });

  test('should initialize with correct device info', () => {
    const info = protocol.getInfo();
    expect(info.name).toBe('TheHandy');
    expect(info.protocol).toBe('handy');
    expect(info.manufacturer).toBe('Sweet Tech AS');
    expect(info.capabilities).toContain('slide');
    expect(info.capabilities).toContain('velocity');
    expect(info.capabilities).toContain('position');
    expect(info.capabilities).toContain('sync');
  });

  test('should connect and initialize device', async () => {
    await protocol.connect();
    const status = protocol.getStatus();
    expect(status.connected).toBe(true);
    expect(status.mode).toBe('manual');
    expect(status.position).toBe(0);
    expect(status.velocity).toBe(0);
  });

  test('should set device mode', async () => {
    await protocol.connect();
    
    await protocol.setMode('automatic');
    expect(protocol.getStatus().mode).toBe('automatic');
    
    await protocol.setMode('sync');
    expect(protocol.getStatus().mode).toBe('sync');
    
    await protocol.setMode('manual');
    expect(protocol.getStatus().mode).toBe('manual');
  });

  test('should set position', async () => {
    await protocol.connect();
    
    await protocol.setPosition(50);
    expect(protocol.getStatus().position).toBe(50);
    
    // Should clamp values
    await protocol.setPosition(-10);
    expect(protocol.getStatus().position).toBe(0);
    
    await protocol.setPosition(150);
    expect(protocol.getStatus().position).toBe(100);
  });

  test('should set velocity', async () => {
    await protocol.connect();
    
    await protocol.setVelocity(75);
    expect(protocol.getStatus().velocity).toBe(75);
    
    // Should clamp values
    await protocol.setVelocity(-10);
    expect(protocol.getStatus().velocity).toBe(0);
    
    await protocol.setVelocity(150);
    expect(protocol.getStatus().velocity).toBe(100);
  });

  test('should set stroke range', async () => {
    await protocol.connect();
    
    await protocol.setStrokeRange(20, 80);
    const status = protocol.getStatus();
    expect(status.slideMin).toBe(20);
    expect(status.slideMax).toBe(80);
    
    // Should handle invalid ranges
    await protocol.setStrokeRange(90, 80);
    expect(protocol.getStatus().slideMin).toBe(80);
    expect(protocol.getStatus().slideMax).toBe(80);
  });

  test('should handle timed commands', async () => {
    await protocol.connect();
    await protocol.setMode('sync');
    
    const now = Date.now();
    await protocol.sendTimedCommand(50, 75, now + 1000);
    
    const status = protocol.getStatus();
    expect(status.mode).toBe('sync');
  });

  test('should update device info on connect', async () => {
    const initialInfo = protocol.getInfo();
    await protocol.connect();
    const updatedInfo = protocol.getInfo();
    
    expect(updatedInfo.firmwareVersion).not.toBe(initialInfo.firmwareVersion);
    expect(updatedInfo.slideMin).toBeDefined();
    expect(updatedInfo.slideMax).toBeDefined();
    expect(updatedInfo.encoderResolution).toBeDefined();
  });

  test('should handle status notifications', async () => {
    const statusUpdates: any[] = [];
    protocol.on('statusChanged', (status) => {
      statusUpdates.push(status);
    });

    await protocol.connect();
    await protocol.setMode('automatic');
    await protocol.setVelocity(50);

    expect(statusUpdates.length).toBeGreaterThan(0);
    expect(statusUpdates[statusUpdates.length - 1].mode).toBe('automatic');
    expect(statusUpdates[statusUpdates.length - 1].velocity).toBe(50);
  });

  test('should reject commands when disconnected', async () => {
    await expect(protocol.setPosition(50))
      .rejects.toThrow('Device not connected');
    
    await expect(protocol.setVelocity(75))
      .rejects.toThrow('Device not connected');
  });

  test('should handle reconnection', async () => {
    await protocol.connect();
    await protocol.setMode('automatic');
    await protocol.setVelocity(50);
    
    await protocol.disconnect();
    expect(protocol.getStatus().connected).toBe(false);
    
    await protocol.connect();
    expect(protocol.getStatus().connected).toBe(true);
    expect(protocol.getStatus().mode).toBe('manual'); // Should reset to default
  });

  test('should encode commands correctly', async () => {
    await protocol.connect();

    // Test each command type
    const commands: HandyCommand[] = [
      { mode: 'automatic' },
      { position: 50 },
      { velocity: 75 },
      { slideMin: 20, slideMax: 80 }
    ];

    // All commands should succeed
    await Promise.all(commands.map(cmd => 
      expect(protocol.sendCommand(cmd)).resolves.not.toThrow()
    ));
  });

  test('should maintain time synchronization', async () => {
    await protocol.connect();
    const info1 = protocol.getInfo();
    
    // Wait a bit and check time offset remains consistent
    await new Promise(resolve => setTimeout(resolve, 1000));
    const info2 = protocol.getInfo();
    
    expect(Math.abs(info2.serverTimeOffset - info1.serverTimeOffset))
      .toBeLessThan(100); // Allow small variance
  });
});
