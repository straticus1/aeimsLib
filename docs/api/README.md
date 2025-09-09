# API Documentation

## Overview

The Adult Toy Library provides a RESTful API for managing and controlling adult toys. The API supports device management, pattern creation/sharing, and real-time control features.

## Base URL

```
/api
```

## Authentication

API requests must include an authentication token in the header:

```
Authorization: Bearer YOUR_TOKEN
```

## Endpoints

### Device Management

#### List Toys
```
GET /toys

Response:
{
    "toys": [
        {
            "id": "123",
            "name": "My Toy",
            "manufacturer": "Lovense",
            "model": "Lush",
            "device_id": "L45F21",
            "status": "connected"
        }
    ]
}
```

#### Add Toy
```
POST /toys

Request:
{
    "name": "My Toy",
    "manufacturer": "WeVibe",
    "model": "Nova",
    "device_id": "WV789",
    "connection_type": "bluetooth"
}

Response:
{
    "id": "124",
    "name": "My Toy",
    "status": "added"
}
```

#### Get Toy Status
```
GET /toys/{id}/status

Response:
{
    "id": "123",
    "status": "connected",
    "battery": 80,
    "last_active": "2025-09-09T09:13:04Z"
}
```

#### Delete Toy
```
DELETE /toys/{id}

Response:
{
    "message": "Toy deleted successfully"
}
```

### Pattern Management

#### List Patterns
```
GET /patterns

Response:
{
    "patterns": [
        {
            "id": "456",
            "name": "Pulse Pattern",
            "description": "Alternating pulse pattern",
            "type": "pulse",
            "is_public": true,
            "rating": 4.5
        }
    ]
}
```

#### Create Pattern
```
POST /patterns

Request:
{
    "name": "Wave Pattern",
    "description": "Smooth wave pattern",
    "type": "wave",
    "settings": {
        "intensity": 50,
        "frequency": 1.5
    },
    "is_public": true
}

Response:
{
    "id": "457",
    "name": "Wave Pattern",
    "status": "created"
}
```

#### Use Pattern
```
POST /patterns/{id}/use/{toyId}

Response:
{
    "status": "pattern_applied"
}
```

#### Delete Pattern
```
DELETE /patterns/{id}

Response:
{
    "message": "Pattern deleted successfully"
}
```

### Device Control

#### Send Command
```
POST /control/{toyId}

Request:
{
    "intensity": 50,
    "mode": "wave",
    "duration": 5000
}

Response:
{
    "status": "command_sent"
}
```

#### Stop Device
```
POST /control/{toyId}/stop

Response:
{
    "status": "stopped"
}
```

### Device Testing

#### Run Test
```
POST /toys/{id}/test/{type}

Response:
{
    "steps": [
        {
            "status": "passed",
            "message": "Connection successful"
        },
        {
            "status": "passed",
            "message": "Motor response verified"
        }
    ]
}
```

## WebSocket API

The library also provides a WebSocket API for real-time control and status updates.

### Connection
```
ws://your-server:12345
```

### Message Types

#### Device Status Update
```json
{
    "type": "toy_status",
    "device_id": "123",
    "status": "connected",
    "battery": 80
}
```

#### Pattern Complete
```json
{
    "type": "pattern_complete",
    "pattern_id": "456",
    "device_id": "123"
}
```

#### Error
```json
{
    "type": "error",
    "message": "Device disconnected"
}
```

## Error Handling

The API uses standard HTTP status codes and returns detailed error messages:

```json
{
    "error": "Device not found",
    "code": 404,
    "details": {
        "device_id": "123"
    }
}
```

Common status codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 404: Not Found
- 500: Server Error

## Rate Limiting

API requests are limited to:
- 60 requests per minute per IP
- 1000 requests per hour per user
- WebSocket messages: 10 per second

## Security

- All HTTP endpoints use HTTPS
- WebSocket connections use WSS
- API keys must be kept secret
- Supports CORS for web clients
- Input validation on all endpoints
- Sanitization of all outputs
- No sensitive data in logs

## Best Practices

1. Use appropriate error handling
2. Implement retry logic
3. Handle connection loss gracefully
4. Monitor API limits
5. Use secure connections
6. Validate all inputs
7. Handle timeouts appropriately
8. Keep API keys secure
9. Log API usage responsibly
10. Update patterns in batches
