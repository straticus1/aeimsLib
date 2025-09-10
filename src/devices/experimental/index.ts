import { EventEmitter } from 'events';
import { Device, DeviceInfo, DeviceCommand } from '../../interfaces/device';
import { Logger } from '../../utils/Logger';
import { DeviceMonitoring } from '../../monitoring';

/**
 * Base class for experimental device support
 */
abstract class ExperimentalDevice extends EventEmitter implements Device {
  protected logger: Logger;
  protected monitor: DeviceMonitoring;
  protected connected: boolean = false;

  constructor(
    public readonly info: DeviceInfo
  ) {
    super();
    this.logger = Logger.getInstance();
    this.monitor = new DeviceMonitoring(info.id);
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendCommand(command: DeviceCommand): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Svakom device support
 */
export class SvakomDevice extends ExperimentalDevice {
  private btDevice: any; // Bluetooth device handle

  async connect(): Promise<void> {
    try {
      // Request Bluetooth device
      this.btDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Svakom' }],
        optionalServices: ['device_info', 'battery_service']
      });

      await this.btDevice.gatt.connect();
      this.connected = true;
      this.monitor.onConnect();
      this.emit('connected');
    } catch (error) {
      this.logger.error('Failed to connect to Svakom device', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.btDevice?.gatt.connected) {
      await this.btDevice.gatt.disconnect();
    }
    this.connected = false;
    this.monitor.onDisconnect();
    this.emit('disconnected');
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    const startTime = Date.now();
    try {
      // Implementation specific to Svakom protocol
      // Command structure varies by model
      this.monitor.onCommandStart(command.type);
      await this._sendRawCommand(command);
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
    } catch (error) {
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error as Error);
      throw error;
    }
  }

  private async _sendRawCommand(command: DeviceCommand): Promise<void> {
    // Implement Svakom-specific command protocol
  }
}

/**
 * Vorze device support
 */
export class VorzeDevice extends ExperimentalDevice {
  private socket: WebSocket | null = null;
  private readonly serverUrl: string;

  constructor(info: DeviceInfo, serverUrl: string) {
    super(info);
    this.serverUrl = serverUrl;
  }

  async connect(): Promise<void> {
    try {
      this.socket = new WebSocket(this.serverUrl);
      
      await new Promise((resolve, reject) => {
        this.socket!.onopen = resolve;
        this.socket!.onerror = reject;
      });

      this.connected = true;
      this.monitor.onConnect();
      this.emit('connected');
    } catch (error) {
      this.logger.error('Failed to connect to Vorze device', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this.monitor.onDisconnect();
    this.emit('disconnected');
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    const startTime = Date.now();
    try {
      this.monitor.onCommandStart(command.type);
      // Implement Vorze-specific command protocol
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
    } catch (error) {
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error as Error);
      throw error;
    }
  }
}

/**
 * XInput/DirectInput device support
 */
export class GamepadDevice extends ExperimentalDevice {
  private gamepad: Gamepad | null = null;
  private updateInterval: NodeJS.Timer | null = null;

