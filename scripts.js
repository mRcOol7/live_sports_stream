// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBo9MQw6nMVk0jF3r9zGeRbAJ98SoTLmgc",
    authDomain: "mechroad-6063c.firebaseapp.com",
    databaseURL: "https://mechroad-6063c-default-rtdb.firebaseio.com/",
    projectId: "mechroad-6063c",
    storageBucket: "mechroad-6063c.appspot.com",
    messagingSenderId: "758909410801",
    appId: "1:758909410801:web:f0c9f1961575f7fffa3850",
    measurementId: "G-ZNLVWBBN13"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// User ID and Name Management
let userId = localStorage.getItem('userId') || generateRandomId();
let userName = localStorage.getItem('userName');

async function assignUserName() {
    if (!userName) {
        userName = await generateUniqueName();
        localStorage.setItem('userName', userName);
    }
    displayUserName();
}

// Save User ID to Local Storage
localStorage.setItem('userId', userId);

// Clear Chat History on Page Load
function clearChatHistory() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    localStorage.removeItem('chatHistory');
    database.ref('messages').remove();
}

// Call clearChatHistory and assignUserName on page load
window.addEventListener('load', () => {
    clearChatHistory();
    assignUserName();
    loadChatHistory(); // Load chat history for both mobile and desktop
    connectWebSocket(); // Initialize WebSocket connection
});

// Responsive Typing Indicator Management for Desktop and Mobile
let isTyping = false;
let typingTimeout;

function showTypingIndicator(show) {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = show ? 'block' : 'none';
}

// Typing Indicator Event Listener
const chatInput = document.getElementById('chatInput');
chatInput.addEventListener('input', () => {
    if (!isTyping) {
        isTyping = true;
        database.ref('typing').set({ userId, userName });
        showTypingIndicator(true);
    }

    // Clear previous timeout and set a new one
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        database.ref('typing').set(null);
        showTypingIndicator(false);
    }, 2000);
});

// Firebase Typing Listener
database.ref('typing').on('value', (snapshot) => {
    const typingData = snapshot.val();
    showTypingIndicator(!!typingData);
    if (typingData) {
        document.getElementById('typingIndicator').innerText = `${typingData.userName} is typing...`;
    }
});

// Send Message Functionality
async function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const maxLength = 200;

    if (chatInput.value.trim() === '') return; // Ignore empty messages
    if (chatInput.value.length > maxLength) {
        alert(`Message exceeds ${maxLength} characters. Please shorten your message.`);
        return;
    }

    const message = {
        userId,
        userName,
        text: chatInput.value,
        timestamp: new Date().toISOString()
    };

    try {
        await database.ref('messages').push(message);
        chatInput.value = ''; // Clear input after sending
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Enter Key Event Listener (Mobile & Desktop)
chatInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        sendMessage();
        event.preventDefault(); // Prevent default line break
    }
});

// Generate Random User ID
function generateRandomId(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

// Generate Unique Username
async function generateUniqueName() {
    const cricketers = ['SachinTendulkar', 'ViratKohli', 'MSDhoni', 'RohitSharma'];
    const footballers = ['LionelMessi', 'CristianoRonaldo', 'Neymar', 'Pele'];

    let uniqueNameFound = false;
    let uniqueName = '';

    while (!uniqueNameFound) {
        // Randomly choose either a cricketer or a footballer
        const isCricketer = Math.random() < 0.5; // 50% chance to choose a cricketer
        uniqueName = isCricketer 
            ? cricketers[Math.floor(Math.random() * cricketers.length)] 
            : footballers[Math.floor(Math.random() * footballers.length)];

        const snapshot = await database.ref('userNames').orderByValue().equalTo(uniqueName).once('value');
        if (!snapshot.exists()) {
            uniqueNameFound = true;
        }
    }

    await database.ref('userNames').push(uniqueName);
    return uniqueName;
}

// Save Chat History Locally (Cross-browser support)
function saveChatHistory() {
    const chatMessages = document.getElementById('chatMessages').innerHTML;
    localStorage.setItem('chatHistory', chatMessages);
}

// Load Chat History (Cross-browser support)
function loadChatHistory() {
    const chatMessages = document.getElementById('chatMessages');
    const savedChat = localStorage.getItem('chatHistory');
    if (savedChat) {
        chatMessages.innerHTML = savedChat;
    }
}

// Clear Chat Functionality
async function clearChat() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    localStorage.removeItem('chatHistory');
    try {
        await database.ref('messages').remove();
    } catch (error) {
        console.error('Error clearing chat messages:', error);
    }
}

// Firebase Listener for New Messages
database.ref('messages').on('child_added', function(snapshot) {
    const message = snapshot.val();
    const chatMessages = document.getElementById('chatMessages');

    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `<strong>${message.userName}:</strong> ${message.text}`;

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.innerText = new Date(message.timestamp).toLocaleTimeString();

    messageElement.appendChild(timestamp);
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to bottom
});

// Display Username in Chat
function displayUserName() {
    const userNameDisplay = document.getElementById('userNameDisplay');
    userNameDisplay.innerText = `Logged in as: ${userName}`;
}

// Toggle Dark Mode
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
}

// Toggle Picture-in-Picture Mode
function togglePiP() {
    const videoPlayer = document.getElementById('videoPlayer');
    if (videoPlayer) {
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(err => console.error('Error exiting PiP:', err));
        } else {
            videoPlayer.requestPictureInPicture().catch(err => console.error('Error entering PiP:', err));
        }
    }
}

// Keyboard Shortcuts (Mobile & Desktop)
document.addEventListener('keydown', function(event) {
    if (event.key === 'd') toggleDarkMode();
    if (event.key === 'p') togglePiP();
    if (event.key === 'f') toggleFullScreen();
});

// Full Screen Mode Toggle
function toggleFullScreen() {
    const iframeContainer = document.querySelector('.iframe-container');
    if (!document.fullscreenElement) {
        iframeContainer.requestFullscreen().catch(err => console.error('Error enabling full-screen mode:', err));
    } else {
        document.exitFullscreen().catch(err => console.error('Error exiting full-screen mode:', err));
    }
}

// WebSocket Handling for Real-Time Viewer Count
let ws;

function connectWebSocket() {
    ws = new WebSocket('ws://localhost:3000');

    ws.onopen = () => console.log('WebSocket connection established');
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updateViewerCountUI(data.count);
    };
    ws.onclose = () => fallbackToPolling();
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        fallbackToPolling();
    };
}

// Polling Fallback if WebSocket Fails
function fallbackToPolling() {
    console.log('Switching to polling...');
    setInterval(updateViewerCount, 10000); // Poll every 10 seconds
}

// Fallback Polling for Viewer Count
async function updateViewerCount() {
    try {
        const response = await fetch('http://localhost:3000/viewer-count');
        const data = await response.json();
        updateViewerCountUI(data.count);
    } catch (error) {
        console.error('Error fetching viewer count:', error);
        document.getElementById('viewerCount').innerText = 'Error fetching viewer count.';
    }
}

// Update Viewer Count UI
function updateViewerCountUI(count) {
    document.getElementById('viewerCount').innerText = `Current Viewers: ${count}`;
}
function switchPitcher(url) {
    const videoPlayer = document.getElementById('videoPlayer');
    if (videoPlayer) {
        videoPlayer.src = url;
    } else {
        console.error('Video player not found');
    }
}