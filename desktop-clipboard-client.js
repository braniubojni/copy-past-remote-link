/**
 * Desktop Clipboard Client
 *
 * This script runs in the DevTools inspector page on the desktop
 * and syncs clipboard operations with the server Chrome instance.
 *
 * Usage:
 * 1. Open DevTools inspector page in your desktop browser
 * 2. Open browser console (F12)
 * 3. Paste and run this script
 * 4. Use Ctrl/Cmd+V to paste from your desktop clipboard to server
 */

(function () {
  'use strict';

  // Extract session ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const wsParam = urlParams.get('ws');

  if (!wsParam) {
    console.error('❌ No WebSocket parameter found in URL');
    return;
  }

  // Extract server address from ws parameter
  // Format: ws=18.116.87.87:55014/devtools/page/SESSION_ID
  const [serverAddress, ...pathParts] = wsParam.split('/');
  const sessionId = pathParts[pathParts.length - 1];

  if (!sessionId) {
    console.error('❌ Could not extract session ID from URL');
    return;
  }

  // Build WebSocket URL for clipboard bridge
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${serverAddress}/clipboard-bridge?session=${sessionId}`;

  console.log(`📋 Connecting to clipboard bridge: ${wsUrl}`);

  let ws = null;
  let reconnectTimeout = null;
  let isReady = false;

  /**
   * Connect to clipboard bridge WebSocket
   */
  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✓ Connected to clipboard bridge');
      clearTimeout(reconnectTimeout);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (error) {
        console.error('❌ Failed to parse message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log(
        '⚠ Disconnected from clipboard bridge. Reconnecting in 3s...'
      );
      isReady = false;
      reconnectTimeout = setTimeout(connect, 3000);
    };
  }

  /**
   * Handle messages from server
   */
  function handleServerMessage(data) {
    switch (data.type) {
      case 'ready':
        isReady = true;
        console.log(`✓ Clipboard bridge ready. Session: ${data.sessionId}`);
        break;

      case 'clipboard-write-ack':
        console.log('✓ Server clipboard updated');
        break;

      case 'clipboard-read-response':
        console.log(`📋 Server clipboard: ${data.text.substring(0, 50)}...`);
        break;

      case 'paste-event-ack':
        console.log('✓ Paste injected on server');
        break;

      case 'pong':
        console.log('🏓 Pong received');
        break;

      case 'error':
        console.error('❌ Server error:', data.error);
        break;

      default:
        console.warn('⚠ Unknown message type:', data.type);
    }
  }

  /**
   * Send message to server
   */
  function send(data) {
    if (!isReady) {
      console.warn('⚠ Clipboard bridge not ready yet');
      return false;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }

    console.warn('⚠ WebSocket not connected');
    return false;
  }

  /**
   * Write desktop clipboard to server
   */
  async function syncClipboardToServer() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        console.log(
          `📋 Syncing clipboard to server: ${text.substring(0, 50)}...`
        );
        send({
          type: 'clipboard-write',
          text: text,
        });
      }
    } catch (error) {
      console.error('❌ Failed to read desktop clipboard:', error);
    }
  }

  /**
   * Read server clipboard to desktop
   */
  function readServerClipboard() {
    send({
      type: 'clipboard-read',
    });
  }

  /**
   * Paste desktop clipboard into server page
   */
  async function pasteToServer(selector = null) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        console.log(`📋 Pasting to server: ${text.substring(0, 50)}...`);
        send({
          type: 'paste-event',
          text: text,
          selector: selector,
        });
      }
    } catch (error) {
      console.error('❌ Failed to read desktop clipboard:', error);
    }
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', async (e) => {
    // Ctrl/Cmd + Shift + V: Paste from desktop to server
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      console.log('⌨️  Ctrl+Shift+V: Pasting to server...');
      await pasteToServer();
      return;
    }

    // Ctrl/Cmd + Shift + C: Sync clipboard to server
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      console.log('⌨️  Ctrl+Shift+C: Syncing clipboard to server...');
      await syncClipboardToServer();
      return;
    }

    // Ctrl/Cmd + Shift + R: Read server clipboard
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      console.log('⌨️  Ctrl+Shift+R: Reading server clipboard...');
      readServerClipboard();
      return;
    }
  });

  // Auto-sync clipboard on focus (optional)
  let autoSync = false;
  window.addEventListener('focus', () => {
    if (autoSync && isReady) {
      syncClipboardToServer();
    }
  });

  // Connect
  connect();

  // Expose API to window for manual control
  window.clipboardBridge = {
    sync: syncClipboardToServer,
    read: readServerClipboard,
    paste: pasteToServer,
    send: send,

    // Toggle auto-sync
    setAutoSync: (enabled) => {
      autoSync = enabled;
      console.log(`📋 Auto-sync ${enabled ? 'enabled' : 'disabled'}`);
    },

    // Health check
    ping: () => {
      send({ type: 'ping' });
    },

    // Get connection status
    getStatus: () => ({
      connected: ws?.readyState === WebSocket.OPEN,
      ready: isReady,
      sessionId: sessionId,
      wsUrl: wsUrl,
    }),
  };

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           📋 Desktop Clipboard Bridge Active              ║
╠═══════════════════════════════════════════════════════════╣
║  Keyboard Shortcuts:                                      ║
║  • Ctrl+Shift+V : Paste from desktop to server           ║
║  • Ctrl+Shift+C : Sync desktop clipboard to server       ║
║  • Ctrl+Shift+R : Read server clipboard                  ║
║                                                           ║
║  API Methods (window.clipboardBridge):                    ║
║  • sync()        : Sync clipboard to server              ║
║  • paste()       : Paste to server                       ║
║  • read()        : Read server clipboard                 ║
║  • setAutoSync(bool) : Toggle auto-sync on focus         ║
║  • ping()        : Test connection                       ║
║  • getStatus()   : Get connection info                   ║
╚═══════════════════════════════════════════════════════════╝
  `);
})();
