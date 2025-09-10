import { DeviceSimulator, createSimulatedDevice, SimulationConfig } from '../DeviceSimulator';
import { DeviceCommand } from '../../interfaces/device';

describe('DeviceSimulator', () => {
  let simulator: DeviceSimulator;
  
  beforeEach(() => {
    // Create a simulator with predictable behavior for testing
    const config: Partial<SimulationConfig> = {
      latency: 10,
      packetLoss: 0,
      disconnectProbability: 0,
      errorProbability: 0
    };
    simulator = createSimulatedDevice('test', config);
  });

  afterEach(() => {
    simulator.disconnect();
  });

  test('should create simulated device with correct info', () => {
    const info = simulator.getInfo();
    expect(info.protocol).toBe('test');
    expect(info.manufacturer).toBe('Simulator');
    expect(info.capabilities).toContain('vibrate');
  });

  test('should connect and disconnect successfully', async () => {
    expect((await simulator.getStatus()).connected).toBe(false);
    
    await simulator.connect();
    expect((await simulator.getStatus()).connected).toBe(true);
    
    await simulator.disconnect();
    expect((await simulator.getStatus()).connected).toBe(false);
  });

  test('should handle commands when connected', async () => {
    await simulator.connect();
    
    const command: DeviceCommand = {
      type: 'vibrate',
      intensity: 50
    };

    await expect(simulator.sendCommand(command)).resolves.not.toThrow();
  });

  test('should reject commands when disconnected', async () => {
    const command: DeviceCommand = {
      type: 'vibrate',
      intensity: 50
    };

    await expect(simulator.sendCommand(command)).rejects.toThrow('Device not connected');
  });

  test('should simulate battery drain', async () => {
    await simulator.connect();
    const initialBattery = (await simulator.getStatus()).batteryLevel;
    
    // Wait for battery drain
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newBattery = (await simulator.getStatus()).batteryLevel;
    expect(newBattery).toBeLessThan(initialBattery);
  });

  test('should emit events on state changes', async () => {
    const events: string[] = [];
    
    simulator.on('connected', () => events.push('connected'));
    simulator.on('disconnected', () => events.push('disconnected'));
    simulator.on('commandReceived', () => events.push('commandReceived'));
    
    await simulator.connect();
    await simulator.sendCommand({ type: 'vibrate', intensity: 50 });
    await simulator.disconnect();
    
    expect(events).toEqual(['connected', 'commandReceived', 'disconnected']);
  });

  test('should handle simulated errors', async () => {
    const errorSimulator = createSimulatedDevice('test', {
      errorProbability: 1 // Always generate errors
    });

    await expect(errorSimulator.connect()).rejects.toThrow('Simulated connection failure');
  });

  test('should handle packet loss', async () => {
    const lossySimulator = createSimulatedDevice('test', {
      packetLoss: 1 // Always lose packets
    });

    await lossySimulator.connect();
    await expect(lossySimulator.sendCommand({ type: 'vibrate', intensity: 50 }))
      .rejects.toThrow('Simulated packet loss');
  });

  test('should manage battery level manually', async () => {
    await simulator.connect();
    simulator.setBatteryLevel(50);
    expect((await simulator.getStatus()).batteryLevel).toBe(50);
  });

  test('should handle multiple rapid commands', async () => {
    await simulator.connect();
    
    const commands = Array(10).fill(null).map((_, i) => ({
      type: 'vibrate',
      intensity: i * 10
    }));

    await Promise.all(commands.map(cmd => simulator.sendCommand(cmd)));
    const status = await simulator.getStatus();
    expect(status.connected).toBe(true);
  });
});
