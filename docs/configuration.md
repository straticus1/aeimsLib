# aeimsLib Configuration Utility

## Overview

The aeimsLib configuration utility (`aeims-config`) is a command-line tool for managing all aspects of your aeimsLib installation. It provides commands for checking, verifying, setting up, configuring, testing, and managing your configuration.

## Installation

The configuration utility is included with aeimsLib. After installing aeimsLib, the `aeims-config` command should be available in your path.

```bash
# Make sure the command is available
aeims-config --version
```

## Configuration File

The configuration file is stored in YAML format at `~/.aeims/config.yml` by default. You can maintain multiple configuration files and templates in the `templates` directory.

## Commands

### Check Configuration
```bash
# Check current configuration
aeims-config check

# Show detailed configuration information
aeims-config check --verbose
```

### Verify Configuration
```bash
# Verify configuration and run tests
aeims-config verify

# Verify configuration without running tests
aeims-config verify --skip-tests
```

### Setup
```bash
# Run initial setup
aeims-config setup

# Run interactive setup
aeims-config setup --interactive

# Force setup (overwrite existing configuration)
aeims-config setup --force
```

### Configure Settings
```bash
# Configure a specific setting
aeims-config configure --setting websocket.port --value 8080

# Configure interactively
aeims-config configure --interactive
```

### Run Tests
```bash
# Run all tests
aeims-config test

# Run specific test
aeims-config test --test websocket

# Show detailed test output
aeims-config test --verbose
```

### Remove Settings
```bash
# Remove a specific setting
aeims-config remove websocket.pingTimeout

# Force removal without confirmation
aeims-config remove websocket.pingTimeout --force
```

### Install Configuration
```bash
# Install from template
aeims-config install default

# Install from file
aeims-config install /path/to/config.yml

# Force install (overwrite existing)
aeims-config install default --force
```

### Uninstall Configuration
```bash
# Uninstall configuration
aeims-config uninstall

# Force uninstall without confirmation
aeims-config uninstall --force
```

## Configuration Sections

### WebSocket
```yaml
websocket:
  port: 8080            # Server port (1-65535)
  host: localhost       # Server host
  path: /ws            # WebSocket endpoint path
  pingInterval: 30000  # Ping interval in milliseconds
  pingTimeout: 5000    # Ping timeout in milliseconds
```

### Security
```yaml
security:
  encryption:
    enabled: true
    algorithm: aes-256-gcm  # aes-256-gcm or aes-256-cbc
    keySize: 32            # 16, 24, or 32
    authTagLength: 16      # 8, 12, or 16
  authentication:
    type: jwt              # jwt, oauth2, or basic
    tokenExpiration: 3600
    refreshTokenExpiration: 86400
  rateLimit:
    enabled: true
    windowMs: 60000        # Window size in milliseconds
    maxRequests: 100       # Max requests per window
  audit:
    enabled: true
    retention: 30          # Days to retain audit logs
    detailLevel: basic     # basic or detailed
```

### Monitoring
```yaml
monitoring:
  enabled: true
  interval: 5000           # Collection interval in milliseconds
  retention: 3600000       # Data retention in milliseconds
  metrics:
    prefix: aeimslib       # Metric name prefix
    labels:                # Default labels
      env: development
      service: aeimslib
    types:                 # Metric types to collect
      - device
      - websocket
      - system
  alerts:
    enabled: true
    endpoints: []          # Alert notification endpoints
    thresholds:
      errorRate: 0.1       # 0-1 scale
      latency: 2.0        # Seconds
      deviceErrors: 5      # Count
      connectionDrop: 20   # Percentage
```

### Device Manager
```yaml
deviceManager:
  protocols:              # Supported protocols
    - websocket
  autoReconnect: true
  reconnectInterval: 5000
  maxReconnectAttempts: 5
```

## Environment Variables

The following environment variables can be used to customize the configuration utility:

- `AEIMS_CONFIG_DIR`: Override default config directory
- `AEIMS_CONFIG_FILE`: Override default config filename
- `AEIMS_ENV`: Environment name (development, production, etc.)
- `AEIMS_LOG_LEVEL`: Log level (debug, info, warn, error)

## Examples

### Basic Setup
```bash
# Initial setup with defaults
aeims-config setup

# Verify configuration
aeims-config verify

# Check current settings
aeims-config check --verbose
```

### Advanced Configuration
```bash
# Configure WebSocket settings
aeims-config configure --setting websocket.port --value 9090
aeims-config configure --setting websocket.host --value 0.0.0.0

# Enable encryption
aeims-config configure --setting security.encryption.enabled --value true
aeims-config configure --setting security.encryption.algorithm --value aes-256-gcm

# Configure monitoring
aeims-config configure --setting monitoring.interval --value 1000
aeims-config configure --setting "monitoring.metrics.types[]" --value "device,websocket,system"
```

### Testing
```bash
# Run all tests with detailed output
aeims-config test --verbose

# Test specific component
aeims-config test --test websocket
aeims-config test --test security
```

### Configuration Management
```bash
# Save current config as template
cp ~/.aeims/config.yml ./templates/production.yml

# Install production template
aeims-config install production

# Remove specific setting
aeims-config remove monitoring.alerts.endpoints[0]
```

## Troubleshooting

### Common Issues

1. Configuration Not Found
```bash
# Check if configuration exists
aeims-config check

# Run setup if needed
aeims-config setup --interactive
```

2. Invalid Configuration
```bash
# Verify configuration
aeims-config verify

# Check specific section
aeims-config check --verbose | grep websocket
```

3. Test Failures
```bash
# Run tests with verbose output
aeims-config test --verbose

# Test specific component
aeims-config test --test websocket
```

### Logs

Configuration utility logs are stored in:
- Development: `~/.aeims/logs/config.log`
- Production: `/var/log/aeimslib/config.log`

## Best Practices

1. Version Control
   - Keep configuration templates in version control
   - Document any environment-specific changes

2. Security
   - Never commit sensitive values (use environment variables)
   - Regularly rotate encryption keys and JWT secrets
   - Enable audit logging in production

3. Monitoring
   - Configure appropriate alert thresholds
   - Set up alert notifications
   - Regular health checks

4. Testing
   - Run full verification before deployment
   - Test configuration changes in development first
   - Maintain test configurations
