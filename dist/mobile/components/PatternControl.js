"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternControl = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
/**
 * Pattern Control Component
 * Provides interactive pattern control interface with real-time feedback
 */
const PatternControl = ({ pattern, capabilities, onPlay, onPause, onStop, onIntensityChange, onSpeedChange, loading, error }) => {
    const [localIntensity, setLocalIntensity] = (0, react_1.useState)(pattern.intensity);
    const [localSpeed, setLocalSpeed] = (0, react_1.useState)(pattern.speed);
    (0, react_1.useEffect)(() => {
        setLocalIntensity(pattern.intensity);
        setLocalSpeed(pattern.speed);
    }, [pattern.intensity, pattern.speed]);
    const handleIntensityChange = (value) => {
        setLocalIntensity(value);
    };
    const handleIntensityComplete = () => {
        onIntensityChange?.(localIntensity);
    };
    const handleSpeedChange = (value) => {
        setLocalSpeed(value);
    };
    const handleSpeedComplete = () => {
        onSpeedChange?.(localSpeed);
    };
    const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };
    const renderControls = () => {
        if (loading) {
            return (<react_native_1.View style={styles.loadingContainer}>
          <react_native_1.ActivityIndicator size="large" color="#2196f3"/>
          <react_native_1.Text style={styles.loadingText}>Loading pattern...</react_native_1.Text>
        </react_native_1.View>);
        }
        if (error) {
            return (<react_native_1.View style={styles.errorContainer}>
          <react_native_1.Text style={styles.errorText}>{error}</react_native_1.Text>
          <react_native_1.TouchableOpacity style={[styles.button, styles.retryButton]} onPress={onPlay}>
            <react_native_1.Text style={styles.buttonText}>Retry</react_native_1.Text>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>);
        }
        return (<>
        <react_native_1.View style={styles.progressContainer}>
          <react_native_1.Text style={styles.timeText}>
            {formatTime(pattern.progress * pattern.duration)}
          </react_native_1.Text>
          <react_native_1.View style={styles.progressBar}>
            <react_native_1.View style={[
                styles.progressFill,
                { width: `${pattern.progress * 100}%` }
            ]}/>
          </react_native_1.View>
          <react_native_1.Text style={styles.timeText}>
            {formatTime(pattern.duration)}
          </react_native_1.Text>
        </react_native_1.View>

        <react_native_1.View style={styles.playbackControls}>
          <react_native_1.TouchableOpacity style={[styles.button, styles.stopButton]} onPress={onStop}>
            <react_native_1.Text style={styles.buttonText}>⏹</react_native_1.Text>
          </react_native_1.TouchableOpacity>

          <react_native_1.TouchableOpacity style={[styles.button, styles.playButton]} onPress={pattern.playing ? onPause : onPlay}>
            <react_native_1.Text style={styles.buttonText}>
              {pattern.playing ? '⏸' : '▶️'}
            </react_native_1.Text>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>

        {capabilities.supportsIntensity && (<react_native_1.View style={styles.controlContainer}>
            <react_native_1.Text style={styles.label}>Intensity</react_native_1.Text>
            <react_native_1.Slider style={styles.slider} minimumValue={capabilities.minIntensity} maximumValue={capabilities.maxIntensity} value={localIntensity} onValueChange={handleIntensityChange} onSlidingComplete={handleIntensityComplete} minimumTrackTintColor="#2196f3" maximumTrackTintColor="#9e9e9e" thumbTintColor="#2196f3"/>
            <react_native_1.Text style={styles.value}>
              {Math.round(localIntensity * 100)}%
            </react_native_1.Text>
          </react_native_1.View>)}

        {capabilities.supportsSpeed && (<react_native_1.View style={styles.controlContainer}>
            <react_native_1.Text style={styles.label}>Speed</react_native_1.Text>
            <react_native_1.Slider style={styles.slider} minimumValue={capabilities.minSpeed} maximumValue={capabilities.maxSpeed} value={localSpeed} onValueChange={handleSpeedChange} onSlidingComplete={handleSpeedComplete} minimumTrackTintColor="#2196f3" maximumTrackTintColor="#9e9e9e" thumbTintColor="#2196f3"/>
            <react_native_1.Text style={styles.value}>
              {Math.round(localSpeed * 100)}%
            </react_native_1.Text>
          </react_native_1.View>)}
      </>);
    };
    return (<react_native_1.ScrollView style={styles.container}>
      <react_native_1.View style={styles.header}>
        <react_native_1.View>
          <react_native_1.Text style={styles.name}>{pattern.name}</react_native_1.Text>
          <react_native_1.Text style={styles.type}>{pattern.type}</react_native_1.Text>
        </react_native_1.View>
        <react_native_1.View style={styles.status}>
          <react_native_1.View style={[
            styles.statusDot,
            pattern.playing ? styles.playingDot : styles.stoppedDot
        ]}/>
          <react_native_1.Text style={styles.statusText}>
            {pattern.playing ? 'Playing' : 'Stopped'}
          </react_native_1.Text>
        </react_native_1.View>
      </react_native_1.View>

      {renderControls()}
    </react_native_1.ScrollView>);
};
exports.PatternControl = PatternControl;
const styles = react_native_1.StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0'
    },
    name: {
        fontSize: 20,
        fontWeight: '600',
        color: '#000000'
    },
    type: {
        fontSize: 14,
        color: '#666666',
        marginTop: 2
    },
    status: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8
    },
    playingDot: {
        backgroundColor: '#4caf50'
    },
    stoppedDot: {
        backgroundColor: '#9e9e9e'
    },
    statusText: {
        fontSize: 14,
        color: '#000000'
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16
    },
    timeText: {
        fontSize: 14,
        color: '#000000',
        width: 50
    },
    progressBar: {
        flex: 1,
        height: 4,
        backgroundColor: '#e0e0e0',
        borderRadius: 2,
        marginHorizontal: 8,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#2196f3'
    },
    playbackControls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16
    },
    button: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 8
    },
    stopButton: {
        backgroundColor: '#f44336'
    },
    playButton: {
        backgroundColor: '#4caf50'
    },
    retryButton: {
        backgroundColor: '#2196f3',
        paddingHorizontal: 16,
        width: 'auto'
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 18
    },
    controlContainer: {
        padding: 16
    },
    label: {
        fontSize: 14,
        color: '#000000',
        marginBottom: 8
    },
    slider: {
        height: 40
    },
    value: {
        fontSize: 14,
        color: '#666666',
        textAlign: 'center',
        marginTop: 8
    },
    loadingContainer: {
        padding: 32,
        alignItems: 'center'
    },
    loadingText: {
        fontSize: 16,
        color: '#666666',
        marginTop: 16
    },
    errorContainer: {
        padding: 32,
        alignItems: 'center'
    },
    errorText: {
        fontSize: 16,
        color: '#f44336',
        marginBottom: 16,
        textAlign: 'center'
    }
});
//# sourceMappingURL=PatternControl.js.map