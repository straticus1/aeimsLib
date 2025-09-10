import { RobustWebSocketClient, WebSocketConfig, WebSocketEvent } from '../RobustWebSocketClient';
import WebSocket from 'ws';
import { Logger } from '../../utils/Logger';

// Mock WebSocket server for testing
class MockWebSocketServer {
  private server: WebSocket.Server;
  private clients: Set<WebSocket> = new Set();

  constructor(port: number) {
    this.server = new WebSocket.Server({ port });

    this.server.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
    });
  }

  broadcast(data: any): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  close(): void {
    this.clients.forEach(client => client.close());
    this.server.close();
  }

  disconnectAll(): void {
    this.clients.forEach(client => client.terminate());
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

describe('RobustWebSocketClient', () => {
  let server: MockWebSocketServer;
  let client: RobustWebSocketClient;
  let config: WebSocketConfig;

  const PORT = 8088;
  const WS_URL = `ws://localhost:${PORT}`;

  beforeEach(() => {
    server = new MockWebSocketServer(PORT);
    
    config = {
      url: WS_URL,
      reconnect: {
        enabled: true,
        initialDelay: 100,
        maxDelay: 1000,
        maxAttempts: 3
      },
      heartbeat: {
        enabled: true,
        interval: 100,
        timeout: 50
      }
    };

    client = new RobustWebSocketClient(config);

    // Mock logger to prevent console noise during tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    client.close();
    server.close();
  });

  describe('Connection Management', () => {
    test('should connect successfully', async () => {
      const connectPromise = new Promise<void>(resolve => {
        client.once(WebSocketEvent.CONNECTED, () => resolve());
      });

      await client.connect();
      await connectPromise;

      expect(client.isConnected()).toBe(true);
      expect(client.getState().connected).toBe(true);
      expect(server.clientCount).toBe(1);
    });

    test('should handle connection errors', async () => {
      server.close(); // Close server to force connection error

      const errorPromise = new Promise<Error>(resolve => {
        client.once(WebSocketEvent.ERROR, (error) => resolve(error));
      });

      try {
        await client.connect();
      } catch (error) {
        // Expected
      }

      const error = await errorPromise;
      expect(error).toBeDefined();
      expect(client.isConnected()).toBe(false);
      expect(client.getState().lastError).toBeDefined();
    });

    test('should handle clean disconnection', async () => {
      const disconnectPromise = new Promise<void>(resolve => {
        client.once(WebSocketEvent.DISCONNECTED, () => resolve());
      });

      await client.connect();
      client.close();

      await disconnectPromise;
      expect(client.isConnected()).toBe(false);
      expect(client.getState().connected).toBe(false);
    });
  });

  describe('Automatic Reconnection', () => {
    test('should attempt reconnection after disconnect', async () => {
      const reconnectingPromise = new Promise<void>(resolve => {
        client.once(WebSocketEvent.RECONNECTING, () => resolve());
      });

      await client.connect();
      server.disconnectAll();

      await reconnectingPromise;
      expect(client.getState().reconnecting).toBe(true);
      expect(client.getState().reconnectAttempts).toBeGreaterThan(0);
    });

    test('should use exponential backoff', async () => {
      const delays: number[] = [];
      
      client.on(WebSocketEvent.RECONNECTING, (info) => {
        delays.push(info.delay);
      });

      await client.connect();
      server.close(); // Force disconnection

      // Wait for all reconnection attempts
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check exponential increase in delays
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThan(delays[i-1]);
      }
    });

    test('should stop reconnecting after max attempts', async () => {
      await client.connect();
      server.close();

      // Wait for reconnection attempts to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(client.getState().reconnectAttempts).toBe(config.reconnect.maxAttempts);
      expect(client.getState().reconnecting).toBe(false);
    });
  });

  describe('Heartbeat Mechanism', () => {
    test('should send heartbeats at configured interval', async () => {
      let heartbeatCount = 0;
      client.on(WebSocketEvent.HEARTBEAT, () => heartbeatCount++);

      await client.connect();
      await new Promise(resolve => setTimeout(resolve, 250));

      expect(heartbeatCount).toBeGreaterThan(1);
    });

    test('should detect missed heartbeats', async () => {
      const reconnectPromise = new Promise<void>(resolve => {
        client.once(WebSocketEvent.RECONNECTING, () => resolve());
      });

      await client.connect();

      // Simulate network problem without disconnecting
      server.disconnectAll();

      await reconnectPromise;
      expect(client.getState().heartbeatMissed).toBeGreaterThan(0);
    });

    test('should reset heartbeat counter on messages', async () => {
      await client.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      server.broadcast('test message');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(client.getState().heartbeatMissed).toBe(0);
    });
  });

  describe('Message Handling', () => {
    test('should handle string messages', async () => {
      const message = 'test message';
      const messagePromise = new Promise<string>(resolve => {
        client.once(WebSocketEvent.MESSAGE, (data) => resolve(data));
      });

      await client.connect();
      server.broadcast(message);

      const received = await messagePromise;
      expect(received).toBe(message);
    });

    test('should handle JSON messages', async () => {
      const message = { type: 'test', data: { value: 123 } };
      const messagePromise = new Promise(resolve => {
        client.once(WebSocketEvent.MESSAGE, (data) => resolve(data));
      });

      await client.connect();
      server.broadcast(message);

      const received = await messagePromise;
      expect(received).toEqual(message);
    });

    test('should send messages', async () => {
      const message = { type: 'test', data: 'hello' };
      const messagePromise = new Promise(resolve => {
        server.server.on('connection', (ws) => {
          ws.once('message', (data) => resolve(JSON.parse(data.toString())));
        });
      });

      await client.connect();
      client.send(message);

      const received = await messagePromise;
      expect(received).toEqual(message);
    });

    test('should handle send errors when disconnected', async () => {
      expect(() => client.send('test')).toThrow('WebSocket is not connected');
    });
  });

  describe('State Management', () => {
    test('should track connection state changes', async () => {
      const states: string[] = [];
      client.on(WebSocketEvent.STATE_CHANGE, (state) => {
        if (state.connected) states.push('connected');
        if (state.connecting) states.push('connecting');
        if (state.reconnecting) states.push('reconnecting');
      });

      await client.connect();
      server.disconnectAll();

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(states).toContain('connecting');
      expect(states).toContain('connected');
      expect(states).toContain('reconnecting');
    });

    test('should maintain connection history', async () => {
      await client.connect();
      const firstConnection = client.getState().lastConnected;

      client.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      await client.connect();
      const secondConnection = client.getState().lastConnected;

      expect(secondConnection).not.toEqual(firstConnection);
      expect(secondConnection).toBeInstanceOf(Date);
    });

    test('should track error history', async () => {
      const error = new Error('Test error');
      
      await client.connect();
      client['handleError'](error);

      expect(client.getState().lastError).toBe(error);
    });
  });

  describe('Security Integration', () => {
    test('should handle token authentication', async () => {
      const token = 'test_token';
      const tokenProvider = jest.fn().mockResolvedValue(token);
      
      const secureClient = new RobustWebSocketClient({
        ...config,
        security: {
          service: {} as any,
          tokenProvider
        }
      });

      const connectionPromise = new Promise<WebSocket>(resolve => {
        server.server.once('connection', (ws, request) => {
          resolve(ws);
          expect(request.headers.authorization).toBe(`Bearer ${token}`);
        });
      });

      await secureClient.connect();
      await connectionPromise;

      expect(tokenProvider).toHaveBeenCalled();
      secureClient.close();
    });

    test('should handle token refresh on reconnection', async () => {
      const tokenProvider = jest.fn()
        .mockResolvedValueOnce('token1')
        .mockResolvedValueOnce('token2');

      const secureClient = new RobustWebSocketClient({
        ...config,
        security: {
          service: {} as any,
          tokenProvider
        }
      });

      await secureClient.connect();
      server.disconnectAll();

      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(tokenProvider).toHaveBeenCalledTimes(2);
      secureClient.close();
    });
  });
});
