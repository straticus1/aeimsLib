# Installation Guide

## Requirements

- PHP 7.4 or later
- MySQL 5.7 or later
- Bluetooth Low Energy (BLE) support
- OpenSSL
- PDO PHP extension
- Composer

### Optional Requirements
- WebSocket support for real-time features
- `bluez` tools for Linux systems
- PHP FFI extension for advanced BLE support

## Basic Installation

1. Install via Composer:
```bash
composer require adultToyLib/atl
```

2. Create configuration file:
```bash
cp config.example.php config.php
```

3. Update configuration with your settings:
```php
return [
    'database' => [
        'host' => 'localhost',
        'name' => 'your_database',
        'user' => 'your_user',
        'password' => 'your_password'
    ],
    // Add your API keys
    'lovense_api_key' => 'your_key',
    'wevibe_api_key' => 'your_key',
    'kiiroo_api_key' => 'your_key'
];
```

4. Create database schema:
```bash
mysql -u your_user -p your_database < schema.sql
```

5. Set up directory permissions:
```bash
chmod -R 755 .
chmod -R 777 logs
```

## Platform-Specific Setup

### Linux

1. Install BLE dependencies:
```bash
sudo apt-get install bluez bluez-tools
```

2. Give BLE permissions to PHP:
```bash
sudo setcap 'cap_net_raw,cap_net_admin+eip' $(which php)
```

3. Install WebSocket dependencies:
```bash
sudo apt-get install php-pcntl php-posix
```

### macOS

1. Install Homebrew if not already installed:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Install dependencies:
```bash
brew install php@7.4 mysql bluez
```

3. Start services:
```bash
brew services start mysql
```

### Windows

1. Enable Bluetooth services:
```powershell
Set-Service -Name "BTAGService" -StartupType Automatic
Start-Service "BTAGService"
```

2. Install PHP dependencies:
```powershell
composer require ext-sockets ext-pcntl
```

## WebSocket Server Setup

1. Install ReactPHP dependencies:
```bash
composer require react/socket react/event-loop
```

2. Start WebSocket server:
```bash
php websocket_server.php
```

3. Configure WebSocket settings in `config.php`:
```php
'websocket' => [
    'port' => 12345,
    'ping_interval' => 30,
    'max_connections' => 100
]
```

## Security Configuration

1. Set up SSL certificates:
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/private.key -out ssl/certificate.pem
```

2. Configure secure connections in `config.php`:
```php
'security' => [
    'ssl_certificate' => '/path/to/certificate.pem',
    'ssl_key' => '/path/to/private.key',
    'cors_allowed_origins' => ['https://your-domain.com']
]
```

## Logging Configuration

1. Configure log settings in `config.php`:
```php
'log' => [
    'path' => __DIR__ . '/logs',
    'level' => 'debug',
    'max_files' => 5,
    'max_size' => '10M'
]
```

2. Create log directory:
```bash
mkdir logs
chmod 777 logs
```

## Testing Installation

1. Run database connection test:
```bash
php vendor/bin/phpunit tests/DatabaseTest.php
```

2. Test BLE functionality:
```bash
php vendor/bin/phpunit tests/BLETest.php
```

3. Verify WebSocket server:
```bash
php vendor/bin/phpunit tests/WebSocketTest.php
```

## Troubleshooting

### Common Issues

1. BLE Connection Failures
```bash
# Check BLE service status
sudo systemctl status bluetooth

# Verify BLE device visibility
sudo hcitool lescan
```

2. Database Connection Issues
```bash
# Test MySQL connection
mysql -u your_user -p -h localhost

# Check PHP PDO extension
php -m | grep pdo
```

3. WebSocket Server Problems
```bash
# Check port availability
netstat -an | grep 12345

# Verify PHP extensions
php -m | grep socket
```

### Logs

Check logs for detailed error information:
```bash
tail -f logs/app.log
tail -f logs/error.log
```

## Updating

1. Update via Composer:
```bash
composer update adultToyLib/atl
```

2. Update database schema:
```bash
mysql -u your_user -p your_database < updates/latest.sql
```

3. Clear cache:
```bash
php artisan cache:clear
```

## Support

For issues and support:
- Submit issues on GitHub
- Check documentation
- Run diagnostic tests:
```bash
php vendor/bin/phpunit --testsuite=diagnostic
```
