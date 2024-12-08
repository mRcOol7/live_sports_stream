// Initialize Firebase with config from config.js
firebase.initializeApp(window.firebaseConfig);
const database = firebase.database();

// Reference to viewers in Firebase
const viewersRef = database.ref('viewers');
let myViewerRef;

// Setup viewer count tracking
database.ref('.info/connected').on('value', (snap) => {
    if (snap.val() === true) {
        // We're connected (or reconnected)
        // Add this device to viewers list
        myViewerRef = viewersRef.push();

        // When this device disconnects, remove it
        myViewerRef.onDisconnect().remove();

        // Add this device to the viewers list
        myViewerRef.set(true);
        
        console.log('Connected to Firebase, tracking viewer count');
    }
});

// Listen for viewer count changes
viewersRef.on('value', (snapshot) => {
    const viewers = snapshot.numChildren();
    const viewerCountElement = document.getElementById('viewerCount');
    if (viewerCountElement) {
        viewerCountElement.textContent = viewers;
        console.log('Updated viewer count:', viewers);
    }
});

// User Management System with Local Storage
class UserManager {
    constructor() {
        this.userId = localStorage.getItem('userId') || this.generateUserId();
        this.userName = localStorage.getItem('userName') || this.generateRandomUsername();
        this.userRef = database.ref(`users/${this.userId}`);
        this.setupUserPresence();
    }

    generateUserId() {
        const newUserId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', newUserId);
        return newUserId;
    }

    generateRandomUsername() {
        const name = 'User_' + Math.floor(Math.random() * 10000);
        localStorage.setItem('userName', name);
        return name;
    }

    async setUsername(name) {
        if (!name) name = this.generateRandomUsername();
        this.userName = name;
        localStorage.setItem('userName', name);
        
        try {
            await this.userRef.set({
                userName: name,
                lastSeen: firebase.database.ServerValue.TIMESTAMP,
                isOnline: true
            });
            
            const userNameDisplay = document.getElementById('userNameDisplay');
            if (userNameDisplay) {
                userNameDisplay.textContent = `Chatting as: ${name}`;
            }
        } catch (error) {
            console.error('Error updating username:', error);
        }
    }

