// API endpoints
const API_ENDPOINTS = {
    TOY: '/api/toys',
    PATTERN: '/api/patterns',
    CONTROL: '/api/control'
};

// Global state
let currentToys = [];
let currentPatterns = [];
let selectedToy = null;
let websocketConnection = null;

// Toast notification helper
function showToast(message, type = 'info') {
    const toast = new bootstrap.Toast(document.getElementById('toast'));
    const toastBody = document.getElementById('toastBody');
    toastBody.textContent = message;
    toastBody.className = `toast-body bg-${type} text-white`;
    toast.show();
}

// Fetch and display toys
async function loadToys() {
    try {
        const response = await fetch(API_ENDPOINTS.TOY);
        if (!response.ok) throw new Error('Failed to fetch toys');
        
        currentToys = await response.json();
        displayToys();
        updateToySelects();
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

// Display toys in the grid
function displayToys() {
    const grid = document.getElementById('toysGrid');
    grid.innerHTML = currentToys.map(toy => `
        <div class="col-md-4 mb-4">
            <div class="card toy-card">
                <div class="card-body">
                    <h5 class="card-title">${toy.name}</h5>
                    <p class="card-text">
                        <small class="text-muted">${toy.manufacturer} - ${toy.model}</small>
                    </p>
                    <div class="mb-3">
                        <span class="status-badge ${getStatusClass(toy.status)}">
                            ${toy.status}
                        </span>
                    </div>
                    <div class="d-grid gap-2">
                        <button class="btn btn-primary-custom btn-sm" onclick="controlToy('${toy.id}')">
                            Control
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="disconnectToy('${toy.id}')">
                            Disconnect
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Update toy selection dropdowns
function updateToySelects() {
    const selects = ['controlToySelect', 'testToySelect'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        select.innerHTML = '<option value="">Choose a toy...</option>' +
            currentToys.map(toy => `
                <option value="${toy.id}">${toy.name}</option>
            `).join('');
    });
}

// Get status badge class
function getStatusClass(status) {
    const statusClasses = {
        'connected': 'status-connected',
        'disconnected': 'status-disconnected',
        'error': 'status-error'
    };
    return statusClasses[status] || 'status-disconnected';
}

// Add new toy
async function addToy() {
    const form = document.getElementById('addToyForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const toyData = {
        name: document.getElementById('toyName').value,
        model: document.getElementById('toyModel').value,
        manufacturer: document.getElementById('toyManufacturer').value,
        category: document.getElementById('toyCategory').value,
        device_id: document.getElementById('toyDeviceId').value,
        connection_type: document.getElementById('toyConnectionType').value
    };

    try {
        const response = await fetch(API_ENDPOINTS.TOY, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(toyData)
        });

        if (!response.ok) throw new Error('Failed to add toy');
        
        showToast('Toy added successfully', 'success');
        loadToys();
        bootstrap.Modal.getInstance(document.getElementById('addToyModal')).hide();
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

// Control toy
async function controlToy(toyId) {
    selectedToy = currentToys.find(t => t.id === toyId);
    if (!selectedToy) return;

    document.getElementById('controlToySelect').value = toyId;
    document.getElementById('controlPanel').style.display = 'block';
    updateToyStatus();
    
    // Switch to control tab
    const controlTab = document.getElementById('control-tab');
    bootstrap.Tab.getOrCreateInstance(controlTab).show();
}

// Update toy status information
async function updateToyStatus() {
    if (!selectedToy) return;

    const statusInfo = document.getElementById('toyStatusInfo');
    try {
        const response = await fetch(`${API_ENDPOINTS.TOY}/${selectedToy.id}/status`);
        if (!response.ok) throw new Error('Failed to fetch toy status');
        
        const status = await response.json();
        statusInfo.innerHTML = `
            <div class="mb-2">
                <strong>Status:</strong> 
                <span class="status-badge ${getStatusClass(status.state)}">${status.state}</span>
            </div>
            <div class="mb-2">
                <strong>Battery:</strong> ${status.battery}%
            </div>
            <div class="mb-2">
                <strong>Connection:</strong> ${status.connection_type}
            </div>
            <div class="mb-2">
                <strong>Last Active:</strong> ${new Date(status.last_active).toLocaleString()}
            </div>
        `;
    } catch (error) {
        statusInfo.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
    }
}

// Send custom pattern to toy
async function sendCustomPattern() {
    if (!selectedToy) return;

    const pattern = {
        intensity: parseInt(document.getElementById('intensitySlider').value),
        duration: parseInt(document.getElementById('durationInput').value) * 1000,
        mode: document.getElementById('modeSelect').value
    };

    try {
        const response = await fetch(`${API_ENDPOINTS.CONTROL}/${selectedToy.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(pattern)
        });

        if (!response.ok) throw new Error('Failed to send pattern');
        showToast('Pattern sent successfully', 'success');
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

// Stop toy
async function stopToy() {
    if (!selectedToy) return;

    try {
        const response = await fetch(`${API_ENDPOINTS.CONTROL}/${selectedToy.id}/stop`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to stop toy');
        showToast('Toy stopped successfully', 'success');
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

// Load and display patterns
async function loadPatterns() {
    try {
        const response = await fetch(API_ENDPOINTS.PATTERN);
        if (!response.ok) throw new Error('Failed to fetch patterns');
        
        currentPatterns = await response.json();
        displayPatterns();
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

// Display patterns in the grid
function displayPatterns() {
    const grid = document.getElementById('patternsGrid');
    grid.innerHTML = currentPatterns.map(pattern => `
        <div class="col-md-4 mb-4">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">${pattern.name}</h5>
                    <p class="card-text">${pattern.description}</p>
                    <div class="mb-3">
                        <small class="text-muted">Type: ${pattern.type}</small>
                    </div>
                    <div class="d-grid gap-2">
                        <button class="btn btn-primary-custom btn-sm" onclick="usePattern('${pattern.id}')">
                            Use Pattern
                        </button>
                        ${pattern.is_owner ? `
                            <button class="btn btn-danger btn-sm" onclick="deletePattern('${pattern.id}')">
                                Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Create new pattern
async function createPattern() {
    const form = document.getElementById('createPatternForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const patternData = {
        name: document.getElementById('patternName').value,
        description: document.getElementById('patternDescription').value,
        type: document.getElementById('patternType').value,
        duration: parseInt(document.getElementById('patternDuration').value),
        is_public: document.getElementById('patternPublic').checked,
        // Add pattern-specific fields based on type
        settings: getPatternSettings()
    };

    try {
        const response = await fetch(API_ENDPOINTS.PATTERN, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(patternData)
        });

        if (!response.ok) throw new Error('Failed to create pattern');
        
        showToast('Pattern created successfully', 'success');
        loadPatterns();
        bootstrap.Modal.getInstance(document.getElementById('createPatternModal')).hide();
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

// Get pattern-specific settings based on type
function getPatternSettings() {
    const type = document.getElementById('patternType').value;
    const settings = {};

    switch (type) {
        case 'simple':
            settings.intensity = parseInt(document.getElementById('simpleIntensity').value);
            break;
        case 'wave':
            settings.min_intensity = parseInt(document.getElementById('waveMinIntensity').value);
            settings.max_intensity = parseInt(document.getElementById('waveMaxIntensity').value);
            settings.frequency = parseInt(document.getElementById('waveFrequency').value);
            break;
        case 'pulse':
            settings.intensity = parseInt(document.getElementById('pulseIntensity').value);
            settings.on_duration = parseInt(document.getElementById('pulseOnDuration').value);
            settings.off_duration = parseInt(document.getElementById('pulseOffDuration').value);
            break;
        case 'escalation':
            settings.start_intensity = parseInt(document.getElementById('escalationStartIntensity').value);
            settings.end_intensity = parseInt(document.getElementById('escalationEndIntensity').value);
            settings.steps = parseInt(document.getElementById('escalationSteps').value);
            break;
        case 'random':
            settings.min_intensity = parseInt(document.getElementById('randomMinIntensity').value);
            settings.max_intensity = parseInt(document.getElementById('randomMaxIntensity').value);
            settings.interval = parseInt(document.getElementById('randomInterval').value);
            break;
    }

    return settings;
}

// Update pattern form fields based on selected type
function updatePatternFields() {
    const type = document.getElementById('patternType').value;
    const fieldsContainer = document.getElementById('patternFields');
    
    const fieldsets = {
        simple: `
            <div class="mb-3">
                <label class="form-label">Intensity</label>
                <input type="range" class="form-range" id="simpleIntensity" min="0" max="100" value="50">
            </div>
        `,
        wave: `
            <div class="mb-3">
                <label class="form-label">Minimum Intensity</label>
                <input type="range" class="form-range" id="waveMinIntensity" min="0" max="100" value="20">
            </div>
            <div class="mb-3">
                <label class="form-label">Maximum Intensity</label>
                <input type="range" class="form-range" id="waveMaxIntensity" min="0" max="100" value="80">
            </div>
            <div class="mb-3">
                <label class="form-label">Frequency (Hz)</label>
                <input type="number" class="form-control" id="waveFrequency" min="0.1" max="10" step="0.1" value="1">
            </div>
        `,
        pulse: `
            <div class="mb-3">
                <label class="form-label">Intensity</label>
                <input type="range" class="form-range" id="pulseIntensity" min="0" max="100" value="50">
            </div>
            <div class="mb-3">
                <label class="form-label">On Duration (ms)</label>
                <input type="number" class="form-control" id="pulseOnDuration" min="100" max="5000" step="100" value="1000">
            </div>
            <div class="mb-3">
                <label class="form-label">Off Duration (ms)</label>
                <input type="number" class="form-control" id="pulseOffDuration" min="100" max="5000" step="100" value="1000">
            </div>
        `,
        escalation: `
            <div class="mb-3">
                <label class="form-label">Start Intensity</label>
                <input type="range" class="form-range" id="escalationStartIntensity" min="0" max="100" value="20">
            </div>
            <div class="mb-3">
                <label class="form-label">End Intensity</label>
                <input type="range" class="form-range" id="escalationEndIntensity" min="0" max="100" value="80">
            </div>
            <div class="mb-3">
                <label class="form-label">Steps</label>
                <input type="number" class="form-control" id="escalationSteps" min="2" max="10" value="5">
            </div>
        `,
        random: `
            <div class="mb-3">
                <label class="form-label">Minimum Intensity</label>
                <input type="range" class="form-range" id="randomMinIntensity" min="0" max="100" value="20">
            </div>
            <div class="mb-3">
                <label class="form-label">Maximum Intensity</label>
                <input type="range" class="form-range" id="randomMaxIntensity" min="0" max="100" value="80">
            </div>
            <div class="mb-3">
                <label class="form-label">Change Interval (ms)</label>
                <input type="number" class="form-control" id="randomInterval" min="100" max="5000" step="100" value="1000">
            </div>
        `
    };

    fieldsContainer.innerHTML = fieldsets[type] || '';
}

// Use existing pattern
async function usePattern(patternId) {
    if (!selectedToy) {
        showToast('Please select a toy first', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_ENDPOINTS.PATTERN}/${patternId}/use/${selectedToy.id}`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to use pattern');
        showToast('Pattern applied successfully', 'success');
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

// Delete pattern
async function deletePattern(patternId) {
    if (!confirm('Are you sure you want to delete this pattern?')) return;

    try {
        const response = await fetch(`${API_ENDPOINTS.PATTERN}/${patternId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete pattern');
        
        showToast('Pattern deleted successfully', 'success');
        loadPatterns();
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

// Run toy test
async function runTest() {
    const toyId = document.getElementById('testToySelect').value;
    const testType = document.getElementById('testTypeSelect').value;
    
    if (!toyId) {
        showToast('Please select a toy', 'warning');
        return;
    }

    const testResults = document.getElementById('testResults');
    const testSteps = document.getElementById('testSteps');
    testResults.style.display = 'block';
    testSteps.innerHTML = '<div class="text-center"><div class="spinner-border"></div></div>';

    try {
        const response = await fetch(`${API_ENDPOINTS.TOY}/${toyId}/test/${testType}`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Test failed');
        
        const results = await response.json();
        displayTestResults(results);
    } catch (error) {
        testSteps.innerHTML = `
            <div class="test-step failed">
                <i class="fas fa-times-circle me-2"></i>${error.message}
            </div>
        `;
    }
}

// Display test results
function displayTestResults(results) {
    const testSteps = document.getElementById('testSteps');
    testSteps.innerHTML = results.steps.map(step => `
        <div class="test-step ${step.status}">
            <i class="fas fa-${step.status === 'passed' ? 'check-circle' : 'times-circle'} me-2"></i>
            ${step.message}
        </div>
    `).join('');
}

// Update intensity display
function updateIntensity(value) {
    document.getElementById('intensityValue').textContent = value;
}

// Refresh data
function refreshData() {
    loadToys();
    loadPatterns();
}

// Initialize WebSocket connection
function initWebSocket() {
    websocketConnection = new WebSocket('ws://localhost:12345');
    
    websocketConnection.onopen = () => {
        console.log('WebSocket connected');
        document.getElementById('connectionStatus').innerHTML = `
            <i class="fas fa-circle text-success"></i> Connected
        `;
    };

    websocketConnection.onclose = () => {
        console.log('WebSocket disconnected');
        document.getElementById('connectionStatus').innerHTML = `
            <i class="fas fa-circle text-danger"></i> Disconnected
        `;
        // Attempt to reconnect after 5 seconds
        setTimeout(initWebSocket, 5000);
    };

    websocketConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'toy_status':
            updateToyStatus();
            break;
        case 'pattern_complete':
            showToast('Pattern completed', 'info');
            break;
        case 'error':
            showToast(data.message, 'danger');
            break;
    }
}

// Filter toys based on selected criteria
function filterToys() {
    const manufacturer = document.getElementById('manufacturerFilter').value;
    const category = document.getElementById('categoryFilter').value;
    const status = document.getElementById('statusFilter').value;
    const search = document.getElementById('searchInput').value.toLowerCase();

    const filteredToys = currentToys.filter(toy => {
        return (!manufacturer || toy.manufacturer === manufacturer) &&
               (!category || toy.category === category) &&
               (!status || toy.status === status) &&
               (!search || 
                toy.name.toLowerCase().includes(search) || 
                toy.model.toLowerCase().includes(search));
    });

    const grid = document.getElementById('toysGrid');
    grid.innerHTML = filteredToys.length ? 
        displayToys(filteredToys) :
        '<div class="col-12 text-center"><p>No toys found matching the criteria</p></div>';
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    refreshData();
    initWebSocket();
    updatePatternFields();
});
