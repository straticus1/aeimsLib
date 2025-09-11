 # CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AeimsLib is a comprehensive TypeScript/JavaScript and PHP hybrid library for integrating with various personal device control protocols. It provides a unified interface for managing and controlling Bluetooth LE and network-connected devices through WebSocket communication, with built-in security, monitoring, and configuration management.

## Development Commands

### TypeScript/JavaScript (Primary)
```bash
# Development server with auto-restart
npm run dev

# Build the library
npm run build

# Run tests
npm test
npm run test:watch  # Watch mode for continuous testing

# Linting and formatting
npm run lint
npm run format

# Generate documentation
npm run docs

# Production server
npm start
```

### PHP (Secondary)
```bash
# Run PHP tests
composer test  # or vendor/bin/phpunit

# PHP linting
composer lint  # or vendor/bin/phpcs

# PHP static analysis
composer analyze  # or vendor/bin/phpstan analyze
```

### Single Test Execution
```bash
# Run specific TypeScript test
npm test -- --grep "DeviceManager"
npm test -- src/__tests__/specific-test.test.ts

# Run specific PHP test
vendor/bin/phpunit tests/Integration/FirmwareUpdateIntegrationTest.php
```

## Architecture Overview

### Core Components

- **DeviceManager** (`src/core/DeviceManager.ts`, `src/core/DeviceManager.php`): Central device management and coordination
- **WebSocketServer** (`src/server/WebSocketServer.ts`): Real-time communication layer
- **Pattern System** (`src/patterns/`): Control pattern implementations (Constant, Wave, Pulse, Escalation)
- **Protocol Adapters** (`src/protocols/`, `protocols/`): Device-specific communication protocols
- **Security Services** (`src/security/`): JWT authentication, encryption, rate limiting
- **Monitoring Services** (`src/monitoring/`): Health checks, metrics, alerting

### Key Directories

- `src/core/` - Core system components and device management
- `src/server/` - WebSocket server implementation
- `src/device/` - Device abstraction layer and protocol adapters
- `src/patterns/` - Pattern-based control system
- `src/protocols/` - Protocol-specific implementations
- `src/security/` - Security services and authentication
- `src/monitoring/` - System monitoring and metrics
- `src/xr/` - XR/VR integration components
- `src/mobile/` - Mobile platform support
- `tests/Integration/` - PHP integration tests

### Configuration

The system uses environment-based configuration with `.env` files:

- Copy `.env.example` to `.env` for local development
- Key configuration areas: WebSocket settings, JWT secrets, encryption, rate limiting, monitoring
- Configuration validation and CLI utility available via `aeims-config` command

### Pattern System Architecture

The library implements a pattern-based control system:
- **BasePattern**: Abstract base class for all control patterns
- **PatternFactory**: Factory for creating pattern instances
- **Built-in Patterns**: Constant, Wave, Pulse, Escalation
- **Custom Patterns**: Extensible system for user-defined patterns

### Protocol Architecture

Dual-language protocol support:
- **TypeScript**: Primary implementation in `src/protocols/`
- **PHP**: Secondary implementation in `protocols/` directory
- **Base Classes**: `BaseProtocolAdapter.ts` provides common interface
- **WebSocket Protocol**: Real-time communication layer

### Security Architecture

Multi-layered security implementation:
- **JWT Authentication**: Token-based user authentication
- **AES Encryption**: AES-256-GCM for sensitive data
- **Rate Limiting**: Configurable request throttling
- **Audit Logging**: Comprehensive activity tracking
- **Input Validation**: Request sanitization and validation

## Testing Strategy

### TypeScript Tests
- **Framework**: Jest with ts-jest
- **Location**: `src/__tests__/` and alongside source files
- **Coverage**: 80% threshold (branches, functions, lines, statements)
- **Path Mapping**: `@/` alias maps to `src/`

### PHP Tests
- **Framework**: PHPUnit
- **Location**: `tests/Integration/`
- **Focus**: Integration testing for PHP components

### Environment Setup
- Tests run in Node.js environment for TypeScript
- Separate test configuration in `jest.config.js`
- Coverage reports exclude interface and type definition files

## Development Environment

### Prerequisites
- Node.js (for TypeScript components)
- PHP >= 7.4 (for PHP components)
- Composer (for PHP dependencies)
- Redis (optional, for rate limiting)

### Key Dependencies
- **Runtime**: WebSocket (ws), Express, JWT, Winston logging
- **Development**: TypeScript, Jest, ESLint, Prettier
- **PHP**: Guzzle HTTP, ReactPHP, PHPUnit

### Build Process
- TypeScript compilation target: ES2020
- Module system: CommonJS
- Output directory: `dist/`
- Declaration files generated for library consumption
- Source maps enabled for debugging