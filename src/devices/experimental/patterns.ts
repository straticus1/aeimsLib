import { Pattern, PatternType } from '../../patterns/Pattern';

/**
 * Device-specific pattern presets
 */

// PiShock Patterns
export const PiShockPatterns = {
  gentleWaves: {
    type: PatternType.WAVE,
    params: {
      minIntensity: 0.1,
      maxIntensity: 0.3,
      period: 2000, // 2 seconds
      shape: 'sine'
    },
    meta: {
      name: 'Gentle Waves',
      description: 'Gentle pulsing sensation',
      deviceType: 'pishock'
    }
  },
  pulseSequence: {
    type: PatternType.SEQUENCE,
    params: {
      steps: [
        { intensity: 0.2, duration: 200 },
        { intensity: 0, duration: 800 },
        { intensity: 0.3, duration: 200 },
        { intensity: 0, duration: 1000 }
      ],
      repeat: true
    },
    meta: {
      name: 'Pulse Sequence',
      description: 'Alternating pulses with pauses',
      deviceType: 'pishock'
    }
  }
};

// TCode Patterns (for stroke/motion devices)
export const TCodePatterns = {
  slowStrokes: {
    type: PatternType.MULTI_AXIS,
    params: {
      axes: {
        L0: { // Linear motion
          type: PatternType.WAVE,
          params: {
            minIntensity: 0.2,
            maxIntensity: 0.8,
            period: 3000,
            shape: 'triangle'
          }
        },
        R0: { // Rotation
          type: PatternType.WAVE,
          params: {
            minIntensity: 0.3,
            maxIntensity: 0.7,
            period: 3000,
            shape: 'sine',
            phaseOffset: Math.PI / 2
          }
        }
      }
    },
    meta: {
      name: 'Slow Strokes',
      description: 'Smooth, slow strokes with rotation',
      deviceType: 'tcode'
    }
  },
  teasing: {
    type: PatternType.MULTI_AXIS,
    params: {
      axes: {
        L0: {
          type: PatternType.SEQUENCE,
          params: {
            steps: [
              { intensity: 0.8, duration: 500 },
              { intensity: 0.2, duration: 200 },
              { intensity: 0.6, duration: 300 },
              { intensity: 0.3, duration: 1000 }
            ],
            repeat: true
          }
        }
      }
    },
    meta: {
      name: 'Teasing',
      description: 'Variable speed teasing pattern',
      deviceType: 'tcode'
    }
  }
};

// TENS Patterns
export const TENSPatterns = {
  massage: {
    type: PatternType.MULTI_CHANNEL,
    params: {
      channels: {
        1: {
          type: PatternType.WAVE,
          params: {
            minIntensity: 0.2,
            maxIntensity: 0.5,
            period: 1000,
            shape: 'sine'
          }
        },
        2: {
          type: PatternType.WAVE,
          params: {
            minIntensity: 0.2,
            maxIntensity: 0.5,
            period: 1000,
            shape: 'sine',
            phaseOffset: Math.PI
          }
        }
      }
    },
    meta: {
      name: 'Massage',
      description: 'Alternating massage pattern',
      deviceType: 'tens'
    }
  },
  pulseTrain: {
    type: PatternType.MULTI_CHANNEL,
    params: {
      channels: {
        1: {
          type: PatternType.PULSE,
          params: {
            intensity: 0.4,
            pulseWidth: 100,
            interval: 500
          }
        },
        2: {
          type: PatternType.PULSE,
          params: {
            intensity: 0.4,
            pulseWidth: 100,
            interval: 500,
            phaseOffset: 250
          }
        }
      }
    },
    meta: {
      name: 'Pulse Train',
      description: 'Alternating pulses between channels',
      deviceType: 'tens'
    }
  }
};

// Vibease Patterns
export const VibeasePatterns = {
  buildUp: {
    type: PatternType.RAMP,
    params: {
      startIntensity: 0.2,
      endIntensity: 0.9,
      duration: 30000, // 30 seconds
      shape: 'exponential'
    },
    meta: {
      name: 'Build Up',
      description: 'Gradually increasing intensity',
      deviceType: 'vibease'
    }
  },
  waves: {
    type: PatternType.WAVE,
    params: {
      minIntensity: 0.3,
      maxIntensity: 0.8,
      period: 4000,
      shape: 'sine'
    },
    meta: {
      name: 'Waves',
      description: 'Smooth wave pattern',
      deviceType: 'vibease'
    }
  }
};

