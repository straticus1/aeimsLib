import { Router } from 'express';
import { DeviceManager } from '../DeviceManager';
import { Pattern } from '../../patterns/Pattern';
import { createExperimentalDevice } from '../experimental';
import { DeviceMonitoring } from '../../monitoring';

const router = Router();

/**
 * Device Discovery and Management
 */

// Get all available devices
router.get('/devices', (req, res) => {
  const manager = DeviceManager.getInstance();
  const devices = manager.getDevices();
  
  res.json({
    devices: devices.map(d => ({
      id: d.info.id,
      name: d.info.name,
      type: d.info.type,
      connected: d.isConnected()
    }))
  });
});

// Search for devices
router.post('/devices/search', async (req, res) => {
  const manager = DeviceManager.getInstance();
  const { type, timeout = 5000 } = req.body;

  try {
    const devices = await manager.searchDevices(type, timeout);
    res.json({ devices });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to search for devices',
      details: error.message
    });
  }
});

// Connect to a device
router.post('/devices/:deviceId/connect', async (req, res) => {
  const manager = DeviceManager.getInstance();
  const { deviceId } = req.params;
  const { type, options } = req.body;

  try {
    let device = manager.getDevice(deviceId);
    
    if (!device) {
      // Try to create device if not found
      if (type) {
        device = await createExperimentalDevice(type, { id: deviceId }, options);
        manager.addDevice(device);
      } else {
        throw new Error('Device type required for new devices');
      }
    }

    await device.connect();
    res.json({
      status: 'connected',
      device: {
        id: device.info.id,
        name: device.info.name,
        type: device.info.type
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to connect device',
      details: error.message
    });
  }
});

// Disconnect a device
router.post('/devices/:deviceId/disconnect', async (req, res) => {
  const manager = DeviceManager.getInstance();
  const { deviceId } = req.params;

  try {
    const device = manager.getDevice(deviceId);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    await device.disconnect();
    res.json({ status: 'disconnected' });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to disconnect device',
      details: error.message
    });
  }
});

/**
 * Device Control
 */

// Send command to device
router.post('/devices/:deviceId/command', async (req, res) => {
  const manager = DeviceManager.getInstance();
  const { deviceId } = req.params;
  const { type, params } = req.body;

  try {
    const device = manager.getDevice(deviceId);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const monitor = new DeviceMonitoring(deviceId);
    monitor.onCommandStart(type);

    const startTime = Date.now();
    await device.sendCommand({ type, params });
    const duration = Date.now() - startTime;

    monitor.onCommandComplete(type, duration, true);
    res.json({ status: 'success' });
  } catch (error) {
    const monitor = new DeviceMonitoring(deviceId);
    monitor.onError(error, { command: type, params });
    
    res.status(500).json({
      error: 'Command failed',
      details: error.message
    });
  }
});

// Start pattern
router.post('/devices/:deviceId/pattern/start', async (req, res) => {
  const manager = DeviceManager.getInstance();
  const { deviceId } = req.params;
  const { pattern, options } = req.body;

  try {
    const device = manager.getDevice(deviceId);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const patternInstance = new Pattern(pattern);
    await manager.startPattern(device, patternInstance, options);

    const monitor = new DeviceMonitoring(deviceId);
    monitor.onPatternUsage(patternInstance.id, 'start', options);

    res.json({ status: 'pattern_started' });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start pattern',
      details: error.message
    });
  }
});

// Stop pattern
router.post('/devices/:deviceId/pattern/stop', async (req, res) => {
  const manager = DeviceManager.getInstance();
  const { deviceId } = req.params;

  try {
    const device = manager.getDevice(deviceId);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const pattern = manager.getActivePattern(device);
    if (pattern) {
      await manager.stopPattern(device);
      
      const monitor = new DeviceMonitoring(deviceId);
      monitor.onPatternUsage(pattern.id, 'stop');
    }

    res.json({ status: 'pattern_stopped' });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop pattern',
      details: error.message
    });
  }
});

// Modify running pattern
router.post('/devices/:deviceId/pattern/modify', async (req, res) => {
  const manager = DeviceManager.getInstance();
  const { deviceId } = req.params;
  const { intensity, speed, params } = req.body;

  try {
    const device = manager.getDevice(deviceId);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const pattern = manager.getActivePattern(device);
    if (!pattern) {
      res.status(400).json({ error: 'No active pattern' });
      return;
    }

    await manager.modifyPattern(device, { intensity, speed, ...params });

    const monitor = new DeviceMonitoring(deviceId);
    monitor.onPatternUsage(pattern.id, 'modify', { intensity, speed, ...params });

    res.json({ status: 'pattern_modified' });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to modify pattern',
      details: error.message
    });
  }
});

/**
 * Device Status
 */

// Get device status
router.get('/devices/:deviceId/status', (req, res) => {
  const manager = DeviceManager.getInstance();
  const { deviceId } = req.params;

  try {
    const device = manager.getDevice(deviceId);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const pattern = manager.getActivePattern(device);
    const monitor = new DeviceMonitoring(deviceId);
    const stats = monitor.getDeviceStats();

    res.json({
      id: device.info.id,
      name: device.info.name,
      type: device.info.type,
      connected: device.isConnected(),
      activePattern: pattern ? {
        id: pattern.id,
        type: pattern.type,
        running: true
      } : null,
      stats: stats || {}
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get device status',
      details: error.message
    });
  }
});

// Get device metrics
router.get('/devices/:deviceId/metrics', (req, res) => {
  const { deviceId } = req.params;
  const monitor = new DeviceMonitoring(deviceId);
  const stats = monitor.getDeviceStats();

  if (!stats) {
    res.status(404).json({ error: 'No metrics found for device' });
    return;
  }

  res.json(stats);
});

export default router;
