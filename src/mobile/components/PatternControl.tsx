import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Slider,
  ScrollView,
  ActivityIndicator
} from 'react-native';

interface PatternControlProps {
  // Pattern info
  pattern: {
    id: string;
    name: string;
    type: string;
    duration: number;
    intensity: number;
    speed: number;
    playing: boolean;
    progress: number;
  };
  // Capabilities
  capabilities: {
    minIntensity: number;
    maxIntensity: number;
    minSpeed: number;
    maxSpeed: number;
    supportsSpeed: boolean;
    supportsIntensity: boolean;
  };
  // Actions
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onIntensityChange?: (value: number) => void;
  onSpeedChange?: (value: number) => void;
  // Optional props
  loading?: boolean;
  error?: string;
}

/**
 * Pattern Control Component
 * Provides interactive pattern control interface with real-time feedback
 */
export const PatternControl: React.FC<PatternControlProps> = ({
  pattern,
  capabilities,
  onPlay,
  onPause,
  onStop,
  onIntensityChange,
  onSpeedChange,
  loading,
  error
}) => {
  const [localIntensity, setLocalIntensity] = useState(pattern.intensity);
  const [localSpeed, setLocalSpeed] = useState(pattern.speed);

  useEffect(() => {
    setLocalIntensity(pattern.intensity);
    setLocalSpeed(pattern.speed);
  }, [pattern.intensity, pattern.speed]);

  const handleIntensityChange = (value: number) => {
    setLocalIntensity(value);
  };

  const handleIntensityComplete = () => {
    onIntensityChange?.(localIntensity);
  };

  const handleSpeedChange = (value: number) => {
    setLocalSpeed(value);
  };

  const handleSpeedComplete = () => {
    onSpeedChange?.(localSpeed);
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const renderControls = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196f3" />
          <Text style={styles.loadingText}>Loading pattern...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.button, styles.retryButton]}
            onPress={onPlay}
          >
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        <View style={styles.progressContainer}>
          <Text style={styles.timeText}>
            {formatTime(pattern.progress * pattern.duration)}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${pattern.progress * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.timeText}>
            {formatTime(pattern.duration)}
          </Text>
        </View>

        <View style={styles.playbackControls}>
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={onStop}
          >
            <Text style={styles.buttonText}>⏹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.playButton]}
            onPress={pattern.playing ? onPause : onPlay}
          >
            <Text style={styles.buttonText}>
              {pattern.playing ? '⏸' : '▶️'}
            </Text>
          </TouchableOpacity>
        </View>

        {capabilities.supportsIntensity && (
          <View style={styles.controlContainer}>
            <Text style={styles.label}>Intensity</Text>
            <Slider
              style={styles.slider}
              minimumValue={capabilities.minIntensity}
              maximumValue={capabilities.maxIntensity}
              value={localIntensity}
              onValueChange={handleIntensityChange}
              onSlidingComplete={handleIntensityComplete}
              minimumTrackTintColor="#2196f3"
              maximumTrackTintColor="#9e9e9e"
              thumbTintColor="#2196f3"
            />
            <Text style={styles.value}>
              {Math.round(localIntensity * 100)}%
            </Text>
          </View>
        )}

        {capabilities.supportsSpeed && (
          <View style={styles.controlContainer}>
            <Text style={styles.label}>Speed</Text>
            <Slider
              style={styles.slider}
              minimumValue={capabilities.minSpeed}
              maximumValue={capabilities.maxSpeed}
              value={localSpeed}
              onValueChange={handleSpeedChange}
              onSlidingComplete={handleSpeedComplete}
              minimumTrackTintColor="#2196f3"
              maximumTrackTintColor="#9e9e9e"
              thumbTintColor="#2196f3"
            />
            <Text style={styles.value}>
              {Math.round(localSpeed * 100)}%
            </Text>
          </View>
        )}
      </>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{pattern.name}</Text>
          <Text style={styles.type}>{pattern.type}</Text>
        </View>
        <View style={styles.status}>
          <View
            style={[
              styles.statusDot,
              pattern.playing ? styles.playingDot : styles.stoppedDot
            ]}
          />
          <Text style={styles.statusText}>
            {pattern.playing ? 'Playing' : 'Stopped'}
          </Text>
        </View>
      </View>

      {renderControls()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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
