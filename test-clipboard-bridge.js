/**
 * Test script for clipboard bridge
 *
 * This script helps you test if the clipboard bridge is working correctly.
 * Run this in your Node.js environment to launch a test server.
 */

const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve static test page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Clipboard Bridge Test</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 {
      color: #333;
    }
    .test-section {
      background: white;
      padding: 20px;
      margin: 20px 0;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    input, textarea {
      width: 100%;
      padding: 10px;
      margin: 10px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      font-family: monospace;
    }
    button {
      background: #4CAF50;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin: 5px;
    }
    button:hover {
      background: #45a049;
    }
    .status {
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
    }
    .status.connected {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .status.disconnected {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .logs {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 15px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      max-height: 300px;
      overflow-y: auto;
      margin: 10px 0;
    }
    .log-entry {
      margin: 5px 0;
      padding: 3px 0;
      border-bottom: 1px solid #333;
    }
    .log-success { color: #4CAF50; }
    .log-error { color: #f44336; }
    .log-info { color: #2196F3; }
    .code {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      font-family: monospace;
      margin: 10px 0;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>📋 Clipboard Bridge Test Page</h1>
  
  <div class="test-section">
    <h2>Connection Status</h2>
    <div id="status" class="status disconnected">
      ⚠️ Not connected - Load the clipboard client script first
    </div>
    <button onclick="loadClipboardClient()">Load Clipboard Client</button>
    <button onclick="checkStatus()">Check Status</button>
    <button onclick="testPing()">Test Ping</button>
  </div>

  <div class="test-section">
    <h2>Test Input Fields</h2>
    <p>Use these fields to test pasting from desktop to server:</p>
    
    <label for="test-input">Single-line input:</label>
    <input type="text" id="test-input" placeholder="Focus here and press Ctrl+Shift+V">
    
    <label for="test-textarea">Multi-line textarea:</label>
    <textarea id="test-textarea" rows="5" placeholder="Focus here and press Ctrl+Shift+V"></textarea>
    
    <label for="test-email">Email input:</label>
    <input type="email" id="test-email" placeholder="test@example.com">
  </div>

  <div class="test-section">
    <h2>Manual Controls</h2>
    <button onclick="manualPaste()">Manual Paste (Focused Element)</button>
    <button onclick="manualPaste('test-input')">Paste to Input</button>
    <button onclick="manualPaste('test-textarea')">Paste to Textarea</button>
    <button onclick="syncClipboard()">Sync Desktop Clipboard to Server</button>
    <button onclick="readServerClipboard()">Read Server Clipboard</button>
  </div>

  <div class="test-section">
    <h2>Keyboard Shortcuts</h2>
    <div class="code">
      Ctrl+Shift+V (Cmd+Shift+V) - Paste from desktop to server<br>
      Ctrl+Shift+C (Cmd+Shift+C) - Sync desktop clipboard to server<br>
      Ctrl+Shift+R (Cmd+Shift+R) - Read server clipboard
    </div>
  </div>

  <div class="test-section">
    <h2>Activity Log</h2>
    <button onclick="clearLogs()">Clear Logs</button>
    <div id="logs" class="logs"></div>
  </div>

  <script>
    // Logger
    function log(message, type = 'info') {
      const logs = document.getElementById('logs');
      const entry = document.createElement('div');
      entry.className = 'log-entry log-' + type;
      entry.textContent = new Date().toLocaleTimeString() + ' - ' + message;
      logs.insertBefore(entry, logs.firstChild);
    }

    function clearLogs() {
      document.getElementById('logs').innerHTML = '';
      log('Logs cleared', 'info');
    }

    // Load clipboard client
    async function loadClipboardClient() {
      try {
        log('Loading clipboard client script...', 'info');
        const response = await fetch('/clipboard-client.js');
        const script = await response.text();
        eval(script);
        log('Clipboard client loaded successfully!', 'success');
        setTimeout(checkStatus, 1000);
      } catch (error) {
        log('Failed to load clipboard client: ' + error.message, 'error');
      }
    }

    // Check status
    function checkStatus() {
      if (typeof window.clipboardBridge === 'undefined') {
        updateStatus(false, 'Clipboard client not loaded');
        log('Clipboard client not loaded', 'error');
        return;
      }

      const status = window.clipboardBridge.getStatus();
      updateStatus(status.connected && status.ready, JSON.stringify(status, null, 2));
      log('Status: ' + JSON.stringify(status), status.connected ? 'success' : 'error');
    }

    function updateStatus(connected, message) {
      const statusEl = document.getElementById('status');
      if (connected) {
        statusEl.className = 'status connected';
        statusEl.innerHTML = '✅ Connected - ' + message;
      } else {
        statusEl.className = 'status disconnected';
        statusEl.innerHTML = '⚠️ Disconnected - ' + message;
      }
    }

    // Test ping
    function testPing() {
      if (typeof window.clipboardBridge === 'undefined') {
        log('Clipboard client not loaded', 'error');
        return;
      }
      window.clipboardBridge.ping();
      log('Ping sent', 'info');
    }

    // Manual paste
    async function manualPaste(elementId = null) {
      if (typeof window.clipboardBridge === 'undefined') {
        log('Clipboard client not loaded', 'error');
        alert('Please load the clipboard client first!');
        return;
      }

      try {
        if (elementId) {
          await window.clipboardBridge.paste('#' + elementId);
          log('Paste to #' + elementId + ' triggered', 'success');
        } else {
          await window.clipboardBridge.paste();
          log('Paste to focused element triggered', 'success');
        }
      } catch (error) {
        log('Paste failed: ' + error.message, 'error');
      }
    }

    // Sync clipboard
    async function syncClipboard() {
      if (typeof window.clipboardBridge === 'undefined') {
        log('Clipboard client not loaded', 'error');
        return;
      }

      try {
        await window.clipboardBridge.sync();
        log('Clipboard sync triggered', 'success');
      } catch (error) {
        log('Sync failed: ' + error.message, 'error');
      }
    }

    // Read server clipboard
    function readServerClipboard() {
      if (typeof window.clipboardBridge === 'undefined') {
        log('Clipboard client not loaded', 'error');
        return;
      }

      window.clipboardBridge.read();
      log('Reading server clipboard...', 'info');
    }

    // Log input changes
    document.getElementById('test-input').addEventListener('input', (e) => {
      log('Input changed: ' + e.target.value, 'info');
    });

    document.getElementById('test-textarea').addEventListener('input', (e) => {
      log('Textarea changed (length: ' + e.target.value.length + ')', 'info');
    });

    // Initial log
    log('Test page loaded. Click "Load Clipboard Client" to start.', 'info');
  </script>
</body>
</html>
  `);
});

// Serve the clipboard client script
app.get('/clipboard-client.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'desktop-clipboard-client.js'));
});

// Start server
const PORT = process.env.TEST_PORT || 4000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          📋 Clipboard Bridge Test Server                  ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Test server running on:                                  ║
║  http://localhost:${PORT}                                    ║
║                                                           ║
║  Instructions:                                            ║
║  1. Make sure your main server is running                ║
║  2. Launch a browser instance via your server            ║
║  3. Open the proxy URL in your desktop browser           ║
║  4. This test page helps verify clipboard bridge works   ║
║                                                           ║
║  Note: This is just a test UI, not the actual            ║
║  Chrome DevTools page. Use it to verify the              ║
║  clipboard client script works correctly.                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
