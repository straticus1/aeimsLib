import {
  PiShockDevice,
  TCodeDevice,
  TENSDevice,
  VibeaseDevice,
  SatisfyerDevice,
  HicooDevice,
  LoveLifeDevice,
  createAdditionalDevice
} from '../additional';

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = WebSocket.OPEN;
  sent: any[] = [];

  constructor(url: string) {}

  send(data: any) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  mockReceiveMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// Mock Bluetooth
const mockBleDevice = {
  gatt: {
    connected: true,
    connect: jest.fn().mockResolvedValue({
      getPrimaryService: jest.fn().mockResolvedValue({
        getCharacteristic: jest.fn().mockResolvedValue({
          writeValue: jest.fn(),
          readValue: jest.fn(),
          startNotifications: jest.fn(),
          addEventListener: jest.fn()
        })
      })
    }),
    disconnect: jest.fn()
  }
};

const mockBle = {
  requestDevice: jest.fn().mockResolvedValue(mockBleDevice)
};

// Mock Serial
const mockSerial = {
  requestPort: jest.fn().mockResolvedValue({
    open: jest.fn(),
    close: jest.fn(),
    readable: {
      getReader: jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue({ value: new Uint8Array([]), done: false }),
        releaseLock: jest.fn()
      })
    },
    writable: {
      getWriter: jest.fn().mockReturnValue({
        write: jest.fn(),
        releaseLock: jest.fn()
      })
    }
  })
};