  async connect(): Promise<void> {
    try {
      // Listen for gamepad connection
      window.addEventListener('gamepadconnected', this.handleGamepadConnect);
      window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnect);
      
      // Check if gamepad is already connected
      const gamepads = navigator.getGamepads();
      for (const gamepad of gamepads) {
        if (gamepad && this.isCompatibleGamepad(gamepad)) {
          this.handleGamepadConnect({ gamepad } as GamepadEvent);
          break;
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize gamepad device', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    window.removeEventListener('gamepadconnected', this.handleGamepadConnect);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnect);
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.gamepad = null;
    this.connected = false;
    this.monitor.onDisconnect();
    this.emit('disconnected');
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    // Gamepad devices are input-only
    throw new Error('Gamepad devices do not support direct commands');
  }

  private handleGamepadConnect = (event: GamepadEvent) => {
    const { gamepad } = event;
    if (this.isCompatibleGamepad(gamepad)) {
      this.gamepad = gamepad;
      this.connected = true;
      this.monitor.onConnect();
      this.emit('connected');

      // Start polling gamepad state
      this.updateInterval = setInterval(() => this.updateState(), 50);
    }
  };

  private handleGamepadDisconnect = (event: GamepadEvent) => {
    if (event.gamepad.id === this.gamepad?.id) {
      this.disconnect();
    }
  };

  private isCompatibleGamepad(gamepad: Gamepad): boolean {
    // Check if gamepad matches supported devices
    return true; // Implement actual compatibility check
  }

  private updateState() {
    if (!this.gamepad) return;

    // Read gamepad state and emit events
    const gamepad = navigator.getGamepads()[this.gamepad.index];
    if (gamepad) {
      this.emit('state', {
        buttons: gamepad.buttons.map(b => b.value),
        axes: gamepad.axes
      });
    }
  }
}

/**
 * OSR/OpenSexRouter device support
 */
export class OSRDevice extends ExperimentalDevice {
  private socket: WebSocket | null = null;
  private readonly serverUrl: string;

  constructor(info: DeviceInfo, serverUrl: string) {
    super(info);
    this.serverUrl = serverUrl;
  }

  async connect(): Promise<void> {
    try {
      this.socket = new WebSocket(this.serverUrl);
      
      await new Promise((resolve, reject) => {
        this.socket!.onopen = resolve;
        this.socket!.onerror = reject;
      });

      // Set up message handling
      this.socket!.onmessage = this.handleMessage;
      
      this.connected = true;
      this.monitor.onConnect();
      this.emit('connected');
    } catch (error) {
      this.logger.error('Failed to connect to OSR server', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this.monitor.onDisconnect();
    this.emit('disconnected');
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    const startTime = Date.now();
    try {
      this.monitor.onCommandStart(command.type);
      
      // Convert command to OSR format
      const osrCommand = this.convertToOSRCommand(command);
      await this.sendOSRCommand(osrCommand);
      
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
    } catch (error) {
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error as Error);
      throw error;
    }
  }

  private handleMessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      // Handle different message types
      switch (message.type) {
        case 'state':
          this.emit('state', message.data);
          break;
        case 'error':
          this.handleError(message.error);
          break;
      }
    } catch (error) {
      this.logger.error('Error handling OSR message', { error, data: event.data });
    }
  };

  private handleError(error: any) {
    this.logger.error('OSR error', { error });
    this.monitor.onError(new Error(error.message), error);
  }

  private convertToOSRCommand(command: DeviceCommand): any {
    // Convert library command format to OSR format
    return {
      type: command.type,
      params: command.params
    };
  }

  private async sendOSRCommand(command: any): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('OSR connection not ready');
    }
    this.socket.send(JSON.stringify(command));
  }
}

/**
 * MaxPro/Max2 device support
 */
export class MaxDevice extends ExperimentalDevice {
  private btDevice: any; // Bluetooth device handle
  private characteristic: any; // Command characteristic
  private notifyCharacteristic: any; // Notification characteristic

