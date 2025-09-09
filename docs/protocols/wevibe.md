# WeVibe Protocol

## Overview

The WeVibe protocol is used to communicate with WeVibe/WowTech brand devices. It uses Bluetooth Low Energy (BLE) for communication and supports advanced features like touch sensing and multi-motor control.

## Supported Devices

- Chorus
- Melt
- Nova
- Sync
- Vector
- Verge
- Pivot
- Bond
- Jive
- Wand
- Touch
- Wish
- Tango
- Moxie
- Rave

## BLE Services and Characteristics

- Service UUID: `f000bb03-0451-4000-b000-000000000000`
- Command Characteristic: `f000c000-0451-4000-b000-000000000000`
- Touch Characteristic: `f000cc02-0451-4000-b000-000000000000`
- Battery Characteristic: `00002a19-0000-1000-8000-00805f9b34fb` (Standard BLE)

## Command Format

Commands are sent as binary data using 8-byte packets:

```
[0x0f, command_type, external_intensity, internal_intensity, flags, mode, 0x00, 0x00]
```

### Command Types

| Command | Value | Description |
|---------|-------|-------------|
| Vibrate | 0x03 | Control vibration intensity |
| Mode | 0x04 | Set vibration mode |
| Touch | 0x05 | Enable/disable touch sensing |
| Edge | 0x06 | Control edge mode (Chorus only) |
| Power | 0x07 | Low power mode control |

### Basic Commands

1. Vibration
```
[0x0f, 0x03, ext_motor, int_motor, 0x00, 0x00, 0x00, 0x00]
# ext_motor, int_motor = intensity (0-15)
```

2. Stop
```
[0x0f, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
```

3. Mode
```
[0x0f, 0x03, intensity, 0x00, 0x00, mode, 0x00, 0x00]
# mode = 0-9 for different patterns
```

### Touch Sensing

For devices with touch sensors (Nova, Chorus, Touch, Wish):

1. Enable Touch
```
[0x0f, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]
```

2. Touch Data Format
```
[active, pressure, position, 0x00]
# active = 0x01 if touched
# pressure = 0-255
# position = 0-255 along touch surface
```

## Device-Specific Features

### Chorus
- Edge mode control
- Touch sensing
- Dual motor control
- Smart silence mode

### Nova/Rave
- Dual motor vibration
- Touch sensing
- Position tracking
- Pressure sensing

### Vector
- Adjustable vibration patterns
- Position memory
- Dual motor control

## Error Handling

The protocol uses status notifications to indicate errors:

| Code | Description |
|------|-------------|
| 0x00 | Success |
| 0x01 | Invalid command |
| 0x02 | Device error |
| 0x03 | Low battery |
| 0x04 | Connection error |

## Example Usage

```php
use AdultToyLib\Protocols\WeVibeProtocol;

// Initialize device
$device = new WeVibeProtocol($deviceMac, 'Chorus');

// Connect and enable features
$device->connect();

// Set vibration for both motors
$device->vibrate(50, WeVibeProtocol::MOTOR_EXTERNAL);
$device->vibrate(75, WeVibeProtocol::MOTOR_INTERNAL);

// Set vibration mode
$device->setMode(3, 80); // Mode 3 at 80% intensity

// Enable edge mode (Chorus only)
$device->setEdgeMode(true);

// Set pattern
$pattern = [
    [50, 70, 1000],  // External 50%, Internal 70%, 1 second
    [0, 0, 500],     // Both off, 0.5 seconds
    [100, 100, 1000] // Both full, 1 second
];
$device->setPattern($pattern);

// Stop
$device->stop();
```

## Best Practices

1. Identify device model correctly
2. Enable touch sensing only on supported devices
3. Handle dual motor control appropriately
4. Monitor battery status
5. Implement proper error handling
6. Use appropriate intensity ranges (0-15)
7. Handle connection loss gracefully
8. Validate all command parameters
9. Respect device capabilities
10. Implement proper cleanup on disconnect

## Power Management

- Devices support low power mode
- Battery level monitoring via standard BLE service
- Automatic sleep mode after inactivity
- Wake on connection/touch

## Security Features

- BLE pairing required
- Command validation
- Error checking
- Status monitoring
- Safe mode fallback
