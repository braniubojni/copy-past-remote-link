/**
 * Example server with clipboard bridge integration
 *
 * This demonstrates how to set up an Express server with the clipboard bridge
 * to enable desktop-to-server clipboard synchronization.
 */

const express = require('express');
const http = require('http');
const browserRunner = require('./index');
const ClipboardBridge = require('./lib/clipboard-bridge');

const app = express();
const server = http.createServer(app);
const clipboardBridge = new ClipboardBridge();

// Initialize clipboard bridge WebSocket server
clipboardBridge.initialize(server);

// Store active sessions
const sessions = new Map();

/**
 * Launch a new Chrome instance
 */
app.post('/launch', async (req, res) => {
  try {
    const startingUrl = req.query.url || 'https://google.com';

    console.log(`🚀 Launching browser with URL: ${startingUrl}`);

    const result = await browserRunner(startingUrl);

    if (!result) {
      throw new Error('Failed to launch browser');
    }

    const { sessionId, cdpClient, pageTarget, proxyUrl } = result;

    // Store session
    sessions.set(sessionId, {
      cdpClient,
      pageTarget,
      createdAt: new Date(),
    });

    // Register CDP client with clipboard bridge
    clipboardBridge.registerSession(sessionId, cdpClient, pageTarget.targetId);

    console.log(`✓ Browser launched. Session: ${sessionId}`);

    res.json({
      success: true,
      sessionId,
      proxyUrl,
      message:
        'Browser launched successfully. Open the proxyUrl in your desktop browser and paste the desktop-clipboard-client.js script in the console.',
    });
  } catch (error) {
    console.error('❌ Failed to launch browser:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get active sessions
 */
app.get('/sessions', (req, res) => {
  const sessionList = Array.from(sessions.entries()).map(([id, data]) => ({
    sessionId: id,
    createdAt: data.createdAt,
  }));

  res.json({
    success: true,
    count: sessionList.length,
    sessions: sessionList,
  });
});

/**
 * Close a session
 */
app.delete('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
    });
  }

  try {
    // Close CDP connection (this will also close Chrome)
    await session.cdpClient.close();
    sessions.delete(sessionId);

    console.log(`✓ Session closed: ${sessionId}`);

    res.json({
      success: true,
      message: 'Session closed successfully',
    });
  } catch (error) {
    console.error('❌ Failed to close session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Serve the desktop clipboard client script
 */
app.get('/clipboard-client.js', (req, res) => {
  res.sendFile(__dirname + '/desktop-clipboard-client.js');
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    activeSessions: sessions.size,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║        🚀 Remote Browser Server with Clipboard Bridge     ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                              ║
║                                                           ║
║  Endpoints:                                               ║
║  • POST   /launch?url=<URL>    : Launch new browser      ║
║  • GET    /sessions            : List active sessions    ║
║  • DELETE /session/:id         : Close session           ║
║  • GET    /clipboard-client.js : Get desktop script      ║
║  • GET    /health              : Health check            ║
║                                                           ║
║  WebSocket:                                               ║
║  • WS /clipboard-bridge?session=<ID> : Clipboard sync    ║
╚═══════════════════════════════════════════════════════════╝

📋 To use clipboard sync from desktop:
1. POST to /launch?url=https://example.com
2. Open the returned proxyUrl in your desktop browser
3. Open browser console (F12)
4. Load the clipboard client:
   
   fetch('http://<SERVER>:${PORT}/clipboard-client.js')
     .then(r => r.text())
     .then(eval);

5. Use Ctrl+Shift+V to paste from desktop to server

`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠ Shutting down gracefully...');

  // Close all sessions
  for (const [sessionId, session] of sessions.entries()) {
    try {
      await session.cdpClient.close();
      console.log(`✓ Closed session: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Failed to close session ${sessionId}:`, error);
    }
  }

  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, clipboardBridge };
