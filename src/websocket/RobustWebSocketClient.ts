import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { SecurityService } from '../interfaces/security';
import { Logger } from '../utils/Logger';

export interface WebSocketConfig {
  url: string;
  protocols?: string | string[];
  headers?: { [key: string]: string };
  // Reconnection settings
  reconnect: {
    enabled: boolean;
    initialDelay: number;
    maxDelay: number;
    maxAttempts: number;
  };
  // Heartbeat settings
  heartbeat: {
    enabled: boolean;
    interval: number;
    timeout: number;
  };
  // Security settings
  security?: {
    service: SecurityService;
    tokenProvider: () => Promise<string>;
  };
}

export interface ConnectionState {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  lastConnected: Date | null;
  lastError: Error | null;
  reconnectAttempts: number;
  heartbeatMissed: number;
}

export enum WebSocketEvent {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  MESSAGE = 'message',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat',
  STATE_CHANGE = 'stateChange'
}

export class RobustWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private state: ConnectionState;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private logger: Logger;

  constructor(config: WebSocketConfig) {
    super();

    this.config = {
      ...config,
      reconnect: {
        enabled: true,
        initialDelay: 1000,
        maxDelay: 30000,
        maxAttempts: 10,
        ...config.reconnect
      },
      heartbeat: {
        enabled: true,
        interval: 30000,
        timeout: 5000,
        ...config.heartbeat
      }
    };

    this.state = {
      connected: false,
      connecting: false,
      reconnecting: false,
      lastConnected: null,
      lastError: null,
      reconnectAttempts: 0,
      heartbeatMissed: 0
    };

    this.logger = Logger.getInstance();
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN ||
        this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.updateState({ connecting: true });
    this.emit(WebSocketEvent.CONNECTING);

    try {
      // Get authentication token if security is configured
      const headers = { ...this.config.headers };
      if (this.config.security) {
        const token = await this.config.security.tokenProvider();
        headers.Authorization = `Bearer ${token}`;
      }

      // Create WebSocket connection
      this.ws = new WebSocket(this.config.url, this.config.protocols, {
        headers
      });

      // Set up event handlers
      this.setupEventHandlers();

    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.handleConnect();
    });

    this.ws.on('close', () => {
      this.handleDisconnect();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (error: Error) => {
      this.handleError(error);
    });

    this.ws.on('ping', () => {
      this.handleHeartbeat();
    });

    this.ws.on('pong', () => {
      this.handleHeartbeat();
    });
  }

  private handleConnect(): void {
    this.updateState({
      connected: true,
      connecting: false,
      reconnecting: false,
      lastConnected: new Date(),
      reconnectAttempts: 0,
      heartbeatMissed: 0
    });

    // Start heartbeat if enabled
    if (this.config.heartbeat.enabled) {
      this.startHeartbeat();
    }

    this.emit(WebSocketEvent.CONNECTED);
  }

  private handleDisconnect(): void {
    const wasConnected = this.state.connected;

    this.updateState({
      connected: false,
      connecting: false
    });

    this.stopHeartbeat();

    if (wasConnected) {
      this.emit(WebSocketEvent.DISCONNECTED);
    }

    // Attempt reconnection if enabled
    if (this.config.reconnect.enabled &&
        this.state.reconnectAttempts < this.config.reconnect.maxAttempts) {
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      // Reset heartbeat counter on any message
      this.state.heartbeatMissed = 0;

      // Parse and emit message
      const message = this.parseMessage(data);
      this.emit(WebSocketEvent.MESSAGE, message);

    } catch (error) {
      this.logger.error('Error handling message', { error });
      this.emit(WebSocketEvent.ERROR, error);
    }
  }

  private handleError(error: Error): void {
    this.updateState({
      lastError: error
    });

    this.logger.error('WebSocket error', { error });
    this.emit(WebSocketEvent.ERROR, error);
  }

  private handleHeartbeat(): void {
    this.state.heartbeatMissed = 0;
    this.emit(WebSocketEvent.HEARTBEAT);

    // Clear existing timeout and set new one
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }

    this.heartbeatTimeout = setTimeout(() => {
      this.handleHeartbeatTimeout();
    }, this.config.heartbeat.timeout);
  }

  private handleHeartbeatTimeout(): void {
    this.state.heartbeatMissed++;

    if (this.state.heartbeatMissed >= 2) {
      this.logger.warn('Multiple heartbeats missed, reconnecting');
      this.reconnect();
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.heartbeat.interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(
      this.config.reconnect.initialDelay * Math.pow(2, this.state.reconnectAttempts),
      this.config.reconnect.maxDelay
    );

    this.updateState({
      reconnecting: true,
      reconnectAttempts: this.state.reconnectAttempts + 1
    });

    this.emit(WebSocketEvent.RECONNECTING, {
      attempt: this.state.reconnectAttempts,
      delay
    });

    this.reconnectTimeout = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  private async reconnect(): Promise<void> {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    try {
      await this.connect();
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  send(data: any): void {
    if (!this.isConnected()) {
      throw new Error('WebSocket is not connected');
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws!.send(message);
  }

  close(): void {
    this.config.reconnect.enabled = false; // Disable reconnection
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
    }
  }

  isConnected(): boolean {
    return this.state.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  getState(): ConnectionState {
    return { ...this.state };
  }

  private updateState(updates: Partial<ConnectionState>): void {
    const previousState = { ...this.state };
    this.state = { ...this.state, ...updates };

    if (JSON.stringify(previousState) !== JSON.stringify(this.state)) {
      this.emit(WebSocketEvent.STATE_CHANGE, this.state);
    }
  }

  private parseMessage(data: WebSocket.Data): any {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }
}
