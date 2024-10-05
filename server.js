const functions = require('firebase-functions');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const RateLimit = require('express-rate-limit');
const path = require('path');
const DOMPurify = require('dompurify'); // Using DOMPurify to sanitize user input
const crypto = require('crypto'); // Importing crypto for generating unique names
const cookie = require('cookie'); // Importing cookie for setting cookies
const helmet = require('helmet'); // Importing helmet for securing HTTP headers
const rateLimit = require('express-rate-limit'); // Importing express-rate-limit for rate limiting
const hpp = require('hpp'); // Importing hpp to protect against HTTP Parameter Pollution

const app = express();
const PORT = process.env.PORT || 3000;

// Use Helmet to secure HTTP headers
app.use(helmet());

// Function to generate a unique user name
async function generateUniqueName() {
    const randomBytes = crypto.randomBytes(4); // Generate 4 bytes of random data
    const randomSuffix = randomBytes.toString('hex'); // Convert to hexadecimal string
    return `user-${randomSuffix}`;
}

// Function to sanitize input
function sanitizeInput(input) {
    // Remove special characters or limit allowed characters
    return input.replace(/[=;]/g, '');
}

// Set up rate limiter: maximum of five requests per minute
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});

// Apply the rate limiter to all requests
app.use(limiter);
app.use(hpp()); // Protect against HTTP Parameter Pollution

// Middleware to handle CORS and JSON
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
app.use(express.json());

// Create HTTP server to allow WebSocket and HTTP to share the same port
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Add CORS headers for WebSocket connections
wss.on('headers', (headers) => {
    headers.push('Access-Control-Allow-Origin: *');
});

// Real-time viewer count
let viewerCount = 0;

// Handle WebSocket connections
wss.on('connection', async (ws, req) => {
    console.log('New client connected');
    viewerCount++;
    broadcastViewerCount();

    const cookies = cookie.parse(req.headers.cookie || '');
    const safeName = 'yourCookieName'; // Replace with your actual cookie name

    // Set a new cookie
    const newCookie = cookie.serialize(safeName, 'value', {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    // Add the new cookie to the response headers
    ws.send(`Set-Cookie: ${newCookie}`);

    // Generate a unique name for the user
    const userName = await generateUniqueName();

    // Handle WebSocket messages
    ws.on('message', (message) => {
        console.log(`Received message: ${message}`);
        
        // Parse the incoming message
        const parsedMessage = JSON.parse(message);
        
        // Create a message element for chat display
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `<strong>${DOMPurify.sanitize(userName)}:</strong> ${DOMPurify.sanitize(parsedMessage.text)}`; // Sanitize user input

        // Now append `messageElement` to the DOM wherever it's needed
        document.getElementById('chatContainer').appendChild(messageElement);
    });

    // Send initial viewer count upon connection
    ws.send(JSON.stringify({ count: viewerCount }));

    // Handle disconnection
    ws.on('close', () => {
        console.log('Client disconnected');
        viewerCount--;
        broadcastViewerCount();
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Broadcast the viewer count to all connected clients
function broadcastViewerCount() {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ count: viewerCount }));
        }
    });
}

// REST endpoint to get the current viewer count (for initial load)
app.get('/viewer-count', (req, res) => {
    res.json({ count: viewerCount });
});

// Keep WebSocket connections alive by sending pings
setInterval(() => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.ping(); // Send ping to keep the connection alive
        }
    });
}, 30000); // Ping every 30 seconds
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
// Export the app as a Firebase function
exports.api = functions.https.onRequest(app);
