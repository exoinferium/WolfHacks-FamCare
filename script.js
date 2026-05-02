// FamCare - JavaScript Logic
const API_BASE_URL = 'http://localhost:5000/api';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRecords();
    initializeChatbot();
});

// ============ NAVIGATION ============
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Show selected section
    document.getElementById(sectionId).classList.add('active');

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    event.target.classList.add('active');

    // Reload records when viewing records section
    if (sectionId === 'records') {
        loadRecords();
    }
}

// ============ CHATBOT INITIALIZATION ============
function initializeChatbot() {
    // Initialize chat on page load
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div class="chat-message bot-message">
                <p>👋 Hi! I'm FamCare Bot. I'm here to help diagnose your symptoms using the Canadian Triage and Acuity Scale (CTAS). Describe your symptoms and I'll provide an assessment. How can I assist you today?</p>
            </div>
        `;
    }
}

// ============ CHATBOT FUNCTIONS ============
function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message) return;

    const chatMessages = document.getElementById('chat-messages');
    
    // Add user message
    const userMessageDiv = document.createElement('div');
    userMessageDiv.className = 'chat-message user-message';
    userMessageDiv.innerHTML = `<p>${escapeHtml(message)}</p>`;
    chatMessages.appendChild(userMessageDiv);

    // Clear input
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Get bot response
    fetch(`${API_BASE_URL}/diagnose`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ symptoms: message })
    })
    .then(response => response.json())
    .then(data => {
        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'chat-message bot-message';
        
        const diagnosis = data.diagnosis || 'Unable to determine diagnosis';
        const recommendation = data.recommendation || 'Please consult a healthcare professional.';
        const ctas = data.ctas || 'N/A';
        
        botMessageDiv.innerHTML = `
            <p><strong>📋 Diagnosis:</strong> ${escapeHtml(diagnosis)}</p>
            <p><strong>🏥 CTAS Level:</strong> ${escapeHtml(ctas)}</p>
            <p><strong>💡 Recommendation:</strong> ${escapeHtml(recommendation)}</p>
        `;
        chatMessages.appendChild(botMessageDiv);
        
        // Add to history
        addChatToHistory(message, diagnosis);
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    })
    .catch(error => {
        console.error('Error:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'chat-message bot-message';
        errorDiv.innerHTML = `<p>❌ Sorry, I encountered an error. Please make sure the backend server is running on port 5000.</p>`;
        chatMessages.appendChild(errorDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

function addChatToHistory(query, response) {
    let chatHistory = JSON.parse(localStorage.getItem('famcareChatHistory')) || [];
    chatHistory.push({
        id: Date.now(),
        query: query,
        response: response,
        timestamp: new Date().toISOString()
    });
    // Keep only last 50 conversations
    if (chatHistory.length > 50) {
        chatHistory = chatHistory.slice(-50);
    }
    localStorage.setItem('famcareChatHistory', JSON.stringify(chatHistory));
    displayChatHistory();
}

function displayChatHistory() {
    const chatHistory = JSON.parse(localStorage.getItem('famcareChatHistory')) || [];
    const historyLog = document.getElementById('chat-history-log');

    if (chatHistory.length === 0) {
        historyLog.innerHTML = '<p class="empty-state">No conversations yet. Start chatting!</p>';
        return;
    }

    historyLog.innerHTML = chatHistory.map(chat => `
        <div class="chat-history-item">
            <div class="chat-history-date">${new Date(chat.timestamp).toLocaleDateString()} ${new Date(chat.timestamp).toLocaleTimeString()}</div>
            <div class="chat-history-query"><strong>Q:</strong> ${escapeHtml(chat.query.substring(0, 50))}${chat.query.length > 50 ? '...' : ''}</div>
            <div class="chat-history-response"><strong>A:</strong> ${escapeHtml(chat.response.substring(0, 50))}${chat.response.length > 50 ? '...' : ''}</div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ ASSESSMENT LOGIC ============
let currentStep = 1;

function nextStep() {
    // Validate current step
    if (!validateStep(currentStep)) {
        alert('Please fill in all required fields');
        return;
    }

    currentStep++;
    updateStepDisplay();
}

function prevStep() {
    currentStep--;
    updateStepDisplay();
}

function validateStep(step) {
    if (step === 1) {
        const name = document.getElementById('patientName').value.trim();
        const age = document.getElementById('patientAge').value;
        return name && age;
    } else if (step === 2) {
        const symptoms = document.getElementById('symptoms').value.trim();
        const duration = document.getElementById('symptomDuration').value;
        const severity = document.querySelector('input[name="severity"]:checked');
        return symptoms && duration && severity;
    }
    return true;
}

function updateStepDisplay() {
    document.querySelectorAll('.assessment-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(`step${currentStep}`).classList.add('active');
    window.scrollTo(0, 0);
}

function submitAssessment() {
    // Collect data
    const assessment = {
        patientName: document.getElementById('patientName').value,
        patientAge: parseInt(document.getElementById('patientAge').value),
        patientGender: document.getElementById('patientGender').value,
        symptoms: document.getElementById('symptoms').value,
        symptomDuration: document.getElementById('symptomDuration').value,
        severity: document.querySelector('input[name="severity"]:checked').value,
        hasFever: document.getElementById('hasFever').checked,
        emergencySymptoms: getEmergencySymptoms(),
        chronicConditions: document.getElementById('chronicConditions').value,
        medications: document.getElementById('medications').value,
        timestamp: new Date().toISOString()
    };

    // Analyze and display results
    const result = analyzeAssessment(assessment);
    displayResults(result, assessment);

    // Store for later
    window.currentAssessment = { result, assessment };
}

function getEmergencySymptoms() {
    const emergencySymptoms = [
        'difficulty-breathing',
        'chest-pain',
        'confusion',
        'severe-pain',
        'uncontrollable-bleeding',
        'loss-of-consciousness',
        'allergic-reaction',
        'poisoning'
    ];

    return emergencySymptoms
        .filter(id => document.getElementById(id).checked)
        .map(id => id.replace(/-/g, ' '));
}

function analyzeAssessment(assessment) {
    let careLevel = 'self-care';
    let score = 0;

    // Emergency red flags
    const emergencyFlags = [
        'chest pain',
        'difficulty breathing',
        'loss of consciousness',
        'uncontrollable bleeding',
        'confusion',
        'severe pain',
        'poisoning',
        'allergic reaction'
    ];

    const symptomsLower = assessment.symptoms.toLowerCase();

    // Check for emergency symptoms
    for (let flag of emergencyFlags) {
        if (symptomsLower.includes(flag) || assessment.emergencySymptoms.includes(flag)) {
            careLevel = 'emergency';
            score = 3;
            break;
        }
    }

    // If not emergency, check for urgent symptoms
    if (careLevel !== 'emergency') {
        const urgentKeywords = [
            'severe',
            'difficulty',
            'uncontrollable',
            'persistent',
            'worsening',
            'sudden',
            'intense'
        ];

        for (let keyword of urgentKeywords) {
            if (symptomsLower.includes(keyword)) {
                careLevel = 'urgent-care';
                score = 2;
                break;
            }
        }
    }

    // Check severity level
    if (assessment.severity === 'Severe' && careLevel === 'self-care') {
        careLevel = 'urgent-care';
        score = 2;
    } else if (assessment.severity === 'Moderate' && careLevel === 'self-care') {
        careLevel = 'urgent-care';
        score = 2;
    }

    // Check fever with other conditions
    if (assessment.hasFever && assessment.severity !== 'Mild') {
        if (careLevel === 'self-care') {
            careLevel = 'urgent-care';
            score = 2;
        }
    }

    // Check chronic conditions
    if (assessment.chronicConditions.toLowerCase() !== 'none' && 
        assessment.chronicConditions.trim() !== '') {
        if (careLevel === 'self-care') {
            careLevel = 'urgent-care';
            score = 2;
        }
    }

    // Generate recommendations
    const recommendations = generateRecommendations(careLevel, assessment);

    return {
        careLevel,
        score,
        recommendations,
        warningSigns: getWarningSignsForCondition(assessment.symptoms)
    };
}

function generateRecommendations(careLevel, assessment) {
    const recommendations = {
        'self-care': [
            'Rest and stay hydrated',
            'Use over-the-counter pain relievers if needed',
            'Monitor your symptoms regularly',
            'Keep a record of any changes',
            'Maintain good hygiene',
            'Avoid strenuous activities',
            'If symptoms persist beyond 7 days, consult a healthcare provider'
        ],
        'urgent-care': [
            'Visit an urgent care clinic or walk-in clinic',
            'Schedule an appointment with your primary care doctor',
            'Seek care within the next few hours',
            'Do not delay - symptoms require professional evaluation',
            'Bring a list of your medications and symptoms',
            'Have your insurance card ready',
            'Monitor for any worsening symptoms'
        ],
        'emergency': [
            'CALL 911 IMMEDIATELY',
            'Do not wait or delay',
            'Do not drive yourself if possible',
            'Inform emergency responders about your symptoms',
            'If choking, perform the Heimlich maneuver',
            'If unconscious, place in recovery position',
            'Have your medical history ready for paramedics',
            'Emergency care is critical - seek help now'
        ]
    };

    return recommendations[careLevel] || recommendations['self-care'];
}

function getWarningSignsForCondition(symptoms) {
    const symptomsLower = symptoms.toLowerCase();
    const warningSigns = [];

    if (symptomsLower.includes('fever')) {
        warningSigns.push('Fever above 103°F (39.4°C)');
        warningSigns.push('Fever lasting more than 3 days');
        warningSigns.push('Fever accompanied by confusion or rash');
    }

    if (symptomsLower.includes('cough') || symptomsLower.includes('cold')) {
        warningSigns.push('Cough lasting more than 2 weeks');
        warningSigns.push('Coughing up blood or dark phlegm');
        warningSigns.push('Shortness of breath');
    }

    if (symptomsLower.includes('headache')) {
        warningSigns.push('Sudden severe headache');
        warningSigns.push('Headache with stiff neck and fever');
        warningSigns.push('Persistent headache with vision changes');
    }

    if (symptomsLower.includes('stomach') || symptomsLower.includes('abdominal')) {
        warningSigns.push('Severe abdominal pain');
        warningSigns.push('Vomiting for more than 4 hours');
        warningSigns.push('Blood in vomit or stool');
    }

    if (warningSigns.length === 0) {
        warningSigns.push('Any symptom that worsens significantly');
        warningSigns.push('Symptoms that don\'t improve after 1 week');
        warningSigns.push('Development of new symptoms');
    }

    return warningSigns;
}

function displayResults(result, assessment) {
    const resultsDiv = document.getElementById('resultContent');
    const assessmentDiv = document.getElementById('step3');
    assessmentDiv.style.display = 'none';
    document.getElementById('results').style.display = 'block';

    const careColor = result.careLevel === 'emergency' ? '#c0392b' : 
                     result.careLevel === 'urgent-care' ? '#f39c12' : '#27ae60';
    
    const careEmoji = result.careLevel === 'emergency' ? '🚨' : 
                     result.careLevel === 'urgent-care' ? '⚠️' : '✅';

    const careLevelText = result.careLevel === 'emergency' ? 'EMERGENCY - SEEK IMMEDIATE CARE' :
                         result.careLevel === 'urgent-care' ? 'URGENT CARE - SEEK CARE SOON' :
                         'SELF-CARE - Safe to manage at home';

    let html = `
        <div class="result-card ${result.careLevel}">
            <div class="result-title">${careEmoji} ${careLevelText}</div>
            
            <h4>Patient Information:</h4>
            <p><strong>${assessment.patientName}</strong>, Age ${assessment.patientAge}${assessment.patientGender ? ' (' + assessment.patientGender + ')' : ''}</p>
            
            <h4>Assessment Summary:</h4>
            <p><strong>Symptoms:</strong> ${assessment.symptoms}</p>
            <p><strong>Duration:</strong> ${assessment.symptomDuration}</p>
            <p><strong>Severity:</strong> ${assessment.severity}</p>
            
            <h4>Recommended Care Steps:</h4>
            <ul class="result-recommendations">
                ${result.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
            
            ${result.warningSigns && result.warningSigns.length > 0 ? `
                <div class="warning-signs">
                    <h4>⚠️ Watch for these warning signs:</h4>
                    <ul>
                        ${result.warningSigns.map(sign => `<li>${sign}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    resultsDiv.innerHTML = html;
    window.scrollTo(0, 0);
}

function resetAssessment() {
    // Reset form
    document.getElementById('patientName').value = '';
    document.getElementById('patientAge').value = '';
    document.getElementById('patientGender').value = '';
    document.getElementById('symptoms').value = '';
    document.getElementById('symptomDuration').value = '';
    document.querySelector('input[name="severity"]').checked = false;
    document.getElementById('hasFever').checked = false;
    document.getElementById('chronicConditions').value = '';
    document.getElementById('medications').value = '';

    // Reset emergency checkboxes
    document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(box => {
        box.checked = false;
    });

    // Reset display
    currentStep = 1;
    document.getElementById('results').style.display = 'none';
    document.getElementById('step3').style.display = 'block';
    updateStepDisplay();
}

function saveAssessment() {
    if (!window.currentAssessment) {
        alert('No assessment to save');
        return;
    }

    const { result, assessment } = window.currentAssessment;

    // Try to save to backend
    fetch(`${API_BASE_URL}/assessment-record`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            patientName: assessment.patientName,
            patientAge: assessment.patientAge,
            patientGender: assessment.patientGender,
            symptoms: assessment.symptoms,
            symptomDuration: assessment.symptomDuration,
            severity: assessment.severity,
            careLevel: result.careLevel,
            hasFever: assessment.hasFever,
            chronicConditions: assessment.chronicConditions,
            medications: assessment.medications,
            timestamp: assessment.timestamp
        })
    }).then(response => {
        if (response.ok) {
            alert('Assessment saved successfully!');
            // Reload records
            loadRecords();
        } else {
            // Fallback to local storage
            saveToLocalStorage(assessment, result);
        }
    }).catch(() => {
        // Fallback to local storage
        saveToLocalStorage(assessment, result);
    });

    function saveToLocalStorage(assessment, result) {
        let records = JSON.parse(localStorage.getItem('famcareRecords')) || [];
        records.push({
            id: Date.now(),
            ...assessment,
            careLevel: result.careLevel
        });
        localStorage.setItem('famcareRecords', JSON.stringify(records));
        alert('Assessment saved to your device!');
        loadRecords();
    }
}

// ============ RECORDS MANAGEMENT ============
function loadRecords() {
    // Try to load from backend first
    fetch(`${API_BASE_URL}/assessments`)
        .then(response => response.json())
        .then(records => {
            displayRecords(records);
        })
        .catch(() => {
            // Fallback to local storage
            const records = JSON.parse(localStorage.getItem('famcareRecords')) || [];
            displayRecords(records);
        });
}

function displayRecords(records) {
    const recordsList = document.getElementById('recordsList');

    if (records.length === 0) {
        recordsList.innerHTML = '<p class="empty-state">No records yet. Start an assessment to create your first record.</p>';
        return;
    }

    recordsList.innerHTML = records.map(record => `
        <div class="record-item">
            <div class="record-header">
                <div>
                    <div class="record-title">${record.patientName}</div>
                    <div class="record-date">${new Date(record.timestamp).toLocaleDateString()} ${new Date(record.timestamp).toLocaleTimeString()}</div>
                </div>
                <span class="record-severity ${record.careLevel.split('-')[0]}">${record.careLevel.replace('-', ' ').toUpperCase()}</span>
            </div>
            <div class="record-details">
                <div class="record-detail">
                    <div class="record-detail-label">Age</div>
                    <div class="record-detail-value">${record.patientAge} years</div>
                </div>
                <div class="record-detail">
                    <div class="record-detail-label">Severity</div>
                    <div class="record-detail-value">${record.severity}</div>
                </div>
                <div class="record-detail">
                    <div class="record-detail-label">Duration</div>
                    <div class="record-detail-value">${record.symptomDuration}</div>
                </div>
                <div class="record-detail">
                    <div class="record-detail-label">Symptoms</div>
                    <div class="record-detail-value">${record.symptoms.substring(0, 50)}...</div>
                </div>
            </div>
            <div class="record-actions">
                <button class="btn-view" onclick="viewRecord(${record.id})">View Details</button>
                <button class="btn-delete" onclick="deleteRecord(${record.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

function filterRecords() {
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const records = JSON.parse(localStorage.getItem('famcareRecords')) || [];
    
    const filtered = records.filter(record => 
        record.patientName.toLowerCase().includes(searchInput)
    );

    displayRecords(filtered);
}

function viewRecord(id) {
    const records = JSON.parse(localStorage.getItem('famcareRecords')) || [];
    const record = records.find(r => r.id === id);

    if (record) {
        alert(`Assessment Details:\n\nPatient: ${record.patientName}\nAge: ${record.patientAge}\nSymptoms: ${record.symptoms}\nSeverity: ${record.severity}\nCare Level: ${record.careLevel}\nDate: ${new Date(record.timestamp).toLocaleString()}`);
    }
}

function deleteRecord(id) {
    if (confirm('Are you sure you want to delete this record?')) {
        let records = JSON.parse(localStorage.getItem('famcareRecords')) || [];
        records = records.filter(r => r.id !== id);
        localStorage.setItem('famcareRecords', JSON.stringify(records));
        loadRecords();

        // Also try to delete from backend
        fetch(`${API_BASE_URL}/assessment/${id}`, {
            method: 'DELETE'
        }).catch(() => {
            // Silently fail if backend is unavailable
        });
    }
}

// ============ FEEDBACK SECTION ============
function submitFeedback(event) {
    event.preventDefault();

    const feedback = {
        name: document.getElementById('feedbackName').value,
        email: document.getElementById('feedbackEmail').value,
        text: document.getElementById('feedbackText').value,
        rating: parseInt(document.querySelector('input[name="rating"]:checked').value),
        timestamp: new Date().toISOString()
    };

    // Try to save to backend
    fetch(`${API_BASE_URL}/feedback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(feedback)
    }).then(response => {
        if (response.ok) {
            alert('Thank you for your feedback!');
            event.target.reset();
        } else {
            saveToLocalStorage();
        }
    }).catch(() => {
        saveToLocalStorage();
    });

    function saveToLocalStorage() {
        let feedbackList = JSON.parse(localStorage.getItem('famcareFeedback')) || [];
        feedbackList.push({
            id: Date.now(),
            ...feedback
        });
        localStorage.setItem('famcareFeedback', JSON.stringify(feedbackList));
        alert('Thank you for your feedback!');
        event.target.reset();
    }
}