    setupUserPresence() {
        const connectedRef = database.ref('.info/connected');
        
        connectedRef.on('value', async (snap) => {
            if (snap.val() === true) {
                try {
                    await this.userRef.onDisconnect().update({
                        isOnline: false,
                        lastSeen: firebase.database.ServerValue.TIMESTAMP
                    });

                    await this.userRef.update({
                        isOnline: true,
                        lastSeen: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (error) {
                    console.error('Error in presence system:', error);
                }
            }
        });
    }
}

// Message Management System
class MessageManager {
    constructor(userManager) {
        this.userManager = userManager;
        this.messagesRef = database.ref('messages');
        this.messageCache = new Map();
        this.setupMessageListeners();
    }

    async sendMessage(text) {
        if (!text.trim()) return;

        const messageData = {
            userId: this.userManager.userId,
            userName: this.userManager.userName,
            message: DOMPurify.sanitize(processMessage(text)),
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            edited: false
        };

        try {
            const newMessageRef = this.messagesRef.push();
            await newMessageRef.set(messageData);
            return newMessageRef.key;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    setupMessageListeners() {
        this.messagesRef.orderByChild('timestamp').limitToLast(100).on('child_added', 
            (snapshot) => {
                try {
                    const message = snapshot.val();
                    this.messageCache.set(snapshot.key, message);
                    displayMessage(message, snapshot.key);
                } catch (error) {
                    console.error('Error in message listener:', error);
                }
            }
        );

        this.messagesRef.on('child_changed', (snapshot) => {
            const message = snapshot.val();
            this.messageCache.set(snapshot.key, message);
            updateMessageInUI(message, snapshot.key);
        });

        this.messagesRef.on('child_removed', (snapshot) => {
            this.messageCache.delete(snapshot.key);
            removeMessageFromUI(snapshot.key);
        });
    }
}

// Initialize managers
let userManager;
let messageManager;

// Enhanced message display with animations
function displayMessage(data, messageId) {
    const messagesDiv = document.getElementById('chatMessages');
    if (!messagesDiv) return;

    const messageElement = document.createElement('div');
    messageElement.className = `message ${data.userId === userManager.userId ? 'self' : ''}`;
    messageElement.setAttribute('data-message-id', messageId);

    const timestamp = new Date(data.timestamp).toLocaleTimeString();
    const isEdited = data.edited ? '<span class="edited-indicator">(edited)</span>' : '';
    
    messageElement.innerHTML = `
        <div class="message-header">
            <strong class="username">${DOMPurify.sanitize(data.userName)}</strong>
            <span class="timestamp">${timestamp}</span>
        </div>
        <div class="message-content">${DOMPurify.sanitize(data.message)}</div>
        ${isEdited}
    `;

    // Add message controls for user's own messages
    if (data.userId === userManager.userId) {
        const controls = document.createElement('div');
        controls.className = 'message-controls';
        controls.innerHTML = `
            <button class="edit-message" title="Edit message">✏️</button>
            <button class="delete-message" title="Delete message">🗑️</button>
        `;

        // Add event listeners for edit and delete
        controls.querySelector('.edit-message').addEventListener('click', () => {
            const content = messageElement.querySelector('.message-content');
            const currentText = content.textContent;
            content.innerHTML = `
                <input type="text" class="edit-input" value="${currentText}">
                <button class="save-edit">Save</button>
                <button class="cancel-edit">Cancel</button>
            `;

            const editInput = content.querySelector('.edit-input');
            editInput.focus();

            content.querySelector('.save-edit').addEventListener('click', async () => {
                const newText = editInput.value.trim();
                if (newText && newText !== currentText) {
                    await messageManager.editMessage(messageId, newText);
                }
                updateMessageInUI({ ...data, message: newText, edited: true }, messageId);
            });

            content.querySelector('.cancel-edit').addEventListener('click', () => {
                updateMessageInUI(data, messageId);
            });
        });

        controls.querySelector('.delete-message').addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete this message?')) {
                await messageManager.deleteMessage(messageId);
            }
        });

        messageElement.appendChild(controls);
    }

    // Add hover effect to show timestamp
    messageElement.addEventListener('mouseenter', () => {
        const timestamp = messageElement.querySelector('.timestamp');
        if (timestamp) timestamp.style.opacity = '1';
    });

    messageElement.addEventListener('mouseleave', () => {
        const timestamp = messageElement.querySelector('.timestamp');
        if (timestamp) timestamp.style.opacity = '0';
    });

    // Add message with animation
    messageElement.style.opacity = '0';
    messagesDiv.appendChild(messageElement);
    requestAnimationFrame(() => {
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateX(0)';
    });

    scrollToBottom();
}

function updateMessageInUI(message, messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const messageContent = messageElement.querySelector('.message-content');
        if (messageContent) {
            messageContent.innerHTML = DOMPurify.sanitize(message.message);
            if (message.edited) {
                const editedSpan = document.createElement('span');
                editedSpan.className = 'edited-indicator';
                editedSpan.textContent = ' (edited)';
                messageContent.appendChild(editedSpan);
            }
        }
    }
}

function removeMessageFromUI(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove();
    }
}

// Initialize Firebase and managers
function initializeApp() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(window.firebaseConfig);
        }
        window.database = firebase.database();
        userManager = new UserManager();
        messageManager = new MessageManager(userManager);
        
        userManager.setUsername(localStorage.getItem('userName'));
        initializeChat();
        initializeDarkMode();
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Live Count Manager
class LiveCountManager {
    constructor() {
        this.viewersRef = database.ref('viewers');
        this.setupViewerCount();
    }

    setupViewerCount() {
        const connectedRef = database.ref('.info/connected');
        
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                const myViewerRef = this.viewersRef.push();
                
                myViewerRef.onDisconnect().remove();
                myViewerRef.set({
                    userId: userManager.userId,
                    userName: userManager.userName,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            }
        });

