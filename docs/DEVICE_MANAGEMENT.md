# Device Management System

## Overview

The device management system is an integral part of the SexaComms platform, providing comprehensive device management capabilities with support for both development and production environments. It is integrated into the main SexaComms CLI tool.

## Features

- Device lifecycle management (add, list, delete, promote)
- Development and production mode support
- Feature management with experimental feature handling
- Pricing system with mode-specific rates
- Device state persistence with transaction support
- Comprehensive audit logging
- Integration testing support

## Installation

The device management system is automatically included in the SexaComms CLI. No additional installation is required.

## Commands

### Device Management

```bash
# Add new device
./cli/sexacomms device:add <type> <name> [id]

# List devices
./cli/sexacomms device:list
./cli/sexacomms device:list --type=vibrator
./cli/sexacomms device:list --features=basic_control,wave_pattern

# Delete device
./cli/sexacomms device:delete <id>
./cli/sexacomms device:delete <id> --force

# Promote device to default
./cli/sexacomms device:promote <id>
```

### Development Mode Commands

These commands are only available in development mode:

```bash
# List device features
./cli/sexacomms device:features <type>

# Show device pricing
./cli/sexacomms device:pricing <type>
```

## Configuration

### Device Configuration Files

Device configurations are stored in JSON files in the `config/devices/` directory. Example configuration:

```json
{
  "type": "vibrator",
  "name": "Advanced Vibration Device",
  "description": "High-precision vibration device with multiple control modes",
  "version": "1.0.0",
  "features": [
    {
      "id": "basic_control",
      "name": "Basic Control",
      "description": "Basic intensity control from 0-100%",
      "parameters": [
        {
          "id": "intensity",
          "name": "Intensity",
          "type": "number",
          "min": 0,
          "max": 100,
          "default": 0
        }
      ]
    },
    {
      "id": "wave_pattern",
      "name": "Wave Pattern",
      "description": "Sinusoidal intensity pattern with configurable frequency",
      "parameters": [
        {
          "id": "min_intensity",
          "name": "Minimum Intensity",
          "type": "number",
          "min": 0,
          "max": 100,
          "default": 0
        },
        {
          "id": "max_intensity",
          "name": "Maximum Intensity",
          "type": "number",
          "min": 0,
          "max": 100,
          "default": 100
        },
        {
          "id": "frequency",
          "name": "Frequency (Hz)",
          "type": "number",
          "min": 0.1,
          "max": 10,
          "default": 1
        }
      ]
    }
  ],
  "pricing": {
    "baseRate": 50,
    "featureRates": {
      "basic_control": 0,
      "wave_pattern": 25
    },
    "currency": "USD",
    "billingPeriod": "monthly",
    "minimumCharge": 50,
    "enterpriseDiscount": 0.2
  }
}
```

### Environment Variables

The device management system uses the following environment variables:

```bash
# Device Management Configuration
AEIMS_DATA_DIR=/path/to/data/dir     # Device state storage directory
AEIMS_LOG_DIR=/path/to/logs          # Audit log directory
AEIMS_USER_ID=user_id               # User ID for audit logging
AEIMS_CLIENT_IP=client_ip           # Client IP for audit logging
NODE_ENV=development                # Operating mode (development/production)
```

## Development vs Production Mode

### Development Mode
- All features available (including experimental)
- Free pricing (zero rates)
- Debug commands enabled
- Relaxed validation
- Full feature visibility

### Production Mode
- Only stable features
- Real pricing
- Strict validation
- Required authentication for sensitive features
- Limited debug capabilities

## Integration Testing

The device management system includes a comprehensive test suite:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- DeviceManager.test.ts

# Run tests with coverage
npm test -- --coverage
```

## Audit Logging

All device operations are logged with the following information:
- Timestamp
- Operation type
- Device ID
- User ID
- Client IP
- Mode (development/production)
- Operation metadata

Logs are automatically rotated and archived based on size and age.

## Error Handling

The system includes comprehensive error handling with specific error types:
- `INVALID_OPERATION`
- `DEVICE_NOT_FOUND`
- `DUPLICATE_DEVICE`
- `VALIDATION_ERROR`
- `STATE_LOAD_ERROR`
- `PERSISTENCE_ERROR`
- `CONFIGURATION_ERROR`
- `AUTH_ERROR`
- `QUOTA_EXCEEDED`

## Security

- Transaction-based operations
- File-level locking for concurrent access
- Mode-specific validation rules
- Authentication requirements for sensitive operations
- Comprehensive audit logging

## Architecture

The system follows a modular architecture:

- `DeviceManager`: Core management class
- `DeviceConfig`: Configuration management
- `PersistenceManager`: State persistence
- `AuditLogger`: Operation logging
- `DeviceManagementIntegration`: CLI integration

## Best Practices

1. Always use transactions for state-modifying operations
2. Validate device configurations before deployment
3. Monitor audit logs for unusual activity
4. Use proper error handling in integrations
5. Regular backup of device state and configurations
6. Proper mode selection (development vs production)

## FAQ

### Q: How do I switch between development and production modes?
A: Use the NODE_ENV environment variable: `NODE_ENV=production ./cli/sexacomms`

### Q: How are device features managed in different modes?
A: Development mode shows all features, while production mode only shows stable features (non-experimental).

### Q: How is pricing calculated?
A: Pricing includes base rate and feature-specific rates. Development mode has zero pricing, while production mode uses configured rates.

### Q: How is device state persisted?
A: Device state is persisted in JSON format with transaction support and file locking for concurrent access.

### Q: How are audit logs managed?
A: Audit logs are automatically rotated based on size (10MB) with a maximum of 10 files kept.
