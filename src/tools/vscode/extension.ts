import * as vscode from 'vscode';
import { PatternDesigner } from '../gui/PatternDesigner';
import { DeviceSimulator } from '../simulator/DeviceSimulator';
import { ProtocolAnalyzer } from '../analyzer/ProtocolAnalyzer';
import { DevicePatterns } from '../../devices/experimental/patterns';

/**
 * Extension Activation Context
 */
interface ExtensionContext {
  devices: Map<string, any>;
  patternDesigner: PatternDesigner | null;
  simulator: DeviceSimulator | null;
  analyzer: ProtocolAnalyzer | null;
}

const context: ExtensionContext = {
  devices: new Map(),
  patternDesigner: null,
  simulator: null,
  analyzer: null
};

/**
 * Extension Activation
 */
export function activate(extensionContext: vscode.ExtensionContext) {
  console.log('AeimsLib extension is now active');

  // Register Commands
  const commands = [
    vscode.commands.registerCommand(
      'aeimslib.openPatternDesigner',
      openPatternDesigner
    ),
    vscode.commands.registerCommand(
      'aeimslib.startSimulation',
      startDeviceSimulation
    ),
    vscode.commands.registerCommand(
      'aeimslib.startAnalyzer',
      startProtocolAnalyzer
    ),
    vscode.commands.registerCommand(
      'aeimslib.insertPattern',
      insertPatternTemplate
    ),
    vscode.commands.registerCommand(
      'aeimslib.validatePattern',
      validateCurrentPattern
    )
  ];

  extensionContext.subscriptions.push(...commands);

  // Register Providers
  registerProviders(extensionContext);
}

/**
 * Open Pattern Designer
 */
