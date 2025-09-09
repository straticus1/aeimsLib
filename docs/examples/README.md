# Example Configurations and Usage

## Basic Configuration Examples

### Development Environment
```php
return [
    'database' => [
        'host' => 'localhost',
        'name' => 'atl_dev',
        'user' => 'dev_user',
        'password' => 'dev_password'
    ],
    'display_errors' => true,
    'log' => [
        'path' => __DIR__ . '/logs',
        'level' => 'debug'
    ],
    'websocket' => [
        'port' => 12345,
        'host' => 'localhost'
    ]
];
```

### Production Environment
```php
return [
    'database' => [
        'host' => 'db.production.com',
        'name' => 'atl_prod',
        'user' => 'prod_user',
        'password' => 'secure_password'
    ],
    'display_errors' => false,
    'log' => [
        'path' => '/var/log/atl',
        'level' => 'warning'
    ],
    'websocket' => [
        'port' => 8443,
        'host' => 'ws.production.com',
        'ssl' => true
    ]
];
```

## Usage Examples

### Basic Device Control

```php
use AdultToyLib\Protocols\LovenseProtocol;

// Initialize device
$device = new LovenseProtocol('L1:23:45:67:89:AB');
$device->connect();

// Simple vibration
$device->vibrate(50); // 50% intensity

// Run for 5 seconds then stop
sleep(5);
$device->stop();
```

### Pattern Creation and Use

```php
use AdultToyLib\Patterns\PatternBuilder;

// Create a wave pattern
$pattern = new PatternBuilder()
    ->addStep(20, 1000)   // 20% for 1 second
    ->addStep(80, 1000)   // 80% for 1 second
    ->addStep(50, 2000)   // 50% for 2 seconds
    ->setRepeat(3)        // Repeat 3 times
    ->build();

// Apply pattern to device
$device->setPattern($pattern);
```

### Multi-Device Control

```php
use AdultToyLib\DeviceManager;

// Initialize device manager
$manager = new DeviceManager();

// Add multiple devices
$manager->addDevice('toy1', new LovenseProtocol('L1:23:45:67:89:AB'));
$manager->addDevice('toy2', new WeVibeProtocol('W2:34:56:78:9A:BC'));

// Control all devices
$manager->broadcastPattern([
    'intensity' => 60,
    'duration' => 5000
]);
```

### WebSocket Client

```javascript
// Browser-side code
const ws = new WebSocket('ws://localhost:12345');

ws.onopen = () => {
    console.log('Connected to toy server');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
        case 'toy_status':
            updateToyStatus(data);
            break;
        case 'pattern_complete':
            notifyPatternComplete(data);
            break;
    }
};

// Send command
ws.send(JSON.stringify({
    type: 'command',
    toy_id: '123',
    command: {
        action: 'vibrate',
        intensity: 50
    }
}));
```

### Error Handling

```php
use AdultToyLib\Exceptions\DeviceException;

try {
    $device->connect();
    $device->vibrate(50);
} catch (DeviceException $e) {
    $logger->error('Device error: ' . $e->getMessage(), [
        'device_id' => $device->getId(),
        'error_code' => $e->getCode()
    ]);
    
    // Try to reconnect
    if ($e->getCode() === DeviceException::CONNECTION_LOST) {
        $device->reconnect();
    }
}
```

### Custom Pattern Types

```php
use AdultToyLib\Patterns\CustomPattern;

class PulsePattern extends CustomPattern {
    public function generate() {
        $steps = [];
        for ($i = 0; $i < $this->duration; $i += 2000) {
            $steps[] = [100, 1000]; // Full intensity for 1s
            $steps[] = [0, 1000];   // Off for 1s
        }
        return $steps;
    }
}

// Use custom pattern
$pulse = new PulsePattern([
    'duration' => 10000,
    'intensity_scale' => 0.8
]);

$device->setPattern($pulse);
```

### Database Integration

```php
use AdultToyLib\Database;
use AdultToyLib\Models\Pattern;

// Save pattern to database
$pattern = new Pattern([
    'name' => 'Wave Pattern',
    'type' => 'wave',
    'settings' => [
        'min_intensity' => 20,
        'max_intensity' => 80,
        'frequency' => 1.5
    ],
    'is_public' => true
]);

$db = new Database($config['database']);
$pattern_id = $db->insert('patterns', $pattern->toArray());

// Load and use pattern
$saved_pattern = Pattern::find($pattern_id);
$device->setPattern($saved_pattern);
```

### Advanced Device Features

```php
use AdultToyLib\Protocols\WeVibeProtocol;

// Initialize WeVibe device with touch sensing
$device = new WeVibeProtocol('W1:23:45:67:89:AB', 'Chorus');
$device->connect();

// Enable touch sensing
$device->enableTouch(function($data) {
    if ($data['pressure'] > 200) {
        // Increase intensity based on pressure
        $intensity = min(100, $data['pressure'] / 2.55);
        $device->vibrate($intensity);
    }
});

// Enable edge mode
$device->setEdgeMode(true);

// Set multiple motors
$device->vibrate(60, WeVibeProtocol::MOTOR_EXTERNAL);
$device->vibrate(80, WeVibeProtocol::MOTOR_INTERNAL);
```

### API Integration

```php
use AdultToyLib\API\Client;

// Initialize API client
$client = new Client([
    'api_key' => 'your_api_key',
    'base_url' => 'https://api.example.com'
]);

// Get available toys
$toys = $client->get('/toys');

// Send pattern to specific toy
$client->post('/toys/123/patterns', [
    'pattern' => [
        'type' => 'wave',
        'intensity' => 50,
        'duration' => 5000
    ]
]);

// Get toy status
$status = $client->get('/toys/123/status');
```

### Security Best Practices

```php
use AdultToyLib\Security\Encryption;

// Encrypt sensitive data
$encryptor = new Encryption($config['encryption_key']);

// Store encrypted device info
$encrypted_data = $encryptor->encrypt([
    'device_id' => 'L1:23:45:67:89:AB',
    'api_key' => 'sensitive_key'
]);

// Decrypt when needed
$device_data = $encryptor->decrypt($encrypted_data);

// Secure API calls
$api_client->setHeaders([
    'Authorization' => 'Bearer ' . $api_key,
    'X-Api-Version' => '1.0',
    'X-Client-Id' => $client_id
]);
```
