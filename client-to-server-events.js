/**
 * Client to Server Event System Example
 *
 * This demonstrates how to emit events from the client (injected script in browser)
 * to the server using CDP Runtime.evaluate and custom event handlers.
 */

// =============================================================================
// SERVER SIDE (Node.js)
// =============================================================================

/**
 * Event listener on the server side
 * This will be called when client emits events
 */
class ServerEventListener {
  constructor(cdpClient) {
    this.cdpClient = cdpClient;
    this.listeners = new Map();
    this.pollingInterval = null;
    this.setupPolling();
  }

  /**
   * Register an event listener
   * @param {string} eventName - Name of the event to listen for
   * @param {Function} callback - Callback function to execute
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);
    console.log(`✓ Registered listener for event: ${eventName}`);
  }

  /**
   * Remove an event listener
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Callback function to remove
   */
  off(eventName, callback) {
    if (!this.listeners.has(eventName)) return;

    const callbacks = this.listeners.get(eventName);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
      console.log(`✓ Removed listener for event: ${eventName}`);
    }
  }

  /**
   * Poll for events from the client
   * This checks a global variable in the browser that the client sets
   */
  setupPolling() {
    this.pollingInterval = setInterval(async () => {
      try {
        // Check if there are any pending events in the browser
        const result = await this.cdpClient.Runtime.evaluate({
          expression: `
            (function() {
              if (window.__SERVER_EVENT_QUEUE__ && window.__SERVER_EVENT_QUEUE__.length > 0) {
                const events = [...window.__SERVER_EVENT_QUEUE__];
                window.__SERVER_EVENT_QUEUE__ = []; // Clear the queue
                return events;
              }
              return null;
            })()
          `,
          returnByValue: true,
        });

        if (result.result.value && Array.isArray(result.result.value)) {
          // Process each event
          for (const event of result.result.value) {
            this.handleEvent(event);
          }
        }
      } catch (error) {
        console.error('Error polling for events:', error.message);
      }
    }, 100); // Poll every 100ms
  }

  /**
   * Handle an event from the client
   * @param {Object} event - Event object from client
   */
  handleEvent(event) {
    const { name, data, timestamp } = event;

    console.log(`📨 Received event from client: ${name}`, data);

    // Call all registered listeners for this event
    if (this.listeners.has(name)) {
      const callbacks = this.listeners.get(name);
      for (const callback of callbacks) {
        try {
          callback(data, timestamp);
        } catch (error) {
          console.error(`Error in event listener for ${name}:`, error);
        }
      }
    }
  }

  /**
   * Stop polling for events
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('✓ Stopped event polling');
    }
  }
}

// =============================================================================
// CLIENT SIDE (Browser - injected script)
// =============================================================================

/**
 * This code will be injected into the browser
 * It provides an API for emitting events to the server
 */
const CLIENT_SCRIPT = `
(function() {
	// Initialize event queue if it doesn't exist
	if (!window.__SERVER_EVENT_QUEUE__) {
		window.__SERVER_EVENT_QUEUE__ = [];
	}

	// Event emitter for client-to-server communication
	window.emitToServer = function(eventName, data) {
		const event = {
			name: eventName,
			data: data,
			timestamp: Date.now()
		};
		
		window.__SERVER_EVENT_QUEUE__.push(event);
		console.log('📤 Emitted to server:', eventName, data);
	};

	// Example: Listen for Ctrl/Meta + C and emit to server
	document.addEventListener('keydown', (event) => {
		const modifierKey = event.ctrlKey || event.metaKey;
		
		if (modifierKey && event.key.toLowerCase() === 'c') {
			// Get selected text
			const selectedText = window.getSelection().toString();
			
			// Emit copy event to server
			window.emitToServer('copy', {
				text: selectedText,
				url: window.location.href,
				timestamp: new Date().toISOString()
			});
		}
		
		if (modifierKey && event.key.toLowerCase() === 'v') {
			// Emit paste event to server
			window.emitToServer('paste', {
				url: window.location.href,
				timestamp: new Date().toISOString()
			});
		}
	});

	console.log('✓ Client-to-server event emitter initialized');
})();
`;

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/**
 * Example of how to use the event system
 */
async function setupClientToServerEvents(cdpClient) {
  // 1. Inject the client script into the browser
  await cdpClient.Runtime.evaluate({
    expression: CLIENT_SCRIPT,
  });

  console.log('✓ Client event emitter injected');

  // 2. Create server event listener
  const serverEvents = new ServerEventListener(cdpClient);

  // 3. Register event listeners
  serverEvents.on('copy', (data, timestamp) => {
    console.log(
      '\n╔═══════════════════════════════════════════════════════════╗'
    );
    console.log(
      '║                  📋 COPY EVENT DETECTED                   ║'
    );
    console.log(
      '╠═══════════════════════════════════════════════════════════╣'
    );
    console.log(`║  Text: ${data.text.substring(0, 40).padEnd(40)} ║`);
    console.log(`║  URL:  ${data.url.substring(0, 40).padEnd(40)} ║`);
    console.log(
      `║  Time: ${new Date(timestamp).toLocaleTimeString().padEnd(40)} ║`
    );
    console.log(
      '╚═══════════════════════════════════════════════════════════╝\n'
    );

    // Do something with the copied text
    // For example: save to database, sync to clipboard, etc.
  });

  serverEvents.on('paste', (data) => {
    console.log('📋 Paste event:', data);
  });

  serverEvents.on('custom-event', (data) => {
    console.log('🎯 Custom event:', data);
  });

  return serverEvents;
}

// Export for use in other files
module.exports = {
  ServerEventListener,
  CLIENT_SCRIPT,
  setupClientToServerEvents,
};

// =============================================================================
// INTEGRATION WITH YOUR index.js
// =============================================================================

/**
 * How to integrate this into your existing index.js:
 *
 * const { setupClientToServerEvents } = require('./client-to-server-events');
 *
 * // After connecting to CDP and enabling domains
 * const serverEvents = await setupClientToServerEvents(protocol);
 *
 * // Register your own event listeners
 * serverEvents.on('copy', (data) => {
 *   console.log('User copied:', data.text);
 *   // Your custom logic here
 * });
 *
 * // Don't forget to clean up when closing
 * process.on('SIGINT', () => {
 *   serverEvents.stop();
 *   process.exit();
 * });
 */

// =============================================================================
// ADVANCED: Emit custom events from client
// =============================================================================

/**
 * You can emit any custom event from the browser console or injected scripts:
 *
 * // In browser console or injected script:
 * window.emitToServer('custom-event', {
 *   message: 'Hello from client!',
 *   userId: 123,
 *   action: 'button-click'
 * });
 *
 * // On server:
 * serverEvents.on('custom-event', (data) => {
 *   console.log('Received:', data.message);
 * });
 */
