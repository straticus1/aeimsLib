import { Pattern } from '../../patterns/Pattern';
/**
 * Device-specific pattern presets
 */
export declare const PiShockPatterns: {
    gentleWaves: {
        type: any;
        params: {
            minIntensity: number;
            maxIntensity: number;
            period: number;
            shape: string;
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
    pulseSequence: {
        type: any;
        params: {
            steps: {
                intensity: number;
                duration: number;
            }[];
            repeat: boolean;
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
};
export declare const TCodePatterns: {
    slowStrokes: {
        type: any;
        params: {
            axes: {
                L0: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                    };
                };
                R0: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                        phaseOffset: number;
                    };
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
    teasing: {
        type: any;
        params: {
            axes: {
                L0: {
                    type: any;
                    params: {
                        steps: {
                            intensity: number;
                            duration: number;
                        }[];
                        repeat: boolean;
                    };
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
};
export declare const TENSPatterns: {
    massage: {
        type: any;
        params: {
            channels: {
                1: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                    };
                };
                2: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                        phaseOffset: number;
                    };
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
    pulseTrain: {
        type: any;
        params: {
            channels: {
                1: {
                    type: any;
                    params: {
                        intensity: number;
                        pulseWidth: number;
                        interval: number;
                    };
                };
                2: {
                    type: any;
                    params: {
                        intensity: number;
                        pulseWidth: number;
                        interval: number;
                        phaseOffset: number;
                    };
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
};
export declare const VibeasePatterns: {
    buildUp: {
        type: any;
        params: {
            startIntensity: number;
            endIntensity: number;
            duration: number;
            shape: string;
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
    waves: {
        type: any;
        params: {
            minIntensity: number;
            maxIntensity: number;
            period: number;
            shape: string;
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
};
export declare const SatisfyerPatterns: {
    dualStimulation: {
        type: any;
        params: {
            channels: {
                vibration: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                    };
                };
                air: {
                    type: any;
                    params: {
                        steps: {
                            pressure: number;
                            frequency: number;
                            duration: number;
                        }[];
                        repeat: boolean;
                    };
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
    intense: {
        type: any;
        params: {
            channels: {
                vibration: {
                    type: any;
                    params: {
                        intensity: number;
                    };
                };
                air: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                    };
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
};
export declare const HicooPatterns: {
    dualMotor: {
        type: any;
        params: {
            motors: {
                1: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                    };
                };
                2: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                        phaseOffset: number;
                    };
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
    rotateAndVibe: {
        type: any;
        params: {
            vibrate: {
                type: any;
                params: {
                    minIntensity: number;
                    maxIntensity: number;
                    period: number;
                    shape: string;
                };
            };
            rotate: {
                type: any;
                params: {
                    steps: {
                        direction: string;
                        speed: number;
                        duration: number;
                    }[];
                    repeat: boolean;
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
};
export declare const LoveLifePatterns: {
    kegelTraining: {
        type: any;
        params: {
            steps: {
                mode: string;
                duration: number;
                intensity: number;
            }[];
            repeat: number;
            cooldown: number;
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
    relaxation: {
        type: any;
        params: {
            vibration: {
                type: any;
                params: {
                    minIntensity: number;
                    maxIntensity: number;
                    period: number;
                    shape: string;
                };
            };
            pressure: {
                type: any;
                params: {
                    targetRange: {
                        min: number;
                        max: number;
                    };
                    feedbackInterval: number;
                    guidanceMode: string;
                };
            };
        };
        meta: {
            name: string;
            description: string;
            deviceType: string;
        };
    };
};
export declare function createDevicePattern(deviceType: string, patternName: string, customParams?: any): Pattern;
export declare const DevicePatterns: {
    PiShock: {
        gentleWaves: {
            type: any;
            params: {
                minIntensity: number;
                maxIntensity: number;
                period: number;
                shape: string;
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
        pulseSequence: {
            type: any;
            params: {
                steps: {
                    intensity: number;
                    duration: number;
                }[];
                repeat: boolean;
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
    };
    TCode: {
        slowStrokes: {
            type: any;
            params: {
                axes: {
                    L0: {
                        type: any;
                        params: {
                            minIntensity: number;
                            maxIntensity: number;
                            period: number;
                            shape: string;
                        };
                    };
                    R0: {
                        type: any;
                        params: {
                            minIntensity: number;
                            maxIntensity: number;
                            period: number;
                            shape: string;
                            phaseOffset: number;
                        };
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
        teasing: {
            type: any;
            params: {
                axes: {
                    L0: {
                        type: any;
                        params: {
                            steps: {
                                intensity: number;
                                duration: number;
                            }[];
                            repeat: boolean;
                        };
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
    };
    TENS: {
        massage: {
            type: any;
            params: {
                channels: {
                    1: {
                        type: any;
                        params: {
                            minIntensity: number;
                            maxIntensity: number;
                            period: number;
                            shape: string;
                        };
                    };
                    2: {
                        type: any;
                        params: {
                            minIntensity: number;
                            maxIntensity: number;
                            period: number;
                            shape: string;
                            phaseOffset: number;
                        };
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
        pulseTrain: {
            type: any;
            params: {
                channels: {
                    1: {
                        type: any;
                        params: {
                            intensity: number;
                            pulseWidth: number;
                            interval: number;
                        };
                    };
                    2: {
                        type: any;
                        params: {
                            intensity: number;
                            pulseWidth: number;
                            interval: number;
                            phaseOffset: number;
                        };
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
    };
    Vibease: {
        buildUp: {
            type: any;
            params: {
                startIntensity: number;
                endIntensity: number;
                duration: number;
                shape: string;
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
        waves: {
            type: any;
            params: {
                minIntensity: number;
                maxIntensity: number;
                period: number;
                shape: string;
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
    };
    Satisfyer: {
        dualStimulation: {
            type: any;
            params: {
                channels: {
                    vibration: {
                        type: any;
                        params: {
                            minIntensity: number;
                            maxIntensity: number;
                            period: number;
                            shape: string;
                        };
                    };
                    air: {
                        type: any;
                        params: {
                            steps: {
                                pressure: number;
                                frequency: number;
                                duration: number;
                            }[];
                            repeat: boolean;
                        };
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
        intense: {
            type: any;
            params: {
                channels: {
                    vibration: {
                        type: any;
                        params: {
                            intensity: number;
                        };
                    };
                    air: {
                        type: any;
                        params: {
                            minIntensity: number;
                            maxIntensity: number;
                            period: number;
                            shape: string;
                        };
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
    };
    Hicoo: {
        dualMotor: {
            type: any;
            params: {
                motors: {
                    1: {
                        type: any;
                        params: {
                            minIntensity: number;
                            maxIntensity: number;
                            period: number;
                            shape: string;
                        };
                    };
                    2: {
                        type: any;
                        params: {
                            minIntensity: number;
                            maxIntensity: number;
                            period: number;
                            shape: string;
                            phaseOffset: number;
                        };
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
        rotateAndVibe: {
            type: any;
            params: {
                vibrate: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                    };
                };
                rotate: {
                    type: any;
                    params: {
                        steps: {
                            direction: string;
                            speed: number;
                            duration: number;
                        }[];
                        repeat: boolean;
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
    };
    LoveLife: {
        kegelTraining: {
            type: any;
            params: {
                steps: {
                    mode: string;
                    duration: number;
                    intensity: number;
                }[];
                repeat: number;
                cooldown: number;
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
        relaxation: {
            type: any;
            params: {
                vibration: {
                    type: any;
                    params: {
                        minIntensity: number;
                        maxIntensity: number;
                        period: number;
                        shape: string;
                    };
                };
                pressure: {
                    type: any;
                    params: {
                        targetRange: {
                            min: number;
                            max: number;
                        };
                        feedbackInterval: number;
                        guidanceMode: string;
                    };
                };
            };
            meta: {
                name: string;
                description: string;
                deviceType: string;
            };
        };
    };
};