        this.viewersRef.on('value', (snapshot) => {
            const viewers = snapshot.numChildren();
            this.updateViewerCount(viewers);
        });
    }

    updateViewerCount(count) {
        const viewerCountElement = document.getElementById('viewerCount');
        if (viewerCountElement) {
            viewerCountElement.textContent = count;
            viewerCountElement.setAttribute('title', `${count} ${count === 1 ? 'viewer' : 'viewers'} online`);
        }
    }
}

// Initialize Live Count Manager
const liveCountManager = new LiveCountManager();

// User ID and Name Management
let userId = localStorage.getItem('userId') || generateRandomId();
let userName = localStorage.getItem('userName');
let isTyping = false;

function getUserId() {
    return userId;
}

function generateRandomId(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

function generateRandomUsername() {
    const adjectives = [
        'Swift', 'Mighty', 'Epic', 'Cool', 'Super', 'Mega', 'Ultra', 'Pro',
        'Elite', 'Royal', 'Master', 'Legend', 'Rapid', 'Brave', 'Noble'
    ];
    const nouns = [
        'Player', 'Warrior', 'Champion', 'Knight', 'Striker', 'Titan', 'Phoenix',
        'Dragon', 'Eagle', 'Lion', 'Tiger', 'Ninja', 'Wizard', 'Hero'
    ];
    const randomNumber = Math.floor(Math.random() * 999) + 1;
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}${noun}${randomNumber}`;
}

async function assignUserName() {
    if (!userName) {
        userName = generateRandomUsername();
        localStorage.setItem('userName', userName);
    }
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userNameDisplay) {
        userNameDisplay.textContent = `Chatting as: ${userName}`;
    }
    console.log('Username assigned:', userName);
}

// Save User ID to Local Storage
localStorage.setItem('userId', userId);

// Message sending lock to prevent duplicate sends
let isSending = false;

// Enhanced message sending with emojis and markdown support
async function sendMessage() {
    if (isSending) return; // Prevent duplicate sends
    
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (message) {
        isSending = true;
        const username = userName || localStorage.getItem('username') || generateRandomUsername();
        
        try {
            // Process message for markdown and emojis
            const processedMessage = processMessage(message);
            
            const messageData = {
                username: username,
                message: DOMPurify.sanitize(processedMessage),
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                userId: getUserId()
            };

            // Push message to Firebase
            await database.ref('messages').push().set(messageData);
            
            // Clear input and update UI only after successful send
            input.value = '';
            scrollToBottom();
            updateTypingStatus(false);
            
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            isSending = false;
        }
    }
}

// Process message for markdown and emojis
function processMessage(message) {
    // Basic markdown support
    message = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Basic emoji support - using string replace instead of RegExp
    const emojiMap = {
        ':\\)': '😊',
        ':D': '😃',
        ':\\(': '😢',
        '<3': '❤️',
        ':p': '😛',
        ';\\)': '😉',
        ':o': '😮',
        ':>': '😆',
        ':\\|': '😐'
    };
    
    // Replace emojis using escaped patterns
    for (let [pattern, emoji] of Object.entries(emojiMap)) {
        message = message.replace(new RegExp(pattern, 'g'), emoji);
    }
    
    return DOMPurify.sanitize(message);
}

// Function to handle Enter key in chat input
function checkEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Debounce function to prevent rapid firing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Typing indicator functions
const debouncedTypingStatus = debounce((isTyping) => {
    const typingRef = database.ref('typing/' + getUserId());
    if (isTyping) {
        typingRef.set({
            username: userName,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } else {
        typingRef.remove();
    }
}, 500);

function handleTyping() {
    if (!isTyping) {
        isTyping = true;
    }
    debouncedTypingStatus(true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        debouncedTypingStatus(false);
    }, 2000);
}

// Remove any existing listeners before adding new ones
const chatInput = document.getElementById('chatInput');
if (chatInput) {
    chatInput.removeEventListener('input', handleTyping);
    chatInput.removeEventListener('keypress', checkEnter);
    
    // Add new listeners
    chatInput.addEventListener('input', handleTyping);
    chatInput.addEventListener('keypress', checkEnter);
}

// Enhanced message display with animations
function displayMessage(data) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    const isCurrentUser = data.userId === getUserId();
    
    messageElement.className = `message ${isCurrentUser ? 'self' : ''}`;
    messageElement.innerHTML = `
        <strong>${data.username}</strong>
        ${data.message}
        <span class="timestamp">${data.timestamp}</span>
    `;
    
    messagesDiv.appendChild(messageElement);
    scrollToBottom();
    
    // Add entrance animation
    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateY(20px)';
    requestAnimationFrame(() => {
        messageElement.style.transition = 'all 0.3s ease';
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateY(0)';
    });
}

// Improved typing indicator
let typingTimeout;
function updateTypingStatus(isTyping) {
    const userId = getUserId();
    const username = localStorage.getItem('username');
    const typingRef = firebase.database().ref('typing/' + userId);
    
    if (isTyping) {
        typingRef.set({
            username: username,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Clear typing status after 2 seconds of no typing
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            typingRef.remove();
        }, 2000);
    } else {
        typingRef.remove();
    }
}

// Show typing indicators
function showTypingIndicators(snapshot) {
    const typingIndicator = document.getElementById('typingIndicator');
    const typingUsers = [];
    
    snapshot.forEach(child => {
        const typing = child.val();
        if (child.key !== getUserId()) {
            typingUsers.push(typing.username);
        }
    });
    
    if (typingUsers.length > 0) {
        let text = '';
        if (typingUsers.length === 1) {
            text = `${typingUsers[0]} is typing...`;
        } else if (typingUsers.length === 2) {
            text = `${typingUsers[0]} and ${typingUsers[1]} are typing...`;
        } else {
            text = 'Several people are typing...';
        }
        typingIndicator.textContent = text;
        typingIndicator.style.display = 'block';
    } else {
        typingIndicator.style.display = 'none';
    }
}

// Smooth scroll to bottom
function scrollToBottom() {
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Initialize chat features
function initializeChat() {
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.querySelector('.send-btn');
    
    // Event listeners
    chatInput.addEventListener('input', () => {
        updateTypingStatus(true);
    });
    
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    sendButton.addEventListener('click', sendMessage);
    
    // Firebase listeners
    const messagesRef = firebase.database().ref('messages');
    const typingRef = firebase.database().ref('typing');
    
    messagesRef.on('child_added', snapshot => {
        displayMessage(snapshot.val());
    });
    
    typingRef.on('value', snapshot => {
        showTypingIndicators(snapshot);
    });
    
    // Clear typing status on page unload
    window.addEventListener('beforeunload', () => {
        const userId = getUserId();
        firebase.database().ref('typing/' + userId).remove();
    });
}

// Initialize dark mode
function initializeDarkMode() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark-mode', darkMode);
    
    // Add dark mode toggle button
    const darkModeToggle = document.createElement('button');
    darkModeToggle.className = 'dark-mode-toggle';
    darkModeToggle.innerHTML = darkMode ? '☀️' : '🌙';
    document.body.appendChild(darkModeToggle);
    
    darkModeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
        darkModeToggle.innerHTML = isDarkMode ? '☀️' : '🌙';
    });
}

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
});

// Responsive Typing Indicator Management for Desktop and Mobile
let typingIndicator;

function showTypingIndicator(show) {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = show ? 'block' : 'none';
}

// Typing Indicator Event Listener
database.ref('typing').on('value', (snapshot) => {
    const typingData = snapshot.val();
    showTypingIndicator(!!typingData);
    if (typingData) {
        document.getElementById('typingIndicator').innerText = `${typingData.userName} is typing...`;
    }
});

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

function switchPitcher(url) {
    const videoPlayer = document.getElementById('videoPlayer');
    if (videoPlayer) {
        videoPlayer.src = url;
    } else {
        console.error('Video player not found');
    }
}