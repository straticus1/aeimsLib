# Lovense Protocol

## Overview

The Lovense protocol is used to communicate with Lovense brand devices. It supports both Bluetooth Low Energy (BLE) and cloud API control methods.

## Device Identification

Lovense devices can be identified by their MAC address prefix. The first character of the MAC address indicates the device type:

| Prefix | Device Model |
|--------|-------------|
| A | Ambi |
| C | Calor |
| D | Diamo |
| E | Edge |
| F | Ferri |
| G | Gush |
| H | Hush |
| L | Lush |
| N | Nora |
| M | Max |
| O | Osci |
| P | Pulse |
| S | Solace |
| W | Wearable |
| Z | Domi |

## BLE Services and Characteristics

- Service UUID: `0000fff0-0000-1000-8000-00805f9b34fb`
- TX Characteristic: `0000fff2-0000-1000-8000-00805f9b34fb` (Write commands)
- RX Characteristic: `0000fff1-0000-1000-8000-00805f9b34fb` (Receive notifications)
- Battery Characteristic: `0000fff7-0000-1000-8000-00805f9b34fb`

## Command Format

Commands are sent in plain text with the following format:
```
Command:Param1;
```

### Basic Commands

1. Vibration
```
Vibrate:X;  # X = intensity (0-20)
```

2. Stop
```
Vibrate:0;
```

3. Pattern
```
Pattern:VX:TY;  # X = intensity (0-20), Y = duration (ms)
```

4. Battery Level Request
```
Battery;
```

### Advanced Commands

1. Rotation (Nora)
```
Rotate:X;  # X = speed (0-20)
```

2. Air Pump (Max)
```
Air:LevelX;  # X = level (0-5)
```

3. Multiple Motors (Edge)
```
Vibrate1:X;  # X = intensity for first motor (0-20)
Vibrate2:X;  # X = intensity for second motor (0-20)
```

## Cloud API

The Lovense Cloud API provides remote control capabilities.

### Base URL
```
https://api.lovense.com/api/lan/
```

### Authentication
```
Authorization: Bearer YOUR_TOKEN
```

### Endpoints

1. Device Control
```
POST /command
{
    "token": "your_token",
    "uid": "user_id",
    "command": "Function:Action",
    "action": "Vibrate",
    "strength": 20,
    "duration": 1000
}
```

2. Device Status
```
GET /status
```

## Error Handling

The protocol provides error codes in the response:

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Invalid command |
| 401 | Unauthorized |
| 404 | Device not found |
| 500 | Device error |

## Example Usage

```php
use AdultToyLib\Protocols\LovenseProtocol;

// Initialize device
$device = new LovenseProtocol($deviceMac, $apiKey);

// Connect
$device->connect();

// Set vibration
$device->vibrate(50); // 50% intensity

// Set pattern
$pattern = [
    [50, 1000],  // 50% intensity for 1 second
    [0, 500],    // Off for 0.5 seconds
    [100, 1000]  // 100% intensity for 1 second
];
$device->setPattern($pattern);

// Stop
$device->stop();
```

## Best Practices

1. Always initialize device with proper handshake
2. Handle connection loss gracefully
3. Implement proper error handling
4. Close connection when done
5. Monitor battery level
6. Respect rate limits for cloud API
7. Store API keys securely
8. Implement timeout handling
9. Support both local and remote control
10. Validate all input parameters
