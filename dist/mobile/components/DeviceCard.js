"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceCard = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
/**
 * Device Card Component
 * Displays device information and controls in a card layout
 */
const DeviceCard = ({ device, onConnect, onDisconnect, onSettings }) => {
    const isConnecting = device.status === 'connecting';
    const hasError = device.status === 'error';
    const renderStatus = () => {
        if (isConnecting) {
            return (<react_native_1.View style={styles.statusContainer}>
          <react_native_1.ActivityIndicator size="small" color="#2196f3"/>
          <react_native_1.Text style={styles.statusText}>Connecting...</react_native_1.Text>
        </react_native_1.View>);
        }
        if (hasError) {
            return (<react_native_1.View style={styles.statusContainer}>
          <react_native_1.View style={[styles.statusDot, styles.errorDot]}/>
          <react_native_1.Text style={[styles.statusText, styles.errorText]}>
            {device.error || 'Error'}
          </react_native_1.Text>
        </react_native_1.View>);
        }
        return (<react_native_1.View style={styles.statusContainer}>
        <react_native_1.View style={[
                styles.statusDot,
                device.connected ? styles.connectedDot : styles.disconnectedDot
            ]}/>
        <react_native_1.Text style={styles.statusText}>
          {device.connected ? 'Connected' : 'Available'}
        </react_native_1.Text>
      </react_native_1.View>);
    };
    return (<react_native_1.View style={styles.container}>
      <react_native_1.View style={styles.header}>
        <react_native_1.View>
          <react_native_1.Text style={styles.name}>{device.name}</react_native_1.Text>
          <react_native_1.Text style={styles.id}>{device.id}</react_native_1.Text>
        </react_native_1.View>
        {onSettings && (<react_native_1.TouchableOpacity onPress={onSettings} style={styles.settingsButton}>
            <react_native_1.Text>⚙️</react_native_1.Text>
          </react_native_1.TouchableOpacity>)}
      </react_native_1.View>

      <react_native_1.View style={styles.infoContainer}>
        {renderStatus()}

        <react_native_1.View style={styles.detailsContainer}>
          {device.rssi !== undefined && (<react_native_1.View style={styles.detail}>
              <react_native_1.Text style={styles.detailLabel}>Signal</react_native_1.Text>
              <react_native_1.Text style={styles.detailValue}>
                {device.rssi} dBm
              </react_native_1.Text>
            </react_native_1.View>)}

          {device.batteryLevel !== undefined && (<react_native_1.View style={styles.detail}>
              <react_native_1.Text style={styles.detailLabel}>Battery</react_native_1.Text>
              <react_native_1.Text style={styles.detailValue}>
                {device.batteryLevel}%
              </react_native_1.Text>
            </react_native_1.View>)}
        </react_native_1.View>
      </react_native_1.View>

      <react_native_1.View style={styles.actionsContainer}>
        {device.connected ? (<react_native_1.TouchableOpacity style={[styles.button, styles.disconnectButton]} onPress={onDisconnect} disabled={isConnecting}>
            <react_native_1.Text style={styles.buttonText}>Disconnect</react_native_1.Text>
          </react_native_1.TouchableOpacity>) : (<react_native_1.TouchableOpacity style={[styles.button, styles.connectButton]} onPress={onConnect} disabled={isConnecting}>
            <react_native_1.Text style={styles.buttonText}>Connect</react_native_1.Text>
          </react_native_1.TouchableOpacity>)}
      </react_native_1.View>
    </react_native_1.View>);
};
exports.DeviceCard = DeviceCard;
const styles = react_native_1.StyleSheet.create({
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
//# sourceMappingURL=DeviceCard.js.map