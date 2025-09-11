"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const DeviceManager_1 = require("./device/DeviceManager");
const WebSocketServer_1 = require("./server/WebSocketServer");
const SecurityService_1 = require("./security/SecurityService");
const MonitoringService_1 = require("./monitoring/MonitoringService");
const Logger_1 = require("./utils/Logger");
// Load environment variables
dotenv_1.default.config();
const logger = Logger_1.Logger.getInstance();
async function bootstrap() {
    try {
        // Initialize core services
        const app = (0, express_1.default)();
        const server = http_1.default.createServer(app);
        const deviceManager = DeviceManager_1.DeviceManager.getInstance();
        const securityService = SecurityService_1.DefaultSecurityService.getInstance();
        // Initialize security
        await securityService.initialize({
            encryption: {
                enabled: process.env.ENCRYPTION_ENABLED === 'true',
                algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
                keySize: parseInt(process.env.ENCRYPTION_KEY_SIZE || '32'),
                authTagLength: parseInt(process.env.ENCRYPTION_AUTH_TAG_LENGTH || '16')
            },
            authentication: {
                type: 'jwt',
                secret: process.env.JWT_SECRET || 'dev_secret_key',
                tokenExpiration: parseInt(process.env.JWT_EXPIRATION || '3600'),
                refreshTokenExpiration: parseInt(process.env.JWT_REFRESH_EXPIRATION || '86400')
            },
            rateLimit: {
                enabled: process.env.RATE_LIMIT_ENABLED === 'true',
                windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
                maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '60'),
                message: 'Too many requests, please try again later.'
            },
            audit: {
                enabled: true,
                retention: parseInt(process.env.AUDIT_RETENTION || '30'),
                detailLevel: (process.env.AUDIT_DETAIL_LEVEL || 'basic')
            }
        });
        // Initialize monitoring
        const monitoringService = MonitoringService_1.DefaultMonitoringService.getInstance(deviceManager);
        await monitoringService.initialize({
            enabled: process.env.MONITORING_ENABLED === 'true',
            interval: parseInt(process.env.MONITORING_INTERVAL || '5000'),
            retention: parseInt(process.env.MONITORING_RETENTION || '3600000'),
            metrics: {
                prefix: process.env.METRICS_PREFIX || 'aeimslib',
                labels: {
                    env: process.env.NODE_ENV || 'development',
                    service: 'aeimslib'
                },
                types: ['device', 'websocket', 'system']
            },
            alerts: {
                enabled: process.env.ALERTS_ENABLED === 'true',
                endpoints: (process.env.ALERT_ENDPOINTS || '').split(',').filter(Boolean),
                thresholds: {
                    errorRate: parseFloat(process.env.ALERT_ERROR_RATE || '0.1'),
                    latency: parseFloat(process.env.ALERT_LATENCY || '2.0'),
                    deviceErrors: parseInt(process.env.ALERT_DEVICE_ERRORS || '5'),
                    connectionDrop: parseInt(process.env.ALERT_CONNECTION_DROP || '20')
                }
            }
        });
        // Initialize WebSocket server
        const wsServer = new WebSocketServer_1.WebSocketServer(server, {
            port: parseInt(process.env.WS_PORT || '8080'),
            host: process.env.WS_HOST || '0.0.0.0',
            path: process.env.WS_PATH || '/ws',
            pingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000'),
            pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '5000'),
            authSecret: process.env.JWT_SECRET || 'dev_secret_key'
        }, deviceManager, securityService, {
            windowMs: parseInt(process.env.WS_RATE_LIMIT_WINDOW || '60000'),
            max: parseInt(process.env.WS_RATE_LIMIT_MAX || '60'),
            message: 'WebSocket rate limit exceeded'
        });
        wsServer.setMonitoringService(monitoringService);
        // Start server
        const port = parseInt(process.env.PORT || '3000');
        server.listen(port, () => {
            logger.info(`AEIMS Lib server listening on port ${port}`);
        });
        // Health check endpoint
        app.get('/health', async (req, res) => {
            const health = await monitoringService.checkHealth();
            res.json(health);
        });
        // Metrics endpoint
        app.get('/metrics', async (req, res) => {
            res.set('Content-Type', 'text/plain');
            res.send('Metrics would be here');
        });
    }
    catch (error) {
        logger.error('Failed to start server', { error });
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=server.js.map