import { EventEmitter } from 'events';
import { DeviceCommand } from '../../interfaces/device';

/**
 * Protocol Message Types
 */
export enum MessageType {
  COMMAND = 'command',
  RESPONSE = 'response',
  EVENT = 'event',
  ERROR = 'error',
  STATE = 'state'
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
  // Message framing
  startMarker?: number[];
  endMarker?: number[];
  lengthField?: {
    offset: number;
    size: number;
    endianness: 'little' | 'big';
  };

  // Message parsing
  headerSize?: number;
  checksumField?: {
    offset: number;
    size: number;
    algorithm: 'xor' | 'sum' | 'crc16' | 'crc32';
  };

  // Protocol specifics
  commandPrefix?: number;
  responsePrefix?: number;
  eventPrefix?: number;
  errorPrefix?: number;
}

/**
 * Protocol Analyzer Implementation
 */
export class ProtocolAnalyzer extends EventEmitter {
  private messages: ProtocolMessage[] = [];
  private decoders: Map<string, DecoderConfig> = new Map();
  private activeDecoders: Set<string> = new Set();
  private analysisInterval: NodeJS.Timer | null = null;
  private stats: ProtocolStats;

  constructor() {
    super();
    this.resetStats();
  }

  /**
   * Register a protocol decoder
   */
  registerDecoder(name: string, config: DecoderConfig): void {
    this.decoders.set(name, config);
  }

  /**
   * Enable/disable decoders
   */
  setActiveDecoders(decoderNames: string[]): void {
    this.activeDecoders.clear();
    for (const name of decoderNames) {
      if (this.decoders.has(name)) {
        this.activeDecoders.add(name);
      }
    }
  }

  /**
   * Start protocol analysis
   */
  startAnalysis(intervalMs: number = 1000): void {
    if (this.analysisInterval) return;

    this.analysisInterval = setInterval(() => {
      const analysis = this.analyzeMessages();
      this.emit('analysis', analysis);
    }, intervalMs);
  }