// Satisfyer Patterns
export const SatisfyerPatterns = {
  dualStimulation: {
    type: PatternType.MULTI_CHANNEL,
    params: {
      channels: {
        vibration: {
          type: PatternType.WAVE,
          params: {
            minIntensity: 0.3,
            maxIntensity: 0.7,
            period: 3000,
            shape: 'sine'
          }
        },
        air: {
          type: PatternType.SEQUENCE,
          params: {
            steps: [
              { pressure: 0.5, frequency: 0.3, duration: 2000 },
              { pressure: 0.7, frequency: 0.6, duration: 1000 },
              { pressure: 0.4, frequency: 0.4, duration: 2000 }
            ],
            repeat: true
          }
        }
      }
    },
    meta: {
      name: 'Dual Stimulation',
      description: 'Combined vibration and air pulse pattern',
      deviceType: 'satisfyer'
    }
  },
  intense: {
    type: PatternType.MULTI_CHANNEL,
    params: {
      channels: {
        vibration: {
          type: PatternType.CONSTANT,
          params: { intensity: 0.8 }
        },
        air: {
          type: PatternType.WAVE,
          params: {
            minIntensity: 0.6,
            maxIntensity: 0.9,
            period: 1000,
            shape: 'triangle'
          }
        }
      }
    },
    meta: {
      name: 'Intense',
      description: 'High-intensity combined stimulation',
      deviceType: 'satisfyer'
    }
  }
};

// Hicoo/Hi-Link Patterns
export const HicooPatterns = {
  dualMotor: {
    type: PatternType.MULTI_MOTOR,
    params: {
      motors: {
        1: {
          type: PatternType.WAVE,
          params: {
            minIntensity: 0.3,
            maxIntensity: 0.8,
            period: 2000,
            shape: 'sine'
          }
        },
        2: {
          type: PatternType.WAVE,
          params: {
            minIntensity: 0.3,
            maxIntensity: 0.8,
            period: 2000,
            shape: 'sine',
            phaseOffset: Math.PI
          }
        }
      }
    },
    meta: {
      name: 'Dual Motor',
      description: 'Alternating dual motor stimulation',
      deviceType: 'hicoo'
    }
  },
  rotateAndVibe: {
    type: PatternType.MULTI_FUNCTION,
    params: {
      vibrate: {
        type: PatternType.WAVE,
        params: {
          minIntensity: 0.4,
          maxIntensity: 0.9,
          period: 3000,
          shape: 'sine'
        }
      },
      rotate: {
        type: PatternType.SEQUENCE,
        params: {
          steps: [
            { direction: 'clockwise', speed: 0.7, duration: 5000 },
            { direction: 'counterclockwise', speed: 0.7, duration: 5000 }
          ],
          repeat: true
        }
      }
    },
    meta: {
      name: 'Rotate & Vibe',
      description: 'Combined rotation and vibration',
      deviceType: 'hicoo'
    }
  }
};

// LoveLife Patterns
export const LoveLifePatterns = {
  kegelTraining: {
    type: PatternType.EXERCISE,
    params: {
      steps: [
        { mode: 'contract', duration: 5000, intensity: 0.5 },
        { mode: 'rest', duration: 3000, intensity: 0 },
        { mode: 'flutter', duration: 3000, intensity: 0.6 },
        { mode: 'rest', duration: 4000, intensity: 0 }
      ],
      repeat: 5,
      cooldown: 10000
    },
    meta: {
      name: 'Kegel Training',
      description: 'Guided kegel exercise routine',
      deviceType: 'lovelife'
    }
  },
  relaxation: {
    type: PatternType.MULTI_MODE,
    params: {
      vibration: {
        type: PatternType.WAVE,
        params: {
          minIntensity: 0.2,
          maxIntensity: 0.5,
          period: 5000,
          shape: 'sine'
        }
      },
      pressure: {
        type: PatternType.BIOFEEDBACK,
        params: {
          targetRange: { min: 0.3, max: 0.6 },
          feedbackInterval: 1000,
          guidanceMode: 'gentle'
        }
      }
    },
    meta: {
      name: 'Relaxation',
      description: 'Gentle pattern with biofeedback',
      deviceType: 'lovelife'
    }
  }
};

// Pattern Factory
export function createDevicePattern(
  deviceType: string,
  patternName: string,
  customParams?: any
): Pattern {
  let basePattern;

  switch (deviceType.toLowerCase()) {
    case 'pishock':
      basePattern = PiShockPatterns[patternName];
      break;
    case 'tcode':
      basePattern = TCodePatterns[patternName];
      break;
    case 'tens':
      basePattern = TENSPatterns[patternName];
      break;
    case 'vibease':
      basePattern = VibeasePatterns[patternName];
      break;
    case 'satisfyer':
      basePattern = SatisfyerPatterns[patternName];
      break;
    case 'hicoo':
      basePattern = HicooPatterns[patternName];
      break;
    case 'lovelife':
      basePattern = LoveLifePatterns[patternName];
      break;
    default:
      throw new Error(`Unknown device type: ${deviceType}`);
  }

  if (!basePattern) {
    throw new Error(`Pattern '${patternName}' not found for device type '${deviceType}'`);
  }

  // Create new pattern instance with optional custom parameters
  return new Pattern({
    ...basePattern,
    params: {
      ...basePattern.params,
      ...customParams
    }
  });
}

// Export all patterns
export const DevicePatterns = {
  PiShock: PiShockPatterns,
  TCode: TCodePatterns,
  TENS: TENSPatterns,
  Vibease: VibeasePatterns,
  Satisfyer: SatisfyerPatterns,
  Hicoo: HicooPatterns,
  LoveLife: LoveLifePatterns
};
