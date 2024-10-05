const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to handle CORS and JSON requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
app.use(express.json());

// Serve static files from the "public" directory
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Handle root route and serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Create HTTP server to allow WebSocket and HTTP to share the same port
const server = http.createServer(app);

// Initialize WebSocket server on the same HTTP server
const wss = new WebSocket.Server({ server });

// Real-time viewer count
let viewerCount = 0;

// Function to broadcast viewer count to all connected clients
function broadcastViewerCount() {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ count: viewerCount }));
        }
    });
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    viewerCount++;
    broadcastViewerCount();  // Broadcast updated viewer count on new connection

    // Send the initial viewer count to the newly connected client
    ws.send(JSON.stringify({ count: viewerCount }));

    // Handle incoming WebSocket messages
    ws.on('message', (message) => {
        console.log(`Received message: ${message}`);
        // Handle messages as needed
    });

    // Handle WebSocket disconnections
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        viewerCount--;
        broadcastViewerCount();  // Broadcast updated viewer count on disconnection
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Keep WebSocket connections alive with periodic ping
setInterval(() => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.ping(); // Send ping to keep connection alive
        }
    });
}, 30000); // Send ping every 30 seconds

// REST API endpoint to get the current viewer count (for initial page load)
app.get('/viewer-count', (req, res) => {
    res.json({ count: viewerCount });
});

// Start the HTTP and WebSocket server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