describe('Experimental Devices', () => {
  beforeAll(() => {
    // @ts-ignore
    global.WebSocket = MockWebSocket;
    // @ts-ignore
    global.navigator.bluetooth = mockBle;
    // @ts-ignore
    global.navigator.serial = mockSerial;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PiShock Device', () => {
    let device: PiShockDevice;

    beforeEach(() => {
      device = new PiShockDevice({ id: 'test-pishock', name: 'Test PiShock' }, 'ws://test');
    });

    it('should connect successfully', async () => {
      const connectSpy = jest.spyOn(device, 'connect');
      await device.connect();

      expect(connectSpy).toHaveBeenCalled();
      expect(device.isConnected()).toBe(true);
    });

    it('should handle commands', async () => {
      await device.connect();

      const command = {
        type: 'shock',
        params: { intensity: 0.5, duration: 1000 }
      };

      await device.sendCommand(command);
      const socket = (device as any).socket as MockWebSocket;
      expect(socket.sent.length).toBe(1);
      expect(JSON.parse(socket.sent[0])).toMatchObject({
        type: 'shock',
        intensity: 50,
        duration: 1000
      });
    });

    it('should handle errors', async () => {
      await device.connect();
      const socket = (device as any).socket as MockWebSocket;

      socket.mockReceiveMessage({ type: 'error', error: { message: 'Test error' } });
      // Verify error was logged and monitored
    });
  });

  describe('TCode Device', () => {
    let device: TCodeDevice;

    beforeEach(() => {
      device = new TCodeDevice({ id: 'test-tcode', name: 'Test TCode' });
    });

    it('should connect successfully', async () => {
      await device.connect();
      expect(device.isConnected()).toBe(true);
      expect(mockSerial.requestPort).toHaveBeenCalled();
    });

    it('should send TCode commands', async () => {
      await device.connect();

      await device.sendCommand({
        type: 'move',
        params: { axis: 'L0', position: 5000, speed: 500 }
      });

      const writer = mockSerial.requestPort().writable.getWriter();
      expect(writer.write).toHaveBeenCalled();
    });

    it('should handle position updates', async () => {
      await device.connect();
      const positionSpy = jest.fn();
      device.on('position', positionSpy);

      // Simulate position update
      const reader = mockSerial.requestPort().readable.getReader();
      reader.read.mockResolvedValueOnce({
        value: new TextEncoder().encode('P0=5000\n'),
        done: false
      });

      // Wait for position event
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(positionSpy).toHaveBeenCalledWith({ axis: '0', position: 5000 });
    });
  });

  describe('TENS Device', () => {
    let device: TENSDevice;

    beforeEach(() => {
      device = new TENSDevice({ id: 'test-tens', name: 'Test TENS' });
    });

    it('should connect successfully', async () => {
      await device.connect();
      expect(device.isConnected()).toBe(true);
      expect(mockBle.requestDevice).toHaveBeenCalled();
    });

    it('should send intensity commands', async () => {
      await device.connect();
      const characteristic = await mockBleDevice.gatt.connect()
        .then(server => server.getPrimaryService(''))
        .then(service => service.getCharacteristic(''));

      await device.sendCommand({
        type: 'intensity',
        params: { channel: 1, level: 0.5 }
      });

      expect(characteristic.writeValue).toHaveBeenCalledWith(expect.any(Uint8Array));
    });
  });

  describe('Vibease Device', () => {
    let device: VibeaseDevice;

    beforeEach(() => {
      device = new VibeaseDevice({ id: 'test-vibease', name: 'Test Vibease' });
    });

    it('should connect successfully', async () => {
      await device.connect();
      expect(device.isConnected()).toBe(true);
      expect(mockBle.requestDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ namePrefix: 'Vibease' }]
        })
      );
    });

    it('should send vibration commands', async () => {
      await device.connect();
      const characteristic = await mockBleDevice.gatt.connect()
        .then(server => server.getPrimaryService(''))
        .then(service => service.getCharacteristic(''));

      await device.sendCommand({
        type: 'vibrate',
        params: { intensity: 0.5 }
      });

      expect(characteristic.writeValue).toHaveBeenCalled();
      const data = characteristic.writeValue.mock.calls[0][0];
      expect(data[0]).toBe(0xAA); // Header check
      expect(data[2]).toBe(0x01); // Vibrate command check
    });
  });

  describe('Satisfyer Device', () => {
    let device: SatisfyerDevice;

    beforeEach(() => {
      device = new SatisfyerDevice({ id: 'test-satisfyer', name: 'Test Satisfyer' });
    });

    it('should connect and initialize characteristics', async () => {
      await device.connect();
      expect(device.isConnected()).toBe(true);
      expect(mockBle.requestDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ namePrefix: 'Satisfyer' }]
        })
      );
    });

    it('should handle vibration commands', async () => {
      await device.connect();
      await device.sendCommand({
        type: 'vibration',
        params: { intensity: 0.75 }
      });

      const server = await mockBleDevice.gatt.connect();
      const characteristic = await server
        .getPrimaryService('')
        .then(service => service.getCharacteristic(''));

      expect(characteristic.writeValue).toHaveBeenCalledWith(
        expect.any(Uint8Array)
      );
    });

    it('should handle air pulse commands', async () => {
      await device.connect();
      await device.sendCommand({
        type: 'air',
        params: { pressure: 0.6, frequency: 0.8 }
      });

      const server = await mockBleDevice.gatt.connect();
      const characteristic = await server
        .getPrimaryService('')
        .then(service => service.getCharacteristic(''));

      expect(characteristic.writeValue).toHaveBeenCalled();
    });
  });

  describe('Hicoo Device', () => {
    let device: HicooDevice;

    beforeEach(() => {
      device = new HicooDevice({ id: 'test-hicoo', name: 'Test Hicoo' });
    });

    it('should connect successfully', async () => {
      await device.connect();
      expect(device.isConnected()).toBe(true);
      expect(mockBle.requestDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ namePrefix: 'Hi-' }]
        })
      );
    });

    it('should send motor commands', async () => {
      await device.connect();
      await device.sendCommand({
        type: 'vibrate',
        params: { motor: 1, intensity: 0.8 }
      });

      const characteristic = await mockBleDevice.gatt.connect()
        .then(server => server.getPrimaryService(''))
        .then(service => service.getCharacteristic(''));

      const calls = characteristic.writeValue.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0][0]).toBe(0xAA); // Header check
      expect(calls[0][0][1]).toBe(0x01); // Vibrate command check
    });

    it('should send rotation commands', async () => {
      await device.connect();
      await device.sendCommand({
        type: 'rotate',
        params: { direction: 'clockwise', speed: 0.7 }
      });

      const characteristic = await mockBleDevice.gatt.connect()
        .then(server => server.getPrimaryService(''))
        .then(service => service.getCharacteristic(''));

      const calls = characteristic.writeValue.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0][1]).toBe(0x02); // Rotate command check
    });
  });

  describe('LoveLife Device', () => {
    let device: LoveLifeDevice;

    beforeEach(() => {
      device = new LoveLifeDevice({ id: 'test-lovelife', name: 'Test LoveLife' });
    });

    it('should connect successfully', async () => {
      await device.connect();
      expect(device.isConnected()).toBe(true);
      expect(mockBle.requestDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            { namePrefix: 'Krush' },
            { namePrefix: 'Apex' }
          ])
        })
      );
    });

    it('should handle vibration commands', async () => {
      await device.connect();
      await device.sendCommand({
        type: 'vibrate',
        params: { intensity: 0.6 }
      });

      const characteristic = await mockBleDevice.gatt.connect()
        .then(server => server.getPrimaryService(''))
        .then(service => service.getCharacteristic(''));

      expect(characteristic.writeValue).toHaveBeenCalled();
      const data = characteristic.writeValue.mock.calls[0][0];
      expect(data[0]).toBe(0x01); // Vibrate command check
    });

    it('should handle exercise mode commands', async () => {
      await device.connect();
      await device.sendCommand({
        type: 'exercise',
        params: { mode: 2 }
      });

      const characteristic = await mockBleDevice.gatt.connect()
        .then(server => server.getPrimaryService(''))
        .then(service => service.getCharacteristic(''));

      expect(characteristic.writeValue).toHaveBeenCalled();
      const data = characteristic.writeValue.mock.calls[0][0];
      expect(data[0]).toBe(0x02); // Exercise mode command check
    });

    it('should process pressure readings', async () => {
      await device.connect();
      const pressureSpy = jest.fn();
      device.on('pressure', pressureSpy);

      const characteristic = await mockBleDevice.gatt.connect()
        .then(server => server.getPrimaryService(''))
        .then(service => service.getCharacteristic(''));

      // Simulate pressure reading
      const dataView = new DataView(new ArrayBuffer(2));
      dataView.setUint16(0, 1000, true);
      characteristic.addEventListener.mock.calls[0][1]({
        target: { value: dataView }
      });

      expect(pressureSpy).toHaveBeenCalledWith({ value: 1000 });
    });
  });

  describe('Device Factory', () => {
    it('should create appropriate device instances', () => {
      const info = { id: 'test', name: 'Test Device' };

      expect(createAdditionalDevice('pishock', info, { serverUrl: 'ws://test' }))
        .toBeInstanceOf(PiShockDevice);
      expect(createAdditionalDevice('tcode', info))
        .toBeInstanceOf(TCodeDevice);
      expect(createAdditionalDevice('tens', info))
        .toBeInstanceOf(TENSDevice);
      expect(createAdditionalDevice('vibease', info))
        .toBeInstanceOf(VibeaseDevice);
      expect(createAdditionalDevice('satisfyer', info))
        .toBeInstanceOf(SatisfyerDevice);
      expect(createAdditionalDevice('hicoo', info))
        .toBeInstanceOf(HicooDevice);
      expect(createAdditionalDevice('lovelife', info))
        .toBeInstanceOf(LoveLifeDevice);
    });

    it('should throw error for unknown device type', () => {
      expect(() => createAdditionalDevice('unknown', { id: 'test', name: 'Test' }))
        .toThrow('Unknown additional device type: unknown');
    });
  });
});
