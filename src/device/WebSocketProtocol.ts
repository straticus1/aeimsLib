import WebSocket from 'ws';
import { BaseProtocolAdapter } from './BaseProtocolAdapter';
import {
  DeviceCommand,
  CommandResult,
  DeviceEvent,
  DeviceEventType
} from '../interfaces/device';

interface WebSocketProtocolConfig {
  url: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  pingInterval: number;
  pingTimeout: number;
}

export class WebSocketProtocol extends BaseProtocolAdapter {
  private ws: WebSocket | null;
  private config: WebSocketProtocolConfig;
  private reconnectAttempts: number;
  private pingTimer?: NodeJS.Timeout;
  private pingTimeout?: NodeJS.Timeout;

  constructor(config: WebSocketProtocolConfig) {
    super();
    this.ws = null;
    this.config = config;
    this.reconnectAttempts = 0;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.on('open', () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.startPingTimer();
          this.emitEvent({
            type: DeviceEventType.CONNECTED,
            deviceId: 'ws', // This should be set in the implementing class
            timestamp: new Date()
          });
          resolve();
        });

        this.ws.on('message', async (data: Buffer) => {
          try {
            const message = await this.decryptResponse(data);
            await this.handleMessage(message);
          } catch (error) {
            this.logger.error(`Failed to handle message: ${error}`);
          }
        });

        this.ws.on('close', () => {
          this.handleDisconnect();
        });

        this.ws.on('error', (error: Error) => {
          this.logger.error(`WebSocket error: ${error}`);
          this.handleDisconnect();
          reject(error);
        });

        this.ws.on('pong', () => {
          if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = undefined;
          }
        });
      } catch (error) {
        this.logger.error(`Failed to create WebSocket: ${error}`);
        this.handleDisconnect();
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopPingTimer();
    this.connected = false;
  }

  async sendCommand(command: DeviceCommand): Promise<CommandResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return this.createCommandResult(false, command, 'WebSocket not connected');
    }

    try {
      const data = await this.encryptCommand(command);
      
      return new Promise((resolve, reject) => {
        this.ws!.send(data, (error) => {
          if (error) {
            this.logger.error(`Failed to send command: ${error}`);
            resolve(this.createCommandResult(false, command, String(error)));
          } else {
            resolve(this.createCommandResult(true, command));
          }
        });
      });
    } catch (error) {
      this.logger.error(`Failed to send command: ${error}`);
      return this.createCommandResult(false, command, String(error));
    }
  }

  private startPingTimer(): void {
    this.stopPingTimer();
    
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
        
        this.pingTimeout = setTimeout(() => {
          this.logger.warn('Ping timeout - reconnecting');
          this.handleDisconnect();
        }, this.config.pingTimeout);
      }
    }, this.config.pingInterval);
  }

  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }

  private handleDisconnect(): void {
    this.connected = false;
    this.stopPingTimer();

    this.emitEvent({
      type: DeviceEventType.DISCONNECTED,
      deviceId: 'ws', // This should be set in the implementing class
      timestamp: new Date()
    });

    // Attempt to reconnect if configured
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          this.logger.error(`Reconnection attempt failed: ${error}`);
        });
      }, this.config.reconnectInterval);
    }
  }

  private async handleMessage(message: any): Promise<void> {
    // Implement message handling based on your protocol
    // This is a basic example - extend based on your needs
    if (message.type === 'status') {
      await this.emitEvent({
        type: DeviceEventType.STATUS_CHANGED,
        deviceId: 'ws', // This should be set in the implementing class
        timestamp: new Date(),
        data: message.status
      });
    } else if (message.type === 'error') {
      await this.emitEvent({
        type: DeviceEventType.ERROR,
        deviceId: 'ws', // This should be set in the implementing class
        timestamp: new Date(),
        data: message.error
      });
    }
  }
}