async function openPatternDesigner() {
  // Create and show webview
  const panel = vscode.window.createWebviewPanel(
    'aeimsPatternDesigner',
    'Pattern Designer',
    vscode.ViewColumn.One,
    {
      enableScripts: true
    }
  );

  // Initialize designer
  context.patternDesigner = new PatternDesigner();

  // Set webview HTML
  panel.webview.html = getPatternDesignerHtml();

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(
    async message => {
      switch (message.command) {
        case 'createPattern':
          try {
            const pattern = context.patternDesigner!.createStep(
              message.type,
              message.params
            );
            panel.webview.postMessage({ type: 'patternCreated', pattern });
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to create pattern: ${error.message}`
            );
          }
          break;

        case 'validatePattern':
          try {
            const validation = context.patternDesigner!.validatePattern();
            panel.webview.postMessage({ type: 'validation', validation });
          } catch (error) {
            vscode.window.showErrorMessage(
              `Validation failed: ${error.message}`
            );
          }
          break;
      }
    },
    undefined
  );
}

/**
 * Start Device Simulation
 */
async function startDeviceSimulation() {
  const deviceType = await vscode.window.showQuickPick(
    ['vibrator', 'stroker', 'estim', 'tens'],
    { placeHolder: 'Select device type to simulate' }
  );

  if (!deviceType) return;

  try {
    context.simulator = new DeviceSimulator({
      id: `sim_${Date.now()}`,
      name: `Simulated ${deviceType}`,
      type: deviceType
    });

    // Create output channel
    const output = vscode.window.createOutputChannel('Device Simulator');
    output.show();

    // Connect device
    await context.simulator.connect();
    output.appendLine('Device connected');

    // Listen for state changes
    context.simulator.on('stateChanged', state => {
      output.clear();
      output.appendLine('Device State:');
      output.appendLine('--------------');
      output.appendLine(`Connected: ${state.connected}`);
      output.appendLine(`Battery: ${state.batteryLevel}%`);
      output.appendLine('');
      output.appendLine('Metrics:');
      output.appendLine(`Commands: ${state.metrics.commandsReceived}`);
      output.appendLine(
        `Success Rate: ${
          (state.metrics.commandsSucceeded / state.metrics.commandsReceived * 100)
            .toFixed(1)
        }%`
      );
    });

    // Add status bar item
    const statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );
    statusBar.text = `$(plug) ${deviceType} Simulator`;
    statusBar.tooltip = 'Click to show simulator output';
    statusBar.command = 'workbench.action.output.toggleOutput';
    statusBar.show();

    // Handle disposal
    context.simulator.on('disconnected', () => {
      statusBar.dispose();
      output.dispose();
    });
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start simulation: ${error.message}`
    );
  }
}

/**
 * Start Protocol Analyzer
 */
async function startProtocolAnalyzer() {
  context.analyzer = new ProtocolAnalyzer();

  // Create output channel
  const output = vscode.window.createOutputChannel('Protocol Analyzer');
  output.show();

  // Start analysis
  context.analyzer.startAnalysis();

  // Handle messages
  context.analyzer.on('message', message => {
    output.appendLine(
      `[${new Date().toISOString()}] ${message.type} - ${
        message.raw.length
      } bytes`
    );
  });

  // Handle analysis
  context.analyzer.on('analysis', analysis => {
    if (analysis.anomalies.length > 0) {
      output.appendLine('\nAnomalies Detected:');
      analysis.anomalies.forEach(anomaly => {
        output.appendLine(`- ${anomaly.message}`);
      });
    }

    if (analysis.patternDetection.repeatingSequences.length > 0) {
      output.appendLine('\nCommon Patterns:');
      analysis.patternDetection.repeatingSequences.forEach(sequence => {
        output.appendLine(`- ${sequence.join(' → ')}`);
      });
    }

    output.appendLine('\nTiming Analysis:');
    output.appendLine(
      `Avg Interval: ${
        analysis.timingAnalysis.averageInterval.toFixed(2)
      }ms`
    );
    output.appendLine(
      `Burst Detected: ${
        analysis.timingAnalysis.burstDetected ? 'Yes' : 'No'
      }`
    );
  });

  // Add status bar item
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  statusBar.text = '$(pulse) Protocol Analyzer';
  statusBar.tooltip = 'Click to show analyzer output';
  statusBar.command = 'workbench.action.output.toggleOutput';
  statusBar.show();
}

/**
 * Insert Pattern Template
 */
async function insertPatternTemplate() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }

  const deviceTypes = Object.keys(DevicePatterns);
  const deviceType = await vscode.window.showQuickPick(
    deviceTypes,
    { placeHolder: 'Select device type' }
  );

  if (!deviceType) return;

  const patterns = Object.keys(DevicePatterns[deviceType]);
  const patternName = await vscode.window.showQuickPick(
    patterns,
    { placeHolder: 'Select pattern' }
  );

  if (!patternName) return;

  const pattern = DevicePatterns[deviceType][patternName];
  const template = JSON.stringify(pattern, null, 2);

  editor.edit(editBuilder => {
    editBuilder.insert(editor.selection.active, template);
  });
}

/**
 * Validate Current Pattern
 */
