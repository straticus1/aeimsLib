import { DefaultSecurityService } from '../../security/SecurityService';
import { SecurityPolicy, TokenPayload } from '../../interfaces/security';

describe('SecurityService', () => {
  let securityService: DefaultSecurityService;
  const testPolicy: SecurityPolicy = {
    encryption: {
      enabled: true,
      algorithm: 'aes-256-gcm',
      keySize: 32,
      authTagLength: 16
    },
    authentication: {
      type: 'jwt',
      secret: 'test_secret',
      tokenExpiration: 3600,
      refreshTokenExpiration: 86400
    },
    rateLimit: {
      enabled: false,
      windowMs: 60000,
      maxRequests: 100,
      message: 'Too many requests'
    },
    audit: {
      enabled: true,
      retention: 30,
      detailLevel: 'basic'
    }
  };

  beforeEach(async () => {
    securityService = DefaultSecurityService.getInstance();
    await securityService.initialize(testPolicy);
  });

  describe('Token Generation and Verification', () => {
    it('should generate and verify a valid token', async () => {
      const payload: Partial<TokenPayload> = {
        userId: 'test-user',
        deviceId: 'test-device',
        permissions: {
          canControl: true,
          canConfigure: false,
          canMonitor: true,
          allowedPatterns: ['constant'],
          maxIntensity: 100
        }
      };

      const token = await securityService.generateToken(payload);
      expect(token).toBeDefined();

      const verified = await securityService.verifyToken(token);
      expect(verified.userId).toBe(payload.userId);
      expect(verified.deviceId).toBe(payload.deviceId);
      expect(verified.permissions).toEqual(payload.permissions);
    });

    it('should reject an invalid token', async () => {
      await expect(securityService.verifyToken('invalid-token'))
        .rejects
        .toThrow('Invalid token');
    });
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt data', async () => {
      const testData = Buffer.from('test data');
      const encrypted = await securityService.encrypt(testData);
      
      expect(encrypted.data).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.algorithm).toBe(testPolicy.encryption.algorithm);

      const decrypted = await securityService.decrypt(encrypted);
      expect(decrypted.toString()).toBe('test data');
    });
  });

  describe('Permission Validation', () => {
    it('should validate permissions correctly', async () => {
      const context = await securityService.createSecurityContext(
        await securityService.generateToken({
          userId: 'test-user',
          deviceId: 'test-device',
          permissions: {
            canControl: true,
            canConfigure: false,
            canMonitor: true,
            allowedPatterns: ['constant'],
            maxIntensity: 100
          }
        })
      );

      expect(securityService.validatePermissions(context, 'control')).toBe(true);
      expect(securityService.validatePermissions(context, 'configure')).toBe(false);
      expect(securityService.validatePermissions(context, 'monitor')).toBe(true);
    });
  });
});
