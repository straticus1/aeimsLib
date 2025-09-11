import React from 'react';
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
export declare const DeviceCard: React.FC<DeviceCardProps>;
export {};