async function validateCurrentPattern() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }

  try {
    const text = editor.document.getText(editor.selection);
    const pattern = JSON.parse(text);

    const designer = new PatternDesigner();
    designer.importPattern(pattern);
    const validation = designer.validatePattern();

    if (validation.valid) {
      vscode.window.showInformationMessage('Pattern is valid ✓');
    } else {
      const details = validation.errors.join('\n');
      vscode.window.showErrorMessage(
        `Pattern validation failed:\n${details}`
      );
    }

    if (validation.warnings.length > 0) {
      const details = validation.warnings.join('\n');
      vscode.window.showWarningMessage(
        `Pattern warnings:\n${details}`
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to validate pattern: ${error.message}`
    );
  }
}

/**
 * Register Language Features
 */
function registerProviders(context: vscode.ExtensionContext) {
  // Pattern file type
  const PATTERN_SELECTOR: vscode.DocumentSelector = {
    language: 'json',
    pattern: '**/*.pattern.json'
  };

  // Completion provider
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    PATTERN_SELECTOR,
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const linePrefix = document
          .lineAt(position)
          .text.substr(0, position.character);

        if (linePrefix.endsWith('"type": "')) {
          return Object.values(MetricType).map(type => {
            const item = new vscode.CompletionItem(
              type,
              vscode.CompletionItemKind.EnumMember
            );
            item.detail = `Pattern type: ${type}`;
            return item;
          });
        }

        return undefined;
      }
    }
  );

  // Hover provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    PATTERN_SELECTOR,
    {
      provideHover(document, position, token) {
        const range = document.getWordRangeAtPosition(position);
        const word = document.getText(range);

        // Show description for pattern types
        if (Object.values(MetricType).includes(word as any)) {
          return new vscode.Hover(getPatternTypeDescription(word));
        }

        return undefined;
      }
    }
  );

  // Diagnostic provider
  const diagnosticCollection = vscode.languages.createDiagnosticCollection(
    'aeims-patterns'
  );

  const diagnosticsProvider = vscode.workspace.onDidChangeTextDocument(
    event => {
      if (!event.document.fileName.endsWith('.pattern.json')) return;

      const diagnostics: vscode.Diagnostic[] = [];

      try {
        const pattern = JSON.parse(event.document.getText());
        const designer = new PatternDesigner();
        designer.importPattern(pattern);
        const validation = designer.validatePattern();

        if (!validation.valid) {
          validation.errors.forEach(error => {
            diagnostics.push(new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 0),
              error,
              vscode.DiagnosticSeverity.Error
            ));
          });
        }

        validation.warnings.forEach(warning => {
          diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            warning,
            vscode.DiagnosticSeverity.Warning
          ));
        });
      } catch (error) {
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `Invalid pattern: ${error.message}`,
          vscode.DiagnosticSeverity.Error
        ));
      }

      diagnosticCollection.set(event.document.uri, diagnostics);
    }
  );

  context.subscriptions.push(
    completionProvider,
    hoverProvider,
    diagnosticsProvider,
    diagnosticCollection
  );
}

/**
 * Get Pattern Type Description
 */
function getPatternTypeDescription(type: string): string {
  switch (type) {
    case 'wave':
      return 'Wave pattern with configurable frequency, amplitude and shape.';
    case 'sequence':
      return 'Sequence of steps with configurable durations and intensities.';
    case 'ramp':
      return 'Gradual transition between start and end intensities.';
    case 'constant':
      return 'Constant intensity pattern.';
    default:
      return 'Unknown pattern type';
  }
}

/**
 * Get Pattern Designer HTML
 */
function getPatternDesignerHtml(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pattern Designer</title>
      <style>
        body {
          padding: 20px;
          color: var(--vscode-editor-foreground);
          background-color: var(--vscode-editor-background);
          font-family: var(--vscode-editor-font-family);
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        .form-group {
          margin-bottom: 1em;
        }
        label {
          display: block;
          margin-bottom: 0.5em;
        }
        select, input {
          width: 100%;
          padding: 0.5em;
          margin-bottom: 1em;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
        }
        button {
          padding: 0.5em 1em;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          cursor: pointer;
        }
        button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        pre {
          background: var(--vscode-textBlockQuote-background);
          padding: 1em;
          overflow: auto;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Pattern Designer</h1>
        
        <div class="form-group">
          <label for="patternType">Pattern Type</label>
          <select id="patternType">
            <option value="wave">Wave</option>
            <option value="sequence">Sequence</option>
            <option value="ramp">Ramp</option>
            <option value="constant">Constant</option>
          </select>
        </div>

        <div id="parameters">
          <!-- Dynamically populated based on pattern type -->
        </div>

        <button onclick="createPattern()">Create Pattern</button>
        <button onclick="validatePattern()">Validate</button>

        <h2>Preview</h2>
        <pre id="preview"></pre>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        let currentPattern = null;

        // Update parameters form based on pattern type
        document.getElementById('patternType').addEventListener('change', (e) => {
          const type = e.target.value;
          const params = document.getElementById('parameters');
          
          // Clear existing fields
          params.innerHTML = '';
          
          // Add fields based on type
          switch (type) {
            case 'wave':
              params.innerHTML = \`
                <div class="form-group">
                  <label>Min Intensity</label>
                  <input type="number" id="minIntensity" min="0" max="1" step="0.1" value="0">
                </div>
                <div class="form-group">
                  <label>Max Intensity</label>
                  <input type="number" id="maxIntensity" min="0" max="1" step="0.1" value="1">
                </div>
                <div class="form-group">
                  <label>Period (ms)</label>
                  <input type="number" id="period" min="100" step="100" value="1000">
                </div>
              \`;
              break;
              
            case 'sequence':
              params.innerHTML = \`
                <div class="form-group">
                  <label>Steps</label>
                  <div id="steps">
                    <div class="step">
                      <input type="number" placeholder="Intensity" min="0" max="1" step="0.1">
                      <input type="number" placeholder="Duration (ms)" min="100" step="100">
                    </div>
                  </div>
                  <button onclick="addStep()">Add Step</button>
                </div>
              \`;
              break;
              
            case 'ramp':
              params.innerHTML = \`
                <div class="form-group">
                  <label>Start Intensity</label>
                  <input type="number" id="startIntensity" min="0" max="1" step="0.1" value="0">
                </div>
                <div class="form-group">
                  <label>End Intensity</label>
                  <input type="number" id="endIntensity" min="0" max="1" step="0.1" value="1">
                </div>
                <div class="form-group">
                  <label>Duration (ms)</label>
                  <input type="number" id="duration" min="100" step="100" value="1000">
                </div>
              \`;
              break;
              
            case 'constant':
              params.innerHTML = \`
                <div class="form-group">
                  <label>Intensity</label>
                  <input type="number" id="intensity" min="0" max="1" step="0.1" value="0.5">
                </div>
              \`;
              break;
          }
        });

        function addStep() {
          const steps = document.getElementById('steps');
          const step = document.createElement('div');
          step.className = 'step';
          step.innerHTML = \`
            <input type="number" placeholder="Intensity" min="0" max="1" step="0.1">
            <input type="number" placeholder="Duration (ms)" min="100" step="100">
          \`;
          steps.appendChild(step);
        }

        function createPattern() {
          const type = document.getElementById('patternType').value;
          const params = {};
          
          switch (type) {
            case 'wave':
              params.minIntensity = parseFloat(document.getElementById('minIntensity').value);
              params.maxIntensity = parseFloat(document.getElementById('maxIntensity').value);
              params.period = parseInt(document.getElementById('period').value);
              break;
              
            case 'sequence':
              params.steps = Array.from(document.querySelectorAll('.step')).map(step => {
                const [intensity, duration] = step.querySelectorAll('input');
                return {
                  intensity: parseFloat(intensity.value),
                  duration: parseInt(duration.value)
                };
              });
              break;
              
            case 'ramp':
              params.startIntensity = parseFloat(document.getElementById('startIntensity').value);
              params.endIntensity = parseFloat(document.getElementById('endIntensity').value);
              params.duration = parseInt(document.getElementById('duration').value);
              break;
              
            case 'constant':
              params.intensity = parseFloat(document.getElementById('intensity').value);
              break;
          }
          
          vscode.postMessage({
            command: 'createPattern',
            type,
            params
          });
        }

        function validatePattern() {
          if (!currentPattern) return;
          
          vscode.postMessage({
            command: 'validatePattern',
            pattern: currentPattern
          });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
          const message = event.data;
          switch (message.type) {
            case 'patternCreated':
              currentPattern = message.pattern;
              document.getElementById('preview').textContent = 
                JSON.stringify(message.pattern, null, 2);
              break;
              
            case 'validation':
              const validation = message.validation;
              if (validation.valid) {
                vscode.postMessage({
                  type: 'info',
                  text: 'Pattern is valid'
                });
              } else {
                vscode.postMessage({
                  type: 'error',
                  text: 'Pattern validation failed:\\n' + 
                    validation.errors.join('\\n')
                });
              }
              break;
          }
        });
      </script>
    </body>
    </html>
  `;
}

/**
 * Extension Deactivation
 */
export function deactivate() {
  if (context.simulator) {
    context.simulator.disconnect();
  }
  if (context.analyzer) {
    context.analyzer.stopAnalysis();
  }
}