  async connect(): Promise<void> {
    try {
      // Request Bluetooth device
      this.btDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'MaxPro' }],
        optionalServices: ['device_control', 'battery_service']
      });

      const server = await this.btDevice.gatt.connect();
      const service = await server.getPrimaryService('device_control');
      
      // Get command and notification characteristics
      this.characteristic = await service.getCharacteristic('command');
      this.notifyCharacteristic = await service.getCharacteristic('notify');
      
      // Set up notifications
      await this.notifyCharacteristic.startNotifications();
      this.notifyCharacteristic.addEventListener(
        'characteristicvaluechanged',
        this.handleNotification
      );

      this.connected = true;
      this.monitor.onConnect();
      this.emit('connected');
    } catch (error) {
      this.logger.error('Failed to connect to Max device', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.notifyCharacteristic) {
        await this.notifyCharacteristic.stopNotifications();
      }
      if (this.btDevice?.gatt.connected) {
        await this.btDevice.gatt.disconnect();
      }
    } finally {
      this.characteristic = null;
      this.notifyCharacteristic = null;
      this.btDevice = null;
      this.connected = false;
      this.monitor.onDisconnect();
      this.emit('disconnected');
    }
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    const startTime = Date.now();
    try {
      this.monitor.onCommandStart(command.type);
      
      // Convert and send command
      const data = this.convertToMaxCommand(command);
      await this.characteristic.writeValue(data);
      
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
    } catch (error) {
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error as Error);
      throw error;
    }
  }

  private handleNotification = (event: any) => {
    const value = event.target.value;
    // Process notification data
    // Emit state changes, battery updates, etc.
  };

  private convertToMaxCommand(command: DeviceCommand): Uint8Array {
    // Convert library command format to Max protocol format
    // Implementation varies by model/firmware
    return new Uint8Array([/* command bytes */]);
  }
}

/**
 * Handy/Stroker device support
 */
export class HandyDevice extends ExperimentalDevice {
  private socket: WebSocket | null = null;
  private readonly serverUrl: string;
  private connectionToken: string | null = null;

  constructor(info: DeviceInfo, serverUrl: string) {
    super(info);
    this.serverUrl = serverUrl;
  }

  async connect(): Promise<void> {
    try {
      // Authenticate with Handy server
      const authResponse = await fetch(`${this.serverUrl}/auth`, {
        method: 'POST',
        body: JSON.stringify({ deviceId: this.info.id })
      });
      const { token } = await authResponse.json();
      this.connectionToken = token;

      // Connect WebSocket
      this.socket = new WebSocket(`${this.serverUrl}/ws?token=${token}`);
      
      await new Promise((resolve, reject) => {
        this.socket!.onopen = resolve;
        this.socket!.onerror = reject;
      });

      // Set up message handling
      this.socket!.onmessage = this.handleMessage;
      
      this.connected = true;
      this.monitor.onConnect();
      this.emit('connected');
    } catch (error) {
      this.logger.error('Failed to connect to Handy device', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionToken = null;
    this.connected = false;
    this.monitor.onDisconnect();
    this.emit('disconnected');
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    const startTime = Date.now();
    try {
      this.monitor.onCommandStart(command.type);
      
      // Convert and send command
      const handyCommand = this.convertToHandyCommand(command);
      await this.sendHandyCommand(handyCommand);
      
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, true);
    } catch (error) {
      this.monitor.onCommandComplete(command.type, Date.now() - startTime, false, error as Error);
      throw error;
    }
  }

  private handleMessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'state':
          this.emit('state', message.data);
          break;
        case 'error':
          this.handleError(message.error);
          break;
      }
    } catch (error) {
      this.logger.error('Error handling Handy message', { error, data: event.data });
    }
  };

  private handleError(error: any) {
    this.logger.error('Handy error', { error });
    this.monitor.onError(new Error(error.message), error);
  }

  private convertToHandyCommand(command: DeviceCommand): any {
    // Convert library command format to Handy protocol format
    return {
      cmd: command.type,
      params: command.params
    };
  }

  private async sendHandyCommand(command: any): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Handy connection not ready');
    }
    this.socket.send(JSON.stringify(command));
  }
}

// Device factory function
export async function createExperimentalDevice(
  type: string,
  info: DeviceInfo,
  options: any = {}
): Promise<Device> {
  switch (type.toLowerCase()) {
    case 'svakom':
      return new SvakomDevice(info);
    
    case 'vorze':
      return new VorzeDevice(info, options.serverUrl);
    
    case 'gamepad':
      return new GamepadDevice(info);
    
    case 'osr':
      return new OSRDevice(info, options.serverUrl);
    
    case 'max':
      return new MaxDevice(info);
    
    case 'handy':
      return new HandyDevice(info, options.serverUrl);
    
    default:
      throw new Error(`Unknown experimental device type: ${type}`);
  }
}
