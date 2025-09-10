import WebSocket from 'ws';
import { MessageType } from '../src/interfaces/websocket';

async function setupClient() {
  // Example JWT token - in a real application, this would be obtained from your auth system
  const token = 'your-jwt-token';

  // Create WebSocket connection
  const ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

  ws.on('open', () => {
    console.log('Connected to server');

    // Example: Join session
    ws.send(JSON.stringify({
      type: MessageType.JOIN_SESSION,
      timestamp: Date.now(),
      sessionId: 'example-session'
    }));

    // Example: Send device command
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: MessageType.DEVICE_COMMAND,
        timestamp: Date.now(),
        command: {
          type: 'constant',
          intensity: 50
        }
      }));
    }, 1000);
  });

  ws.on('message', (data: WebSocket.Data) => {
    const message = JSON.parse(data.toString());
    
    switch (message.type) {
      case MessageType.SESSION_STATUS:
        console.log('Session status:', {
          deviceStatus: message.deviceStatus,
          paymentStatus: message.paymentStatus
        });
        break;

      case MessageType.COMMAND_RESULT:
        console.log('Command result:', message.result);
        break;

      case MessageType.ERROR:
        console.error('Error:', message.error);
        break;

      default:
        console.log('Unknown message type:', message);
    }
  });

  ws.on('close', () => {
    console.log('Disconnected from server');
  });

  ws.on('error', (error: Error) => {
    console.error('WebSocket error:', error);
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('Closing connection...');
    ws.close();
    process.exit(0);
  });
}

setupClient().catch(console.error);
