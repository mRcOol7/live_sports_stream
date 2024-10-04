const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to handle CORS and JSON
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Add CORS headers for WebSocket connections (mobile compatibility)
wss.on('headers', (headers) => {
    headers.push('Access-Control-Allow-Origin: *');
});

// Real-time viewer count
let viewerCount = 0;

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');
    viewerCount++;
    broadcastViewerCount();

    // Handle WebSocket messages (ensure it's working well on mobile)
    ws.on('message', (message) => {
        console.log(`Received message: ${message}`);
        // Optionally handle messages from clients
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

// Ensure reliable connection updates for mobile by keeping alive
setInterval(() => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.ping(); // Send ping to keep the connection alive
        }
    });
}, 30000); // Ping every 30 seconds

// Server start
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});