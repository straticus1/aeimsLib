import { DeviceAuthenticationService } from '../DeviceAuthenticationService';
import { Permissions, SecurityEventType } from '../../interfaces/security';

describe('DeviceAuthenticationService', () => {
  let authService: DeviceAuthenticationService;
  let mockPermissions: Permissions;

  beforeEach(() => {
    authService = DeviceAuthenticationService.getInstance();
    authService.updateConfig({
      secret: 'test_secret_key_for_testing_purposes_only',
      type: 'jwt',
      tokenExpiration: 3600
    });

    mockPermissions = {
      canControl: true,
      canConfigure: true,
      canMonitor: true,
      allowedPatterns: ['constant', 'wave', 'pulse'],
      maxIntensity: 100
    };
  });

  test('should be a singleton', () => {
    const instance1 = DeviceAuthenticationService.getInstance();
    const instance2 = DeviceAuthenticationService.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should generate valid device tokens', async () => {
    const userId = 'test_user_1';
    const deviceId = 'test_device_1';

    const token = await authService.generateDeviceToken(
      userId,
      deviceId,
      mockPermissions
    );

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  test('should validate device tokens', async () => {
    const userId = 'test_user_2';
    const deviceId = 'test_device_2';

    const token = await authService.generateDeviceToken(
      userId,
      deviceId,
      mockPermissions
    );

    const context = await authService.validateDeviceToken(token);

    expect(context).toBeDefined();
    expect(context.userId).toBe(userId);
    expect(context.deviceId).toBe(deviceId);
    expect(context.authenticated).toBe(true);
    expect(context.permissions).toEqual(mockPermissions);
  });

  test('should reject invalid tokens', async () => {
    await expect(authService.validateDeviceToken('invalid_token'))
      .rejects.toThrow();
  });

  test('should handle token revocation', async () => {
    const userId = 'test_user_3';
    const deviceId = 'test_device_3';

    const token = await authService.generateDeviceToken(
      userId,
      deviceId,
      mockPermissions
    );

    // Token should be valid initially
    await expect(authService.validateDeviceToken(token))
      .resolves.toBeDefined();

    // Revoke token
    await authService.revokeDeviceToken(token);

    // Token should now be invalid
    await expect(authService.validateDeviceToken(token))
      .rejects.toThrow('Token has been revoked');
  });

  test('should validate permissions correctly', async () => {
    const userId = 'test_user_4';
    const deviceId = 'test_device_4';

    const token = await authService.generateDeviceToken(
      userId,
      deviceId,
      mockPermissions
    );

    const context = await authService.validateDeviceToken(token);

    // Check valid permissions
    expect(authService.validatePermissions(context, ['control'])).toBe(true);
    expect(authService.validatePermissions(context, ['control', 'monitor'])).toBe(true);

    // Check invalid permissions
    expect(authService.validatePermissions(context, ['invalid_permission'])).toBe(false);
  });

  test('should handle expired tokens', async () => {
    const userId = 'test_user_5';
    const deviceId = 'test_device_5';

    // Set very short expiration
    authService.updateConfig({ tokenExpiration: 1 });

    const token = await authService.generateDeviceToken(
      userId,
      deviceId,
      mockPermissions
    );

    // Wait for token to expire
    await new Promise(resolve => setTimeout(resolve, 1500));

    await expect(authService.validateDeviceToken(token))
      .rejects.toThrow();

    // Reset expiration
    authService.updateConfig({ tokenExpiration: 3600 });
  });

  test('should handle missing configuration', async () => {
    const userId = 'test_user_6';
    const deviceId = 'test_device_6';

    // Remove secret
    authService.updateConfig({ secret: undefined });

    await expect(authService.generateDeviceToken(
      userId,
      deviceId,
      mockPermissions
    )).rejects.toThrow('Authentication secret not configured');

    // Restore secret
    authService.updateConfig({
      secret: 'test_secret_key_for_testing_purposes_only'
    });
  });

  test('should handle token blacklist cleanup', async () => {
    const userId = 'test_user_7';
    const deviceId = 'test_device_7';

    // Generate and revoke multiple tokens
    const tokens = await Promise.all(
      Array(100).fill(null).map(async () => {
        return await authService.generateDeviceToken(
          userId,
          deviceId,
          mockPermissions
        );
      })
    );

    await Promise.all(tokens.map(token => authService.revokeDeviceToken(token)));

    // All tokens should be invalid
    await Promise.all(tokens.map(async token => {
      await expect(authService.validateDeviceToken(token))
        .rejects.toThrow('Token has been revoked');
    }));
  });

  test('should update configuration', () => {
    const originalConfig = authService.getConfig();
    
    const newConfig = {
      type: 'oauth2' as const,
      tokenExpiration: 7200,
      refreshTokenExpiration: 604800
    };

    authService.updateConfig(newConfig);
    expect(authService.getConfig()).toEqual({
      ...originalConfig,
      ...newConfig
    });

    // Reset config
    authService.updateConfig(originalConfig);
  });

  test('should validate permissions based on time restrictions', async () => {
    const userId = 'test_user_8';
    const deviceId = 'test_device_8';

    const restrictedPermissions: Permissions = {
      ...mockPermissions,
      timeRestrictions: {
        start: '09:00',
        end: '17:00',
        timezone: 'UTC'
      }
    };

    const token = await authService.generateDeviceToken(
      userId,
      deviceId,
      restrictedPermissions
    );

    const context = await authService.validateDeviceToken(token);
    expect(context.permissions.timeRestrictions).toBeDefined();
  });
});
