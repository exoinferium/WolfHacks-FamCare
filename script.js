// API Base URL
const API_URL = 'http://localhost:5000/api';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadChatHistory();
    loadFeedback();
});

// ============ SECTION NAVIGATION ============

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active class from nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    // Show selected section
    document.getElementById(sectionId).classList.add('active');

    // Add active class to clicked nav link
    event.target.classList.add('active');
}

// ============ CHAT FUNCTIONALITY ============

let currentConversationId = null;
let messageCount = 0;

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function sendMessage(predefinedMessage = null) {
    const input = document.getElementById('user-input');
    const message = predefinedMessage || input.value.trim();

    if (!message) return;

    // Add user message to chat
    addMessageToChat('user', message);
    input.value = '';

    // Send to backend
    fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: message,
            conversation_id: currentConversationId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            addMessageToChat('bot', data.response);
            currentConversationId = data.conversation_id;
            messageCount++;
            
            // Save to local history
            saveToLocalHistory(message, data.response);
        } else {
            addMessageToChat('bot', 'Sorry, I encountered an error. Please try again.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        addMessageToChat('bot', 'Unable to connect to the server. Please check your connection.');
    });
}

function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = sender === 'user' ? '👤' : '👨‍👩‍👧‍👦';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <p>${escapeHtml(message)}</p>
            <div class="message-time">${time}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ CHAT HISTORY ============

function saveToLocalHistory(userMessage, botResponse) {
    let history = JSON.parse(localStorage.getItem('chatHistory')) || [];
    
    history.push({
        userMessage: userMessage,
        botResponse: botResponse,
        timestamp: new Date().toLocaleString()
    });
    
    localStorage.setItem('chatHistory', JSON.stringify(history));
}

function loadChatHistory() {
    const history = JSON.parse(localStorage.getItem('chatHistory')) || [];
    const historyContainer = document.getElementById('chat-history');
    
    if (history.length === 0) {
        historyContainer.innerHTML = '<p class="empty-state">No chat history yet. Start a conversation!</p>';
        return;
    }
    
    historyContainer.innerHTML = history.reverse().map((item, index) => `
        <div class="chat-history-item">
            <div class="history-item-date">${item.timestamp}</div>
            <div class="history-item-preview">
                <strong>You:</strong> ${item.userMessage}
            </div>
            <div class="history-item-preview">
                <strong>FamCare:</strong> ${item.botResponse}
            </div>
            <div class="history-item-actions">
                <button onclick="removeHistoryItem(${index})">Delete</button>
            </div>
        </div>
    `).join('');
}

function removeHistoryItem(index) {
    let history = JSON.parse(localStorage.getItem('chatHistory')) || [];
    history.splice(index, 1);
    localStorage.setItem('chatHistory', JSON.stringify(history));
    loadChatHistory();
}

function clearChatHistory() {
    if (confirm('Are you sure you want to clear all chat history?')) {
        localStorage.removeItem('chatHistory');
        loadChatHistory();
    }
}

// ============ FEEDBACK ============

let currentRating = 0;

function setRating(rating) {
    currentRating = rating;
    document.getElementById('feedback-rating').value = rating;
    
    // Visual feedback
    document.querySelectorAll('.rating-stars .star').forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

function submitFeedback() {
    const type = document.getElementById('feedback-type').value;
    const message = document.getElementById('feedback-message').value.trim();
    const rating = currentRating;

    if (!message || rating === 0) {
        alert('Please provide feedback and a rating.');
        return;
    }

    // Send to backend
    fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            type: type,
            message: message,
            rating: rating
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('✓ Thank you for your feedback!');
            
            // Clear form
            document.getElementById('feedback-type').value = 'bug';
            document.getElementById('feedback-message').value = '';
            currentRating = 0;
            document.querySelectorAll('.rating-stars .star').forEach(star => {
                star.classList.remove('active');
            });
            
            // Reload feedback list
            loadFeedback();
        }
    })
    .catch(error => {
        console.error('Error:', error);
        // Save locally if server is down
        saveFeedbackLocally(type, message, rating);
    });
}

function saveFeedbackLocally(type, message, rating) {
    let feedback = JSON.parse(localStorage.getItem('feedbackData')) || [];
    
    feedback.push({
        type: type,
        message: message,
        rating: rating,
        timestamp: new Date().toLocaleString()
    });
    
    localStorage.setItem('feedbackData', JSON.stringify(feedback));
    alert('✓ Feedback saved locally. It will be sent when the server is available.');
    loadFeedback();
}

function loadFeedback() {
    // Try to load from server first
    fetch(`${API_URL}/feedback`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayFeedback(data.feedback);
            } else {
                // Fall back to local storage
                loadLocalFeedback();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            loadLocalFeedback();
        });
}

function loadLocalFeedback() {
    const feedback = JSON.parse(localStorage.getItem('feedbackData')) || [];
    displayFeedback(feedback);
}

function displayFeedback(feedbackList) {
    const feedbackContainer = document.getElementById('feedback-items');
    
    if (feedbackList.length === 0) {
        feedbackContainer.innerHTML = '<p class="empty-state">No feedback yet</p>';
        return;
    }
    
    feedbackContainer.innerHTML = feedbackList.reverse().slice(0, 10).map(item => `
        <div class="feedback-item">
            <span class="feedback-item-type">${item.type || item.feedback_type}</span>
            <div class="feedback-item-rating">⭐ Rating: ${item.rating}/5</div>
            <div class="feedback-item-message">${escapeHtml(item.message || item.feedback_message)}</div>
            <div class="feedback-item-date">${item.timestamp || item.created_at}</div>
        </div>
    `).join('');
}

// ============ UTILITIES ============

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('✓ Copied to clipboard!');
    });
}
