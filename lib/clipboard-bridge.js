const WebSocket = require('ws');

/**
 * ClipboardBridge - Manages bidirectional clipboard sync between desktop and server
 *
 * Architecture:
 * 1. Desktop client connects via WebSocket to /clipboard-bridge
 * 2. Desktop sends clipboard data and paste events
 * 3. Server receives and injects into Chrome via CDP
 * 4. Server can send back confirmation or data requests
 */
class ClipboardBridge {
  constructor() {
    this.wss = null;
    this.cdpClient = null;
    this.clients = new Map(); // sessionId -> WebSocket
    this.sessions = new Map(); // sessionId -> { client: ws, cdpClient, targetId }
  }

  /**
   * Initialize WebSocket server for clipboard bridge
   * @param {http.Server} httpServer - Express HTTP server
   */
  initialize(httpServer) {
    this.wss = new WebSocket.Server({
      server: httpServer,
      path: '/clipboard-bridge',
    });

    this.wss.on('connection', (ws, req) => {
      const sessionId = new URL(req.url, 'http://localhost').searchParams.get(
        'session'
      );

      console.log(`📋 Clipboard bridge connected for session: ${sessionId}`);

      // Store client connection
      this.clients.set(sessionId, ws);

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleClientMessage(sessionId, data);
        } catch (error) {
          console.error('❌ Error handling clipboard message:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              error: error.message,
            })
          );
        }
      });

      ws.on('close', () => {
        console.log(
          `📋 Clipboard bridge disconnected for session: ${sessionId}`
        );
        this.clients.delete(sessionId);
        this.sessions.delete(sessionId);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });

      // Send ready confirmation
      ws.send(
        JSON.stringify({
          type: 'ready',
          sessionId,
        })
      );
    });

    console.log('✓ Clipboard bridge WebSocket server initialized');
  }

  /**
   * Register CDP client for a session
   * @param {string} sessionId - Session identifier
   * @param {Object} cdpClient - Chrome DevTools Protocol client
   * @param {string} targetId - Target page ID
   */
  registerSession(sessionId, cdpClient, targetId) {
    const client = this.clients.get(sessionId);
    this.sessions.set(sessionId, {
      client,
      cdpClient,
      targetId,
    });
    console.log(`✓ Registered CDP session: ${sessionId}`);
  }

  /**
   * Handle messages from desktop client
   * @param {string} sessionId - Session identifier
   * @param {Object} data - Message data from client
   */
  async handleClientMessage(sessionId, data) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      console.warn(`⚠ No session found for: ${sessionId}`);
      return;
    }

    const { cdpClient, targetId, client } = session;

    switch (data.type) {
      case 'clipboard-write': {
        // Desktop wants to write to server clipboard
        await this.writeToServerClipboard(cdpClient, targetId, data.text);
        client?.send(
          JSON.stringify({
            type: 'clipboard-write-ack',
            success: true,
          })
        );
        break;
      }

      case 'clipboard-read': {
        // Desktop requests server clipboard content
        const clipboardText = await this.readServerClipboard(cdpClient);
        client?.send(
          JSON.stringify({
            type: 'clipboard-read-response',
            text: clipboardText,
          })
        );
        break;
      }

      case 'paste-event': {
        // Desktop triggered paste - inject text into focused element
        await this.injectPaste(cdpClient, targetId, data.text, data.selector);
        client?.send(
          JSON.stringify({
            type: 'paste-event-ack',
            success: true,
          })
        );
        break;
      }

      case 'keyboard-event': {
        // Forward keyboard event to server Chrome
        await this.forwardKeyboardEvent(cdpClient, data.event);
        break;
      }

      case 'ping': {
        // Health check
        client?.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      default:
        console.warn(`⚠ Unknown message type: ${data.type}`);
    }
  }

  /**
   * Write text to server clipboard via CDP
   * @param {Object} cdpClient - CDP client
   * @param {string} targetId - Target ID
   * @param {string} text - Text to write
   */
  async writeToServerClipboard(cdpClient, targetId, text) {
    try {
      // Use CDP to execute clipboard write
      await cdpClient.Runtime.evaluate({
        expression: `
          (async () => {
            try {
              await navigator.clipboard.writeText(${JSON.stringify(text)});
              return { success: true };
            } catch (error) {
              return { success: false, error: error.message };
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      });
      console.log(`✓ Wrote to server clipboard: ${text.substring(0, 50)}...`);
    } catch (error) {
      console.error('❌ Failed to write to clipboard:', error);
      throw error;
    }
  }

  /**
   * Read text from server clipboard via CDP
   * @param {Object} cdpClient - CDP client
   * @returns {Promise<string>} Clipboard text
   */
  async readServerClipboard(cdpClient) {
    try {
      const result = await cdpClient.Runtime.evaluate({
        expression: `
          (async () => {
            try {
              const text = await navigator.clipboard.readText();
              return text;
            } catch (error) {
              return '';
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      });

      const text = result.result.value || '';
      console.log(`✓ Read from server clipboard: ${text.substring(0, 50)}...`);
      return text;
    } catch (error) {
      console.error('❌ Failed to read clipboard:', error);
      return '';
    }
  }

  /**
   * Inject paste into focused element
   * @param {Object} cdpClient - CDP client
   * @param {string} targetId - Target ID
   * @param {string} text - Text to paste
   * @param {string} selector - Optional selector for target element
   */
  async injectPaste(cdpClient, targetId, text, selector) {
    try {
      const expression = selector
        ? `
          (async () => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (element) {
              const currentValue = element.value || '';
              const start = element.selectionStart || 0;
              const end = element.selectionEnd || 0;
              const newValue = currentValue.substring(0, start) + ${JSON.stringify(
                text
              )} + currentValue.substring(end);
              element.value = newValue;
              element.selectionStart = element.selectionEnd = start + ${
                text.length
              };
              
              // Trigger events
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              
              return { success: true, selector: ${JSON.stringify(selector)} };
            }
            return { success: false, error: 'Element not found' };
          })()
        `
        : `
          (async () => {
            const element = document.activeElement;
            if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)) {
              const currentValue = element.value || element.textContent || '';
              const start = element.selectionStart || 0;
              const end = element.selectionEnd || 0;
              
              if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.value = currentValue.substring(0, start) + ${JSON.stringify(
                  text
                )} + currentValue.substring(end);
                element.selectionStart = element.selectionEnd = start + ${
                  text.length
                };
              } else if (element.isContentEditable) {
                document.execCommand('insertText', false, ${JSON.stringify(
                  text
                )});
              }
              
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              
              return { success: true, element: element.tagName };
            }
            return { success: false, error: 'No active editable element' };
          })()
        `;

      const result = await cdpClient.Runtime.evaluate({
        expression,
        awaitPromise: true,
        returnByValue: true,
      });

      console.log(`✓ Injected paste:`, result.result.value);
    } catch (error) {
      console.error('❌ Failed to inject paste:', error);
      throw error;
    }
  }

  /**
   * Forward keyboard event to Chrome
   * @param {Object} cdpClient - CDP client
   * @param {Object} event - Keyboard event details
   */
  async forwardKeyboardEvent(cdpClient, event) {
    try {
      await cdpClient.Input.dispatchKeyEvent({
        type: event.type || 'keyDown',
        key: event.key,
        code: event.code,
        modifiers: event.modifiers || 0,
      });
      console.log(`✓ Forwarded keyboard event: ${event.key}`);
    } catch (error) {
      console.error('❌ Failed to forward keyboard event:', error);
    }
  }

  /**
   * Send message to desktop client
   * @param {string} sessionId - Session identifier
   * @param {Object} data - Data to send
   */
  sendToClient(sessionId, data) {
    const client = this.clients.get(sessionId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  /**
   * Broadcast to all connected clients
   * @param {Object} data - Data to broadcast
   */
  broadcast(data) {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

module.exports = ClipboardBridge;
