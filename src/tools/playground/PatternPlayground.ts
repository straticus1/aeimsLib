import { EventEmitter } from 'events';
import { TelemetryManager } from '../../core/telemetry/TelemetryManager';
import { DevicePatterns } from '../../devices/experimental/patterns';
import { PatternFactory } from '../../patterns/PatternFactory';

interface PlaygroundOptions {
  // Pattern settings
  minDuration: number;
  maxDuration: number;
  minIntensity: number;
  maxIntensity: number;
  updateInterval: number;
  
  // Visualization settings
  width: number;
  height: number;
  backgroundColor: string;
  lineColor: string;
  gridColor: string;
}

interface PatternPoint {
  time: number;
  intensity: number;
}

interface PatternPreview {
  name: string;
  type: string;
  duration: number;
  points: PatternPoint[];
  peaks: number;
  avgIntensity: number;
  transitions: number;
}

/**
 * Pattern Playground
 * Interactive GUI for designing, testing, and visualizing device patterns
 */
export class PatternPlayground extends EventEmitter {
  private options: Required<PlaygroundOptions>;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private patternFactory: PatternFactory;
  private currentPattern?: any;
  private isPlaying: boolean = false;
  private playbackTimer?: NodeJS.Timer;
  private currentTime: number = 0;

  constructor(
    container: HTMLElement,
    private telemetry: TelemetryManager,
    options: Partial<PlaygroundOptions> = {}
  ) {
    super();
    this.options = this.initializeOptions(options);
    
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    this.ctx = ctx;

    // Initialize pattern factory
    this.patternFactory = new PatternFactory();

    this.setupEventHandlers();
    this.render();
  }

  /**
   * Load a predefined pattern
   */
  loadPattern(name: string): void {
    const pattern = DevicePatterns[name];
    if (!pattern) {
      throw new Error(`Pattern '${name}' not found`);
    }

    this.currentPattern = pattern;
    this.currentTime = 0;
    this.render();

    // Track pattern load
    this.telemetry.track({
      type: 'pattern_playground_load',
      timestamp: Date.now(),
      data: {
        patternName: name
      }
    });
  }

  /**
   * Create a custom pattern
   */
  createPattern(type: string, params: any): void {
    this.currentPattern = this.patternFactory.create(type, params);
    this.currentTime = 0;
    this.render();

    // Track pattern creation
    this.telemetry.track({
      type: 'pattern_playground_create',
      timestamp: Date.now(),
      data: {
        patternType: type,
        params
      }
    });
  }

  /**
   * Start pattern playback
   */
  play(): void {
    if (!this.currentPattern || this.isPlaying) return;

    this.isPlaying = true;
    this.emit('playback_start', { pattern: this.currentPattern });

    this.playbackTimer = setInterval(() => {
      this.updatePlayback();
    }, this.options.updateInterval);

    // Track playback start
    this.telemetry.track({
      type: 'pattern_playground_play',
      timestamp: Date.now(),
      data: {
        pattern: this.currentPattern
      }
    });
  }

  /**
   * Pause pattern playback
   */
  pause(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
    }

    this.emit('playback_pause', {
      time: this.currentTime,
      pattern: this.currentPattern
    });

