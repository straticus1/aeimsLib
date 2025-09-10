# AeimsLib 🎮

AeimsLib is a comprehensive TypeScript/JavaScript library for integrating with various personal device control protocols. It provides a unified interface for managing and controlling Bluetooth LE and network-connected devices through WebSocket communication, with built-in security, monitoring, and configuration management.

## 🌟 Features

- Multiple Device Protocols:
  - Lovense
  - WeVibe/WowTech
  - Kiiroo
  - Magic Motion
  - Generic BLE devices
  - Buttplug.io protocol
  - Experimental Devices (Beta):
    - Svakom
    - Vorze
    - XInput/DirectInput Gamepads
    - Handy/Stroker
    - OSR/OpenSexRouter
    - MaxPro/Max2
    - PiShock (Electrostimulation)
    - TCode Protocol Devices
    - Bluetooth TENS Units
    - Vibease
    - Satisfyer Connect
    - Hicoo/Hi-Link
    - LoveLife Krush/Apex
- **Real-time Control**:
  - WebSocket-based device control
  - Pattern-based control system
  - Automatic reconnection handling
- **Advanced Patterns**:
  - Constant intensity
  - Wave patterns
  - Pulse patterns
  - Escalation patterns
  - Custom pattern creation
- **Security**:
  - HTTPS/WSS encryption
  - JWT authentication
  - Rate limiting
  - Input validation
  - Data encryption
  - Secure storage
  - Activity logging
- **Monitoring**:
  - Real-time metrics
  - Health checks
  - Performance monitoring
  - Alert system
- **Configuration Management**:
  - Command-line configuration utility
  - Interactive setup
  - Configuration validation
  - Multiple environment support

## 📦 Installation

```bash
# Using npm
npm install aeims-lib

# Using yarn
yarn add aeims-lib
```

For detailed installation instructions, see [Installation Guide](docs/installation/README.md).

## ⚙️ Configuration

AeimsLib includes a powerful configuration utility (`aeims-config`) for managing all aspects of your installation:

```bash
# Check current configuration
aeims-config check

# Run interactive setup
aeims-config setup --interactive

# Configure specific settings
aeims-config configure --setting websocket.port --value 8080

# Run configuration tests
aeims-config test
```

Key configuration features:
- Interactive setup wizard
- Configuration validation
- Environment-specific configs
- Test suite for verification
- Import/export capabilities

See [Configuration Guide](docs/configuration.md) for complete details.

## 🚀 Quick Start

```typescript
import { DeviceManager, WebSocketServer } from 'aeims-lib';

// Initialize device manager
const deviceManager = DeviceManager.getInstance();

// Create WebSocket server
const wsServer = new WebSocketServer({
  port: 8080,
  host: 'localhost',
  path: '/ws'
});

// Handle device control
wsServer.on('deviceCommand', async (command) => {
  await deviceManager.sendCommand(command.deviceId, command);
});
```

## 📚 Documentation

- [Getting Started](docs/getting-started/README.md)
- [API Documentation](docs/api/README.md)
- [Protocol Documentation](docs/protocols/README.md)
- [Configuration Guide](docs/configuration.md)
- [Pattern System](docs/patterns/README.md)
- [Security Guide](docs/security/README.md)
- [Monitoring](docs/monitoring/README.md)
- [Example Usage](docs/examples/README.md)
- [Contributing Guide](CONTRIBUTING.md)

## 🔒 Security

AeimsLib implements comprehensive security measures:

- **Encryption**:
  - HTTPS/WSS for all connections
  - AES-256-GCM for sensitive data
  - Secure key management
- **Authentication**:
  - JWT-based authentication
  - OAuth2 support
  - API key management
- **Protection**:
  - Rate limiting
  - Input validation
  - SQL injection prevention
- **Monitoring**:
  - Security event logging
  - Audit trails
  - Anomaly detection

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build library
npm run build

# Generate documentation
npm run docs
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "Pattern Tests"

# Run tests with coverage
npm run test:coverage
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Run the tests
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🌟 Credits

Developed and maintained by Ryan Coleman (coleman.ryan@gmail.com)
