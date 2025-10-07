#!/usr/bin/env node

/**
 * AEIMS Device Control Library - Node.js WebSocket Server
 * Simplified rewrite from TypeScript for better integration
 * Handles interactive device control via WebSocket connections
 */

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const winston = require('winston');
require('dotenv').config();

// Configuration
const config = {
  port: process.env.WEBSOCKET_PORT || 8080,
  host: process.env.WEBSOCKET_HOST || '0.0.0.0',
  jwt_secret: process.env.JWT_SECRET || 'fallback_secret',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null
  },
  device: {
    session_timeout: parseInt(process.env.DEVICE_SESSIONS_TIMEOUT) || 300000,
    rate_limit: parseInt(process.env.DEVICE_COMMAND_RATE_LIMIT) || 10,
    max_sessions: parseInt(process.env.DEVICE_MAX_CONCURRENT_SESSIONS) || 100
  }
};

// Ensure log directory exists
const fs = require('fs');
const path = require('path');
const logDir = process.env.LOG_DIR || (process.env.NODE_ENV === 'production' ? '/app/logs' : path.join(__dirname, 'logs'));

// Create log directory if it doesn't exist
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
    console.log(`Created log directory: ${logDir}`);
  }
} catch (error) {
  console.warn(`Failed to create log directory ${logDir}, using console logging only:`, error.message);
  // Fall back to console-only logging if directory creation fails
}

// Logger setup
const logTransports = [
  new winston.transports.Console()
];

// Only add file transport if log directory was successfully created
try {
  if (fs.existsSync(logDir)) {
    logTransports.push(new winston.transports.File({ filename: `${logDir}/aeims-lib.log` }));
  }
} catch (error) {
  console.warn('File logging disabled due to directory issues:', error.message);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: logTransports
});

// Redis client with graceful fallback - disabled in production if REDIS_DISABLE is set
let redis = null;
if (process.env.REDIS_DISABLE !== 'true') {
  try {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false
    });

    redis.on('error', (err) => {
      logger.warn('Redis connection failed, disabling Redis cache', { error: err.message });
      redis.disconnect();
      redis = null;
    });
  } catch (error) {
    logger.warn('Redis initialization failed, running without cache', { error: error.message });
    redis = null;
  }
} else {
  logger.info('Redis disabled via REDIS_DISABLE environment variable');
}

// Device Control Classes
class DeviceManager {
  constructor() {
    this.sessions = new Map();
    this.rateLimits = new Map();
    this.supportedDevices = ['lovense', 'wevibe', 'kiiroo', 'buttplug'];
  }

  createSession(userId, deviceType, metadata = {}) {
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId,
      userId,
      deviceType,
      metadata,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      active: true
    };

    this.sessions.set(sessionId, session);

    // Set session timeout
    setTimeout(() => {
      this.destroySession(sessionId);
    }, config.device.session_timeout);

    logger.info('Device session created', { sessionId, userId, deviceType });
    return session;
  }

  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.active = false;
      this.sessions.delete(sessionId);
      logger.info('Device session destroyed', { sessionId });
    }
  }

  sendCommand(sessionId, command, parameters = {}) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.active) {
      throw new Error('Invalid or inactive session');
    }

    // Rate limiting check
    if (!this.checkRateLimit(session.userId)) {
      throw new Error('Rate limit exceeded');
    }

    // Update last activity
    session.lastActivity = Date.now();

    const deviceCommand = {
      sessionId,
      deviceType: session.deviceType,
      command,
      parameters,
      timestamp: Date.now()
    };

    logger.info('Device command sent', deviceCommand);
    return deviceCommand;
  }

  checkRateLimit(userId) {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    if (!this.rateLimits.has(userId)) {
      this.rateLimits.set(userId, []);
    }

    const requests = this.rateLimits.get(userId);

    // Remove old requests
    const recentRequests = requests.filter(time => time > windowStart);
    this.rateLimits.set(userId, recentRequests);

    // Check if limit exceeded
    if (recentRequests.length >= config.device.rate_limit) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    return true;
  }

  getActiveSessions(userId = null) {
    const sessions = Array.from(this.sessions.values())
      .filter(session => session.active);

    if (userId) {
      return sessions.filter(session => session.userId === userId);
    }

    return sessions;
  }
}