  /**
   * Stop protocol analysis
   */
  stopAnalysis(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  /**
   * Record raw protocol message
   */
  recordMessage(type: MessageType, data: string | Uint8Array, metadata?: Record<string, any>): void {
    const message: ProtocolMessage = {
      type,
      timestamp: Date.now(),
      raw: data,
      metadata
    };

    // Try to decode the message
    message.decoded = this.decodeMessage(data);

    // Update statistics
    this.updateStats(message);

    // Store message
    this.messages.push(message);
    this.emit('message', message);

    // Keep only last 1000 messages
    if (this.messages.length > 1000) {
      this.messages.shift();
    }
  }

  /**
   * Record device command
   */
  recordCommand(command: DeviceCommand, rawData: string | Uint8Array): void {
    this.recordMessage(MessageType.COMMAND, rawData, {
      command,
      timestamp: Date.now()
    });
  }

  /**
   * Record command response
   */
  recordResponse(commandId: string, success: boolean, rawData: string | Uint8Array): void {
    this.recordMessage(MessageType.RESPONSE, rawData, {
      commandId,
      success,
      timestamp: Date.now()
    });
  }

  /**
   * Get protocol statistics
   */
  getStats(): ProtocolStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      messageCount: 0,
      bytesSent: 0,
      bytesReceived: 0,
      errorCount: 0,
      avgMessageSize: 0,
      messageTypes: {},
      commandStats: {
        total: 0,
        succeeded: 0,
        failed: 0,
        avgLatency: 0
      },
      errorTypes: {},
      latencyHistogram: new Array(10).fill(0)
    };
  }

  /**
   * Analyze protocol messages
   */
  private analyzeMessages(): ProtocolAnalysis {
    const analysis: ProtocolAnalysis = {
      patternDetection: {
        repeatingSequences: [],
        commonPrefixes: [],
        messageTemplates: {}
      },
      timingAnalysis: {
        averageInterval: 0,
        burstDetected: false,
        intervalHistogram: []
      },
      anomalies: []
    };

    // Pattern detection
    this.detectPatterns(analysis);

    // Timing analysis
    this.analyzeTiming(analysis);

    // Anomaly detection
    this.detectAnomalies(analysis);

    return analysis;
  }

  /**
   * Detect message patterns
   */
  private detectPatterns(analysis: ProtocolAnalysis): void {
    const messages = this.messages.slice(-100); // Analyze last 100 messages

    // Find repeating sequences
    const sequences = new Map<string, number>();
    for (let length = 2; length <= 5; length++) {
      for (let i = 0; i < messages.length - length; i++) {
        const sequence = messages.slice(i, i + length)
          .map(m => m.type)
          .join(',');
        sequences.set(sequence, (sequences.get(sequence) || 0) + 1);
      }
    }

    // Extract common sequences
    for (const [sequence, count] of sequences) {
      if (count >= 3) { // At least 3 occurrences
        analysis.patternDetection.repeatingSequences.push(
          sequence.split(',') as MessageType[]
        );
      }
    }

    // Find common message prefixes
    const prefixes = new Set<string>();
    messages.forEach(message => {
      if (message.raw instanceof Uint8Array && message.raw.length >= 4) {
        const prefix = Array.from(message.raw.slice(0, 4))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        prefixes.add(prefix);
      }
    });
    analysis.patternDetection.commonPrefixes = Array.from(prefixes);

    // Generate message templates
    const templates = new Map<string, any>();
    messages.forEach(message => {
      if (message.decoded) {
        const template = this.generateTemplate(message.decoded);
        const key = `${message.type}_template`;
        templates.set(key, template);
      }
    });
    analysis.patternDetection.messageTemplates = Object.fromEntries(templates);
  }

  /**
   * Analyze message timing
   */
  private analyzeTiming(analysis: ProtocolAnalysis): void {
    const messages = this.messages.slice(-100);
    const intervals: number[] = [];

    // Calculate intervals between messages
    for (let i = 1; i < messages.length; i++) {
      const interval = messages[i].timestamp - messages[i - 1].timestamp;
      intervals.push(interval);
    }

    if (intervals.length > 0) {
      // Calculate average interval
      analysis.timingAnalysis.averageInterval = 
        intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // Generate histogram
      const maxInterval = Math.max(...intervals);
      const buckets = 10;
      const bucketSize = maxInterval / buckets;
      const histogram = new Array(buckets).fill(0);

      intervals.forEach(interval => {
        const bucket = Math.min(
          Math.floor(interval / bucketSize),
          buckets - 1
        );
        histogram[bucket]++;
      });
      analysis.timingAnalysis.intervalHistogram = histogram;

      // Detect bursts
      const stdDev = Math.sqrt(
        intervals.reduce((sum, x) => sum + Math.pow(x - analysis.timingAnalysis.averageInterval, 2), 0) / 
        intervals.length
      );
      analysis.timingAnalysis.burstDetected = stdDev > analysis.timingAnalysis.averageInterval * 2;
    }
  }

  /**
   * Detect protocol anomalies
   */
  private detectAnomalies(analysis: ProtocolAnalysis): void {
    const messages = this.messages.slice(-100);

    // Check for unusually large messages
    const avgSize = this.stats.avgMessageSize;
    messages.forEach(message => {
      const size = message.raw instanceof Uint8Array ? 
        message.raw.length : message.raw.length;
      if (size > avgSize * 3) {
        analysis.anomalies.push({
          type: 'large_message',
          message: `Message size ${size} bytes exceeds average by 3x`,
          timestamp: message.timestamp,
          context: { size, avgSize }
        });
      }
    });

    // Check for unexpected message sequences
    const expectedSequences = {
      [MessageType.COMMAND]: [MessageType.RESPONSE],
      [MessageType.ERROR]: [MessageType.STATE]
    };

    for (let i = 0; i < messages.length - 1; i++) {
      const current = messages[i];
      const next = messages[i + 1];
      const expected = expectedSequences[current.type];

      if (expected && !expected.includes(next.type)) {
        analysis.anomalies.push({
          type: 'unexpected_sequence',
          message: `Unexpected ${next.type} after ${current.type}`,
          timestamp: next.timestamp,
          context: { expected, actual: next.type }
        });
      }
    }

    // Check for timing anomalies
    const intervals = [];
    for (let i = 1; i < messages.length; i++) {
      intervals.push(messages[i].timestamp - messages[i - 1].timestamp);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((sum, x) => sum + Math.pow(x - avgInterval, 2), 0) / 
      intervals.length
    );

    intervals.forEach((interval, i) => {
      if (Math.abs(interval - avgInterval) > stdDev * 3) {
        analysis.anomalies.push({
          type: 'timing_anomaly',
          message: `Unusual message timing: ${interval}ms`,
          timestamp: messages[i + 1].timestamp,
          context: { interval, avgInterval, stdDev }
        });
      }
    });
  }

  /**
   * Decode raw message data
   */
  private decodeMessage(data: string | Uint8Array): any | undefined {
    if (this.activeDecoders.size === 0) return undefined;

    for (const [name, config] of this.decoders) {
      if (!this.activeDecoders.has(name)) continue;

      try {
        if (data instanceof Uint8Array) {
          return this.decodeBinary(data, config);
        } else {
          return this.decodeText(data, config);
        }
      } catch (error) {
        this.emit('decodingError', { decoder: name, error, data });
      }
    }

    return undefined;
  }

  /**
   * Decode binary message
   */
  private decodeText(data: string, config: DecoderConfig): any {
    // Implement text protocol decoding
    return JSON.parse(data);
  }

  /**
   * Decode binary message
   */
  private decodeText(data: string, config: DecoderConfig): any {
    // Basic text protocol decoding
    try {
      return JSON.parse(data);
    } catch {
      // Try command pattern matching
      const commandMatch = data.match(/^CMD:(\w+)\s*\((.*)\)$/);
      if (commandMatch) {
        return {
          type: 'command',
          command: commandMatch[1],
          params: commandMatch[2].split(',').map(p => p.trim())
        };
      }

      // Try response pattern matching
      const responseMatch = data.match(/^RSP:(\w+)\s*=\s*(.*)$/);
      if (responseMatch) {
        return {
          type: 'response',
          status: responseMatch[1],
          data: responseMatch[2]
        };
      }

      // Try event pattern matching
      const eventMatch = data.match(/^EVT:(\w+)\s*:\s*(.*)$/);
      if (eventMatch) {
        return {
          type: 'event',
          name: eventMatch[1],
          data: eventMatch[2]
        };
      }
    }

    return undefined;
  }

  /**
   * Decode binary message
   */
  private decodeBinary(data: Uint8Array, config: DecoderConfig): any {
    let position = 0;

    // Check start marker if configured
    if (config.startMarker) {
      const marker = data.slice(0, config.startMarker.length);
      if (!config.startMarker.every((b, i) => marker[i] === b)) {
        throw new Error('Invalid start marker');
      }
      position += config.startMarker.length;
    }

    // Read message length if configured
    let messageLength = data.length;
    if (config.lengthField) {
      const lengthBytes = data.slice(
        position + config.lengthField.offset,
        position + config.lengthField.offset + config.lengthField.size
      );
      messageLength = config.lengthField.endianness === 'little' ?
        this.readLittleEndian(lengthBytes) :
        this.readBigEndian(lengthBytes);
      position += config.lengthField.size;
    }

    // Read header if configured
    let header: any;
    if (config.headerSize) {
      header = data.slice(position, position + config.headerSize);
      position += config.headerSize;
    }

    // Read message body
    const body = data.slice(position, messageLength - (config.checksumField?.size || 0));
    position = messageLength - (config.checksumField?.size || 0);

    // Verify checksum if configured
    if (config.checksumField) {
      const checksum = data.slice(
        position,
        position + config.checksumField.size
      );
      const calculated = this.calculateChecksum(
        data.slice(0, position),
        config.checksumField.algorithm
      );
      if (!checksum.every((b, i) => calculated[i] === b)) {
        throw new Error('Checksum verification failed');
      }
    }

    // Determine message type
    let type: string | undefined;
    if (header) {
      if (header[0] === config.commandPrefix) type = 'command';
      else if (header[0] === config.responsePrefix) type = 'response';
      else if (header[0] === config.eventPrefix) type = 'event';
      else if (header[0] === config.errorPrefix) type = 'error';
    }

    return {
      type,
      header: header ? Array.from(header) : undefined,
      body: this.parseBody(body),
      length: messageLength
    };
  }

  /**
   * Parse message body based on common patterns
   */
  private parseBody(data: Uint8Array): any {
    // Try to parse as JSON
    try {
      const text = new TextDecoder().decode(data);
      return JSON.parse(text);
    } catch {}

    // Try to parse as key-value pairs
    const result: Record<string, number> = {};
    let position = 0;
    while (position < data.length - 1) {
      const key = data[position];
      const value = data[position + 1];
      result[key.toString(16)] = value;
      position += 2;
    }
    if (Object.keys(result).length > 0) {
      return result;
    }

    // Return raw bytes
    return Array.from(data);
  }

  /**
   * Read little-endian value
   */
  private readLittleEndian(bytes: Uint8Array): number {
    let value = 0;
    for (let i = 0; i < bytes.length; i++) {
      value += bytes[i] << (8 * i);
    }
    return value;
  }

  /**
   * Read big-endian value
   */
  private readBigEndian(bytes: Uint8Array): number {
    let value = 0;
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) + bytes[i];
    }
    return value;
  }

  /**
   * Calculate checksum
   */
  private calculateChecksum(data: Uint8Array, algorithm: string): Uint8Array {
    switch (algorithm) {
      case 'xor':
        return new Uint8Array([
          data.reduce((a, b) => a ^ b, 0)
        ]);

      case 'sum':
        return new Uint8Array([
          data.reduce((a, b) => (a + b) & 0xFF, 0)
        ]);

      case 'crc16':
        return this.calculateCRC16(data);

      case 'crc32':
        return this.calculateCRC32(data);

      default:
        throw new Error(`Unsupported checksum algorithm: ${algorithm}`);
    }
  }

  /**
   * Calculate CRC16
   */
  private calculateCRC16(data: Uint8Array): Uint8Array {
    let crc = 0xFFFF;
    const polynomial = 0x8408;

    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        if (crc & 1) {
          crc = (crc >> 1) ^ polynomial;
        } else {
          crc >>= 1;
        }
      }
    }

    return new Uint8Array([
      crc & 0xFF,
      (crc >> 8) & 0xFF
    ]);
  }

  /**
   * Calculate CRC32
   */
  private calculateCRC32(data: Uint8Array): Uint8Array {
    let crc = 0xFFFFFFFF;
    const polynomial = 0xEDB88320;

    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ polynomial;
        } else {
          crc >>>= 1;
        }
      }
    }

    crc = ~crc;
    return new Uint8Array([
      crc & 0xFF,
      (crc >> 8) & 0xFF,
      (crc >> 16) & 0xFF,
      (crc >> 24) & 0xFF
    ]);
  }

  /**
   * Generate message template
   */
  private generateTemplate(message: any): any {
    if (Array.isArray(message)) {
      return message.map(item => this.generateTemplate(item));
    }

    if (typeof message === 'object' && message !== null) {
      const template: Record<string, any> = {};
      for (const [key, value] of Object.entries(message)) {
        if (typeof value === 'number') {
          template[key] = 'number';
        } else if (typeof value === 'string') {
          template[key] = 'string';
        } else if (typeof value === 'boolean') {
          template[key] = 'boolean';
        } else if (value === null) {
          template[key] = 'null';
        } else {
          template[key] = this.generateTemplate(value);
        }
      }
      return template;
    }

    return typeof message;
  }

  /**
   * Update protocol statistics
   */
  private updateStats(message: ProtocolMessage): void {
    this.stats.messageCount++;
    
    const size = message.raw instanceof Uint8Array ? 
      message.raw.length : message.raw.length;

    if (message.type === MessageType.COMMAND) {
      this.stats.bytesSent += size;
      this.stats.commandStats.total++;
    } else if (message.type === MessageType.RESPONSE) {
      this.stats.bytesReceived += size;
      if (message.metadata?.success) {
        this.stats.commandStats.succeeded++;
      } else {
        this.stats.commandStats.failed++;
      }
    }

    if (message.type === MessageType.ERROR) {
      this.stats.errorCount++;
      const errorType = message.decoded?.type || 'unknown';
      this.stats.errorTypes[errorType] = 
        (this.stats.errorTypes[errorType] || 0) + 1;
    }

    this.stats.messageTypes[message.type] = 
      (this.stats.messageTypes[message.type] || 0) + 1;

    // Update average message size
    this.stats.avgMessageSize = 
      (this.stats.avgMessageSize * (this.stats.messageCount - 1) + size) / 
      this.stats.messageCount;

    // Update latency histogram for commands
    if (message.type === MessageType.RESPONSE && message.metadata?.commandId) {
      const command = this.findMessage(
        MessageType.COMMAND,
        msg => msg.metadata?.id === message.metadata.commandId
      );
      if (command) {
        const latency = message.timestamp - command.timestamp;
        const bucket = Math.min(
          Math.floor(latency / 100),
          this.stats.latencyHistogram.length - 1
        );
        this.stats.latencyHistogram[bucket]++;

        // Update average latency
        const totalLatency = this.stats.commandStats.avgLatency * 
          (this.stats.commandStats.total - 1) + latency;
        this.stats.commandStats.avgLatency = totalLatency / 
          this.stats.commandStats.total;
      }
    }
  }

  /**
   * Find message by type and predicate
   */
  private findMessage(
    type: MessageType,
    predicate: (msg: ProtocolMessage) => boolean
  ): ProtocolMessage | undefined {
    return this.messages.find(
      msg => msg.type === type && predicate(msg)
    );
  }
}
