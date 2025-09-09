import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Schema for WebSocket configuration
const websocketSchema = {
  type: 'object',
  required: ['port', 'host', 'path'],
  properties: {
    port: { type: 'number', minimum: 1, maximum: 65535 },
    host: { type: 'string' },
    path: { type: 'string', pattern: '^/' },
    pingInterval: { type: 'number', minimum: 100 },
    pingTimeout: { type: 'number', minimum: 100 }
  }
};

// Schema for security configuration
const securitySchema = {
  type: 'object',
  required: ['encryption', 'authentication', 'rateLimit'],
  properties: {
    encryption: {
      type: 'object',
      required: ['enabled', 'algorithm'],
      properties: {
        enabled: { type: 'boolean' },
        algorithm: { type: 'string', enum: ['aes-256-gcm', 'aes-256-cbc'] },
        keySize: { type: 'number', enum: [16, 24, 32] },
        authTagLength: { type: 'number', enum: [8, 12, 16] }
      }
    },
    authentication: {
      type: 'object',
      required: ['type', 'tokenExpiration'],
      properties: {
        type: { type: 'string', enum: ['jwt', 'oauth2', 'basic'] },
        secret: { type: 'string' },
        publicKey: { type: 'string' },
        privateKey: { type: 'string' },
        tokenExpiration: { type: 'number', minimum: 60 },
        refreshTokenExpiration: { type: 'number', minimum: 60 }
      }
    },
    rateLimit: {
      type: 'object',
      required: ['enabled', 'windowMs', 'maxRequests'],
      properties: {
        enabled: { type: 'boolean' },
        windowMs: { type: 'number', minimum: 1000 },
        maxRequests: { type: 'number', minimum: 1 },
        message: { type: 'string' }
      }
    },
    audit: {
      type: 'object',
      required: ['enabled', 'retention'],
      properties: {
        enabled: { type: 'boolean' },
        retention: { type: 'number', minimum: 1 },
        detailLevel: { type: 'string', enum: ['basic', 'detailed'] }
      }
    }
  }
};

// Schema for monitoring configuration
const monitoringSchema = {
  type: 'object',
  required: ['enabled', 'metrics'],
  properties: {
    enabled: { type: 'boolean' },
    interval: { type: 'number', minimum: 100 },
    retention: { type: 'number', minimum: 3600 },
    metrics: {
      type: 'object',
      required: ['prefix', 'types'],
      properties: {
        prefix: { type: 'string' },
        labels: {
          type: 'object',
          patternProperties: {
            '^.*$': { type: 'string' }
          }
        },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['device', 'websocket', 'system'] },
          minItems: 1
        }
      }
    },
    alerts: {
      type: 'object',
      required: ['enabled', 'thresholds'],
      properties: {
        enabled: { type: 'boolean' },
        endpoints: {
          type: 'array',
          items: { type: 'string', format: 'uri' }
        },
        thresholds: {
          type: 'object',
          properties: {
            errorRate: { type: 'number', minimum: 0, maximum: 1 },
            latency: { type: 'number', minimum: 0 },
            deviceErrors: { type: 'number', minimum: 0 },
            connectionDrop: { type: 'number', minimum: 0 }
          }
        }
      }
    }
  }
};

// Schema for device manager configuration
const deviceManagerSchema = {
  type: 'object',
  required: ['protocols'],
  properties: {
    protocols: {
      type: 'array',
      items: { type: 'string', enum: ['websocket', 'bluetooth', 'serial'] },
      minItems: 1
    },
    autoReconnect: { type: 'boolean' },
    reconnectInterval: { type: 'number', minimum: 100 },
    maxReconnectAttempts: { type: 'number', minimum: 1 }
  }
};

// Main configuration schema
const configSchema = {
  type: 'object',
  required: ['websocket', 'security', 'monitoring', 'deviceManager'],
  properties: {
    websocket: websocketSchema,
    security: securitySchema,
    monitoring: monitoringSchema,
    deviceManager: deviceManagerSchema
  }
};

const validateConfig = ajv.compile(configSchema);

export async function validate(config: any): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const valid = validateConfig(config);

  if (valid) {
    return {
      valid: true,
      issues: []
    };
  }

  return {
    valid: false,
    issues: (validateConfig.errors || []).map(error => {
      const path = error.instancePath.replace(/^\//, '');
      switch (error.keyword) {
        case 'required':
          return `Missing required field: ${path ? path + '.' : ''}${error.params.missingProperty}`;
        case 'type':
          return `Invalid type for ${path}: expected ${error.params.type}`;
        case 'enum':
          return `Invalid value for ${path}: must be one of [${error.params.allowedValues.join(', ')}]`;
        case 'minimum':
          return `Invalid value for ${path}: must be at least ${error.params.limit}`;
        case 'maximum':
          return `Invalid value for ${path}: must be at most ${error.params.limit}`;
        case 'minItems':
          return `Invalid array length for ${path}: must contain at least ${error.params.limit} items`;
        case 'pattern':
          return `Invalid format for ${path}: must match pattern ${error.params.pattern}`;
        case 'format':
          return `Invalid format for ${path}: must be a valid ${error.params.format}`;
        default:
          return `Validation error for ${path}: ${error.message}`;
      }
    })
  };
}

export function isValidConfig(config: any): boolean {
  return validateConfig(config) as boolean;
}
