// Test backend connection
async function testBackendConnection() {
    try {
        console.log('Testing viewer count endpoint...');
        const response = await fetch('https://live-viewer-api.vercel.app/viewer-count');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log('Viewer count response:', data);
        return true;
    } catch (error) {
        console.error('Error testing viewer count:', error);
        return false;
    }
}

// Test WebSocket connection
function testWebSocket() {
    console.log('Testing WebSocket connection...');
    const ws = new WebSocket('wss://live-viewer-api.vercel.app');
    
    ws.onopen = () => {
        console.log('WebSocket connection successful!');
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket connection failed:', error);
    };
    
    ws.onmessage = (event) => {
        console.log('Received WebSocket message:', event.data);
    };
    
    // Close the connection after 5 seconds
    setTimeout(() => {
        ws.close();
        console.log('WebSocket connection closed for testing');
    }, 5000);
}

// Run tests
testBackendConnection();
testWebSocket();
