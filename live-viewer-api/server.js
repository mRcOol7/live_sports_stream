// LiteSpeed Web Server Configuration
const LITESPEED_LICENSE = {
    id: '1082705',
    serial: 'e+Hb-uQJ6-0Q95-0fsL',
    type: 'Leased LiteSpeed Web Server - Free Starter'
};

// Configure server headers for LiteSpeed
const serverConfig = {
    poweredBy: false,
    server: 'LiteSpeed'
};

// Error logging middleware
const express = require('express');
const app = express();
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err.stack);
    res.status(500).send('Something broke!');
});

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
const cors = require('cors');

const PORT = process.env.PORT || 10000;
const FRONTEND_URL = process.env.NODE_ENV === 'production' 
    ? 'https://live-sports-stream.vercel.app'
    : 'http://localhost:10000';

// CORS configuration
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

// Serve static files from the parent directory
app.use(express.static(path.join(__dirname, '..')));

// Apply LiteSpeed configuration
app.set('x-powered-by', serverConfig.poweredBy);
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    res.setHeader('Server', serverConfig.server);
    next();
});

// Use Helmet to secure HTTP headers
app.use(helmet());

// Function to generate a unique user name
async function generateUniqueName() {
    try {
        const randomBytes = crypto.randomBytes(4); // Generate 4 bytes of random data
        const randomSuffix = randomBytes.toString('hex'); // Convert to hexadecimal string
        const username = `user-${randomSuffix}`;
        console.log(`Generated unique username: ${username}`);
        return username;
    } catch (error) {
        console.error('Error generating unique name:', error);
        return `user-${Date.now()}`;
    }
}

// Function to sanitize input
function sanitizeInput(input) {
    console.log('Input before sanitization:', input);
    const sanitized = input.replace(/[=;]/g, '');
    console.log('Input after sanitization:', sanitized);
    return sanitized;
}

// Set up rate limiter with more lenient settings
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests, please try again in a minute.",
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false // Disable the `X-RateLimit-*` headers
});

// Apply the rate limiter to all requests
app.use(limiter);
app.use(hpp()); // Protect against HTTP Parameter Pollution

// Handle favicon.ico requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content response
});

// Add rate limit error monitoring
app.use((err, req, res, next) => {
    if (err instanceof Error && err.status === 429) {
        console.error(`Rate limit exceeded for IP: ${req.ip}`);
    }
    next(err);
});

// Middleware to handle CORS and JSON
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    // Add CSP header
    res.header('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel.app https://www.gstatic.com https://cdnjs.cloudflare.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' wss: https:; " +
        "frame-src 'self' https:;"
    );
    next();
});
app.use(express.json());

// Define a route for the root path
app.get('/', (req, res) => {
    res.send('Welcome to the WebSocket Server!'); // You can customize this response
});

// Create HTTP server to allow WebSocket and HTTP to share the same port
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    verifyClient: (info) => {
        const origin = info.origin || info.req.headers.origin;
        if (origin === FRONTEND_URL) {
            return true;
        }
        console.log(`Rejected WebSocket connection from origin: ${origin}`);
        return false;
    }
});

// Add CORS headers for WebSocket connections
wss.on('headers', (headers) => {
    headers.push('Access-Control-Allow-Origin: *');
});

// Real-time viewer count
let viewerCount = 0;

// Handle WebSocket connections
wss.on('connection', async (ws, req) => {
    try {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`New WebSocket connection from ${clientIp}`);
        
        viewerCount++;
        broadcastViewerCount();

        const cookies = cookie.parse(req.headers.cookie || '');
        const safeName = 'view';

        // Set a new cookie with secure options for production
        const newCookie = cookie.serialize(safeName, 'value', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'none',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });

        ws.send(`Set-Cookie: ${newCookie}`);

        // Generate a unique name for the user
        const userName = await generateUniqueName();

        // Handle WebSocket messages
        ws.on('message', (message) => {
            try {
                console.log(`Received message from ${userName}: ${message}`);
                const parsedMessage = JSON.parse(message);
                
                // Broadcast the message to all clients
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'message',
                            user: userName,
                            text: DOMPurify.sanitize(parsedMessage.text)
                        }));
                    }
                });
            } catch (error) {
                console.error(`Error processing message from ${userName}:`, error);
            }
        });

        // Send initial viewer count upon connection
        ws.send(JSON.stringify({ count: viewerCount }));

        // Handle disconnection
        ws.on('close', () => {
            console.log(`Client ${userName} disconnected`);
            viewerCount--;
            broadcastViewerCount();
        });

        // Handle WebSocket errors
        ws.on('error', (error) => {
            console.error(`WebSocket error for ${userName}:`, error);
        });

    } catch (error) {
        console.error('WebSocket connection error:', error);
    }
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
    try {
        console.log('Viewer count requested:', viewerCount);
        res.json({ count: viewerCount });
    } catch (error) {
        console.error('Error getting viewer count:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Keep WebSocket connections alive by sending pings
setInterval(() => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.ping(); // Send ping to keep the connection alive
        }
    });
}, 30000); // Ping every 30 seconds

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Server configuration:', {
        poweredBy: serverConfig.poweredBy,
        server: serverConfig.server,
        port: PORT
    });
});
