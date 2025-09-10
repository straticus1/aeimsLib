import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';

interface DeviceCardProps {
  device: {
    id: string;
    name: string;
    connected: boolean;
    rssi?: number;
    batteryLevel?: number;
    status?: 'available' | 'connecting' | 'error';
    error?: string;
  };
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSettings?: () => void;
}

/**
 * Device Card Component
 * Displays device information and controls in a card layout
 */
export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onConnect,
  onDisconnect,
  onSettings
}) => {
  const isConnecting = device.status === 'connecting';
  const hasError = device.status === 'error';

  const renderStatus = () => {
    if (isConnecting) {
      return (
        <View style={styles.statusContainer}>
          <ActivityIndicator size="small" color="#2196f3" />
          <Text style={styles.statusText}>Connecting...</Text>
        </View>
      );
    }

    if (hasError) {
      return (
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, styles.errorDot]} />
          <Text style={[styles.statusText, styles.errorText]}>
            {device.error || 'Error'}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.statusContainer}>
        <View
          style={[
            styles.statusDot,
            device.connected ? styles.connectedDot : styles.disconnectedDot
          ]}
        />
        <Text style={styles.statusText}>
          {device.connected ? 'Connected' : 'Available'}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{device.name}</Text>
          <Text style={styles.id}>{device.id}</Text>
        </View>
        {onSettings && (
          <TouchableOpacity
            onPress={onSettings}
            style={styles.settingsButton}
          >
            <Text>⚙️</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoContainer}>
        {renderStatus()}

        <View style={styles.detailsContainer}>
          {device.rssi !== undefined && (
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Signal</Text>
              <Text style={styles.detailValue}>
                {device.rssi} dBm
              </Text>
            </View>
          )}

          {device.batteryLevel !== undefined && (
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Battery</Text>
              <Text style={styles.detailValue}>
                {device.batteryLevel}%
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.actionsContainer}>
        {device.connected ? (
          <TouchableOpacity
            style={[styles.button, styles.disconnectButton]}
            onPress={onDisconnect}
            disabled={isConnecting}
          >
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.connectButton]}
            onPress={onConnect}
            disabled={isConnecting}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000'
  },
  id: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2
  },
  settingsButton: {
    padding: 8
  },
  infoContainer: {
    marginBottom: 16
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8
  },
  connectedDot: {
    backgroundColor: '#4caf50'
  },
  disconnectedDot: {
    backgroundColor: '#9e9e9e'
  },
  errorDot: {
    backgroundColor: '#f44336'
  },
  statusText: {
    fontSize: 14,
    color: '#000000'
  },
  errorText: {
    color: '#f44336'
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  detail: {
    alignItems: 'center'
  },
  detailLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4
  },
  detailValue: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500'
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center'
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center'
  },
  connectButton: {
    backgroundColor: '#2196f3'
  },
  disconnectButton: {
    backgroundColor: '#f44336'
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500'
  }
});
