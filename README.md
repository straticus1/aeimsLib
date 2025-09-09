# AeimsLib

AeimsLib is a PHP library for integrating with various personal device control protocols. It provides a unified interface for managing and controlling Bluetooth LE and network-connected devices through a RESTful API and WebSocket interface.

## Features

- Support for multiple device protocols:
  - Lovense
  - WeVibe/WowTech
  - Kiiroo
  - Magic Motion
  - Generic BLE devices
  - Buttplug.io protocol
- Real-time device control via WebSocket
- Pattern creation and sharing
- Comprehensive device testing
- Secure API endpoints
- Extensive documentation

## Installation

```bash
composer require aeimslib/aeimslib
```

For detailed installation instructions, see [Installation Guide](docs/installation/README.md).

## Documentation

- [API Documentation](docs/api/README.md)
- [Protocol Documentation](docs/protocols/README.md)
- [Example Usage](docs/examples/README.md)
- [Contributing Guide](CONTRIBUTING.md)

## Security

This library implements several security measures:
- HTTPS/WSS for all connections
- API key management
- Input validation
- Data encryption
- Secure storage
- Activity logging

## License

MIT License
