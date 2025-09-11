import React from 'react';
interface PatternControlProps {
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
    capabilities: {
        minIntensity: number;
        maxIntensity: number;
        minSpeed: number;
        maxSpeed: number;
        supportsSpeed: boolean;
        supportsIntensity: boolean;
    };
    onPlay?: () => void;
    onPause?: () => void;
    onStop?: () => void;
    onIntensityChange?: (value: number) => void;
    onSpeedChange?: (value: number) => void;
    loading?: boolean;
    error?: string;
}
/**
 * Pattern Control Component
 * Provides interactive pattern control interface with real-time feedback
 */
export declare const PatternControl: React.FC<PatternControlProps>;
export {};
