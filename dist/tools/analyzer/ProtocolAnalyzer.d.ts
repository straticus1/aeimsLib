import { EventEmitter } from 'events';
import { DeviceCommand } from '../../interfaces/device';
/**
 * Protocol Message Types
 */
export declare enum MessageType {
    COMMAND = "command",
    RESPONSE = "response",
    EVENT = "event",
    ERROR = "error",
    STATE = "state"
}
/**
 * Protocol Message
 */
export interface ProtocolMessage {
    type: MessageType;
    timestamp: number;
    raw: string | Uint8Array;
    decoded?: any;
    metadata?: Record<string, any>;
}
/**
 * Protocol Statistics
 */
export interface ProtocolStats {
    messageCount: number;
    bytesSent: number;
    bytesReceived: number;
    errorCount: number;
    avgMessageSize: number;
    messageTypes: Record<string, number>;
    commandStats: {
        total: number;
        succeeded: number;
        failed: number;
        avgLatency: number;
    };
    errorTypes: Record<string, number>;
    latencyHistogram: number[];
}
/**
 * Protocol Analysis
 */
export interface ProtocolAnalysis {
    patternDetection: {
        repeatingSequences: string[][];
        commonPrefixes: string[];
        messageTemplates: Record<string, any>;
    };
    timingAnalysis: {
        averageInterval: number;
        burstDetected: boolean;
        intervalHistogram: number[];
    };
    anomalies: {
        type: string;
        message: string;
        timestamp: number;
        context?: any;
    }[];
}
/**
 * Protocol Decoder Configuration
 */
export interface DecoderConfig {
    startMarker?: number[];
    endMarker?: number[];
    lengthField?: {
        offset: number;
        size: number;
        endianness: 'little' | 'big';
    };
    headerSize?: number;
    checksumField?: {
        offset: number;
        size: number;
        algorithm: 'xor' | 'sum' | 'crc16' | 'crc32';
    };
    commandPrefix?: number;
    responsePrefix?: number;
    eventPrefix?: number;
    errorPrefix?: number;
}
/**
 * Protocol Analyzer Implementation
 */
export declare class ProtocolAnalyzer extends EventEmitter {
    private messages;
    private decoders;
    private activeDecoders;
    private analysisInterval;
    private stats;
    constructor();
    /**
     * Register a protocol decoder
     */
    registerDecoder(name: string, config: DecoderConfig): void;
    /**
     * Enable/disable decoders
     */
    setActiveDecoders(decoderNames: string[]): void;
    /**
     * Start protocol analysis
     */
    startAnalysis(intervalMs?: number): void;
    /**
     * Stop protocol analysis
     */
    stopAnalysis(): void;
    /**
     * Record raw protocol message
     */
    recordMessage(type: MessageType, data: string | Uint8Array, metadata?: Record<string, any>): void;
    /**
     * Record device command
     */
    recordCommand(command: DeviceCommand, rawData: string | Uint8Array): void;
    /**
     * Record command response
     */
    recordResponse(commandId: string, success: boolean, rawData: string | Uint8Array): void;
    /**
     * Get protocol statistics
     */
    getStats(): ProtocolStats;
    /**
     * Reset statistics
     */
    resetStats(): void;
    /**
     * Analyze protocol messages
     */
    private analyzeMessages;
    /**
     * Detect message patterns
     */
    private detectPatterns;
    /**
     * Analyze message timing
     */
    private analyzeTiming;
    /**
     * Detect protocol anomalies
     */
    private detectAnomalies;
    /**
     * Decode raw message data
     */
    private decodeMessage;
    /**
     * Decode binary message
     */
    private decodeText;
    /**
     * Decode binary message
     */
    private decodeBinary;
    /**
     * Parse message body based on common patterns
     */
    private parseBody;
    /**
     * Read little-endian value
     */
    private readLittleEndian;
    /**
     * Read big-endian value
     */
    private readBigEndian;
    /**
     * Calculate checksum
     */
    private calculateChecksum;
    /**
     * Calculate CRC16
     */
    private calculateCRC16;
    /**
     * Calculate CRC32
     */
    private calculateCRC32;
    /**
     * Generate message template
     */
    private generateTemplate;
    /**
     * Update protocol statistics
     */
    private updateStats;
    /**
     * Find message by type and predicate
     */
    private findMessage;
}