    // Track playback pause
    this.telemetry.track({
      type: 'pattern_playground_pause',
      timestamp: Date.now(),
      data: {
        time: this.currentTime
      }
    });
  }

  /**
   * Reset pattern to start
   */
  reset(): void {
    this.currentTime = 0;
    this.render();

    this.emit('playback_reset', {
      pattern: this.currentPattern
    });
  }

  /**
   * Generate pattern preview
   */
  getPreview(): PatternPreview | null {
    if (!this.currentPattern) return null;

    // Sample pattern points
    const points: PatternPoint[] = [];
    let peaks = 0;
    let totalIntensity = 0;
    let transitions = 0;
    let lastIntensity: number | null = null;

    for (let t = 0; t <= this.currentPattern.duration; t += 100) {
      const intensity = this.currentPattern.getIntensity(t);
      points.push({ time: t, intensity });

      totalIntensity += intensity;

      if (lastIntensity !== null) {
        if (intensity > lastIntensity + 0.2) {
          peaks++;
        }
        if (Math.abs(intensity - lastIntensity) > 0.1) {
          transitions++;
        }
      }

      lastIntensity = intensity;
    }

    return {
      name: this.currentPattern.name,
      type: this.currentPattern.type,
      duration: this.currentPattern.duration,
      points,
      peaks,
      avgIntensity: totalIntensity / points.length,
      transitions
    };
  }

  /**
   * Export pattern to JSON
   */
  exportPattern(): string {
    if (!this.currentPattern) {
      throw new Error('No pattern to export');
    }

    return JSON.stringify(this.currentPattern, null, 2);
  }

  private initializeOptions(options: Partial<PlaygroundOptions>): Required<PlaygroundOptions> {
    return {
      minDuration: options.minDuration || 1000,
      maxDuration: options.maxDuration || 60000,
      minIntensity: options.minIntensity || 0,
      maxIntensity: options.maxIntensity || 1,
      updateInterval: options.updateInterval || 50,
      width: options.width || 800,
      height: options.height || 400,
      backgroundColor: options.backgroundColor || '#ffffff',
      lineColor: options.lineColor || '#2196f3',
      gridColor: options.gridColor || '#e0e0e0'
    };
  }

  private setupEventHandlers(): void {
    // Handle canvas interactions
    this.canvas.addEventListener('mousedown', (e) => {
      this.handleMouseDown(e);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.handleMouseMove(e);
    });

    this.canvas.addEventListener('mouseup', () => {
      this.handleMouseUp();
    });
  }

  private updatePlayback(): void {
    if (!this.currentPattern || !this.isPlaying) return;

    this.currentTime += this.options.updateInterval;

    // Check if pattern is complete
    if (this.currentTime >= this.currentPattern.duration) {
      this.currentTime = 0;
      this.emit('playback_complete', {
        pattern: this.currentPattern
      });
    }

    // Get current intensity
    const intensity = this.currentPattern.getIntensity(this.currentTime);
    
    this.emit('intensity_update', {
      time: this.currentTime,
      intensity
    });

    this.render();
  }

  private render(): void {
    if (!this.currentPattern) return;

    // Clear canvas
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw pattern
    this.drawPattern();

    // Draw playback indicator
    if (this.isPlaying) {
      this.drawPlaybackIndicator();
    }
  }

  private drawGrid(): void {
    this.ctx.strokeStyle = this.options.gridColor;
    this.ctx.lineWidth = 1;

    // Draw vertical lines (time)
    const timeStep = this.canvas.width / 10;
    for (let x = 0; x <= this.canvas.width; x += timeStep) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }

    // Draw horizontal lines (intensity)
    const intensityStep = this.canvas.height / 5;
    for (let y = 0; y <= this.canvas.height; y += intensityStep) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }

  private drawPattern(): void {
    if (!this.currentPattern) return;

    this.ctx.strokeStyle = this.options.lineColor;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    const duration = this.currentPattern.duration;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Draw pattern line
    for (let x = 0; x <= width; x++) {
      const time = (x / width) * duration;
      const intensity = this.currentPattern.getIntensity(time);
      const y = height - (intensity * height);

      if (x === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();
  }

  private drawPlaybackIndicator(): void {
    const x = (this.currentTime / this.currentPattern!.duration) * this.canvas.width;
    
    this.ctx.strokeStyle = '#ff0000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.canvas.height);
    this.ctx.stroke();
  }

  private handleMouseDown(e: MouseEvent): void {
    // Handle pattern editing via mouse
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Implement pattern editing logic
  }

  private handleMouseMove(e: MouseEvent): void {
    // Handle pattern editing during drag
    if (!this.isPlaying) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Implement pattern editing logic
    }
  }

  private handleMouseUp(): void {
    // Finish pattern editing
    if (this.currentPattern) {
      this.emit('pattern_edited', {
        pattern: this.currentPattern
      });

      // Track edit
      this.telemetry.track({
        type: 'pattern_playground_edit',
        timestamp: Date.now(),
        data: {
          pattern: this.currentPattern
        }
      });
    }
  }
}