class PatternManager {
  constructor() {
    this.patterns = {
      constant: (intensity) => ({ type: 'constant', intensity }),
      pulse: (intensity, interval = 1000) => ({ type: 'pulse', intensity, interval }),
      wave: (minIntensity, maxIntensity, period = 5000) => ({
        type: 'wave', minIntensity, maxIntensity, period
      }),
      escalation: (startIntensity, endIntensity, duration = 10000) => ({
        type: 'escalation', startIntensity, endIntensity, duration
      })
    };
  }

  createPattern(type, ...args) {
    if (!this.patterns[type]) {
      throw new Error(`Unknown pattern type: ${type}`);
    }
    return this.patterns[type](...args);
  }

  getAvailablePatterns() {
    return Object.keys(this.patterns);
  }
}

// Initialize managers
const deviceManager = new DeviceManager();
const patternManager = new PatternManager();

// Express app for health checks
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    service: 'aeimsLib',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    sessions: deviceManager.getActiveSessions().length,
    uptime: process.uptime()
  };
  res.json(health);
});

app.get('/status', (req, res) => {
  const status = {
    activeSessions: deviceManager.getActiveSessions().length,
    supportedDevices: deviceManager.supportedDevices,
    availablePatterns: patternManager.getAvailablePatterns(),
    redisConnected: redis && redis.status === 'ready'
  };
  res.json(status);
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });

// JWT verification middleware
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt_secret);
  } catch (error) {
    logger.warn('JWT verification failed', { error: error.message });
    return null;
  }
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  logger.info('WebSocket connection received');

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      await handleMessage(ws, message);
    } catch (error) {
      logger.error('Message handling error', { error: error.message });
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { error: error.message });
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to AEIMS Device Control',
    supportedDevices: deviceManager.supportedDevices,
    availablePatterns: patternManager.getAvailablePatterns()
  }));
});

// Message handler
async function handleMessage(ws, message) {
  const { type, token, data } = message;

  // Verify authentication for most operations
  if (type !== 'ping' && type !== 'auth') {
    const decoded = verifyToken(token);
    if (!decoded) {
      return ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication required'
      }));
    }
    message.userId = decoded.userId;
  }

  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'auth':
      const decoded = verifyToken(data.token);
      if (decoded) {
        ws.send(JSON.stringify({
          type: 'auth_success',
          userId: decoded.userId,
          message: 'Authentication successful'
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'auth_failed',
          message: 'Invalid token'
        }));
      }
      break;

    case 'create_session':
      try {
        const session = deviceManager.createSession(
          message.userId,
          data.deviceType,
          data.metadata
        );

        // Store session in Redis if available
        if (redis) {
          try {
            await redis.setex(`session:${session.id}`, 300, JSON.stringify(session));
          } catch (error) {
            logger.warn('Redis session storage failed', { error: error.message });
          }
        }

        ws.send(JSON.stringify({
          type: 'session_created',
          session
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
      break;

    case 'device_command':
      try {
        const command = deviceManager.sendCommand(
          data.sessionId,
          data.command,
          data.parameters
        );

        // Store command in Redis for processing if available
        if (redis) {
          try {
            await redis.lpush('device_commands', JSON.stringify(command));
          } catch (error) {
            logger.warn('Redis command storage failed', { error: error.message });
          }
        }

        ws.send(JSON.stringify({
          type: 'command_sent',
          command
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
      break;

    case 'create_pattern':
      try {
        const pattern = patternManager.createPattern(
          data.patternType,
          ...data.parameters
        );

        ws.send(JSON.stringify({
          type: 'pattern_created',
          pattern
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
      break;

    case 'get_sessions':
      const sessions = deviceManager.getActiveSessions(message.userId);
      ws.send(JSON.stringify({
        type: 'sessions_list',
        sessions
      }));
      break;

    case 'destroy_session':
      deviceManager.destroySession(data.sessionId);
      if (redis) {
        try {
          await redis.del(`session:${data.sessionId}`);
        } catch (error) {
          logger.warn('Redis session cleanup failed', { error: error.message });
        }
      }

      ws.send(JSON.stringify({
        type: 'session_destroyed',
        sessionId: data.sessionId
      }));
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${type}`
      }));
  }
}

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', { error: error.stack });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    redis.disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    redis.disconnect();
    process.exit(0);
  });
});

// Start server
server.listen(config.port, config.host, () => {
  logger.info(`AEIMS Device Control Server running on ${config.host}:${config.port}`);
  logger.info('Configuration', {
    environment: process.env.NODE_ENV || 'development',
    redis_host: config.redis.host,
    max_sessions: config.device.max_sessions,
    supported_devices: deviceManager.supportedDevices
  });
});

module.exports = { deviceManager, patternManager, app, server };