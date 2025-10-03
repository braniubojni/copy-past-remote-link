const CDP = require('chrome-remote-interface');
const http = require('http');
const PermissionsManager = require('./lib/permissions');
const NetworkMonitor = require('./lib/network-monitor');
const ScriptInjector = require('./lib/script-injector');
const DevToolsInfo = require('./lib/devtools-info');
const PageEventHandler = require('./lib/page-event-handler');
const CHROME_FLAGS = require('./lib/chrome-flags');
const createProxy = require('./lib/proxy');
const ClipboardBridge = require('./lib/clipboard-bridge');

const browserRunner = async (startingUrl = null, options = {}) => {
  if (!startingUrl) {
    throw new Error('startingUrl is required');
  }

  const {
    enableClipboardBridge = true,
    clipboardBridgePort = 0, // 0 = random available port
  } = options;

  let server = null;
  let clipboardBridge = null;

  try {
    // Initialize HTTP server and clipboard bridge if enabled
    if (enableClipboardBridge) {
      server = http.createServer((req, res) => {
        // Simple health check endpoint
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', clipboardBridge: 'active' }));
          return;
        }

        // Serve clipboard client script
        if (req.url === '/clipboard-client.js') {
          const fs = require('fs');
          const path = require('path');
          const clientScript = fs.readFileSync(
            path.join(__dirname, 'desktop-clipboard-client.js'),
            'utf-8'
          );
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          res.end(clientScript);
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      // Start HTTP server
      await new Promise((resolve, reject) => {
        server.listen(clipboardBridgePort, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const actualPort = server.address().port;
      console.log(
        `📋 Clipboard bridge HTTP server running on port ${actualPort}`
      );

      // Initialize clipboard bridge WebSocket
      clipboardBridge = new ClipboardBridge();
      clipboardBridge.initialize(server);
      console.log(`✓ Clipboard bridge WebSocket initialized`);
    }

    // Launch Chrome browser
    const chrome = await import('chrome-launcher');
    const browserInstance = await chrome.launch({
      logLevel: 'info',
      startingUrl,
      chromeFlags: CHROME_FLAGS,
    });

    // Connect to Chrome DevTools Protocol
    const protocol = await CDP({
      port: browserInstance.port,
      local: true,
      secure: false,
    });
    const { DOM, Page, Emulation, Runtime, Network, Browser, Target } =
      protocol;

    // Setup protocol event handlers
    protocol.on('disconnect', () => {
      console.error('Chrome Debugger disconnected');
    });
    protocol.on('error', (err) => {
      console.error('Debugger Protocol Error:', err);
    });

    // Enable required domains
    await Promise.all([
      DOM.enable(),
      Page.enable(),
      Runtime.enable(),
      Network.enable(),
    ]);
    await Emulation.setFocusEmulationEnabled({ enabled: true });
    await Emulation.setDocumentCookieDisabled({ disabled: false });

    // Initialize managers and handlers
    const permissionsManager = new PermissionsManager(Browser);
    const networkMonitor = new NetworkMonitor(Network);
    const scriptInjector = new ScriptInjector(Runtime, Page);
    const devToolsInfo = new DevToolsInfo(browserInstance);
    const pageEventHandler = new PageEventHandler(
      Page,
      networkMonitor,
      scriptInjector,
      permissionsManager
    );

    // Get the target info to grant permissions
    const targets = await Target.getTargets();
    const pageTarget = targets.targetInfos.find((t) => t.type === 'page');
    await permissionsManager.grantForTarget(pageTarget);

    // Get DevTools URLs and WebSocket information
    const { fullUrl, pageWsUrl, browserWsUrl, port } =
      await devToolsInfo.getPageInfo();

    // Extract session ID from page WebSocket URL
    // Format: ws://localhost:PORT/devtools/page/SESSION_ID
    const sessionId = pageWsUrl.split('/').pop();

    // Register scripts for new documents
    await scriptInjector.registerForNewDocuments();

    // Setup page event listeners
    pageEventHandler.setupListeners();

    // Perform initial script injection
    await pageEventHandler.performInitialInjection();

    // Setup proxy to access DevTools frontend from local network
    const proxyUrl = await createProxy(port, fullUrl);
    console.log(`🌐 DevTools accessible on local network: ${proxyUrl}`);

    // Register session with clipboard bridge if enabled
    if (enableClipboardBridge && clipboardBridge) {
      clipboardBridge.registerSession(sessionId, protocol, pageTarget.targetId);
      console.log(`✓ Clipboard bridge session registered: ${sessionId}`);

      const bridgePort = server.address().port;
      const clipboardClientUrl = `http://localhost:${bridgePort}/clipboard-client.js`;

      console.log(`
╔═══════════════════════════════════════════════════════════╗
║           📋 Clipboard Bridge Active                      ║
╠═══════════════════════════════════════════════════════════╣
║  To sync desktop clipboard with server Chrome:           ║
║                                                           ║
║  1. Open DevTools in your browser:                       ║
║     ${proxyUrl.substring(0, 50)}...
║                                                           ║
║  2. Open browser console (F12) and run:                  ║
║                                                           ║
║     fetch('${clipboardClientUrl}')
║       .then(r => r.text())                               ║
║       .then(eval);                                       ║
║                                                           ║
║  3. Use keyboard shortcuts:                              ║
║     • Ctrl+Shift+V : Paste from desktop to server       ║
║     • Ctrl+Shift+C : Sync desktop clipboard to server   ║
║     • Ctrl+Shift+R : Read server clipboard              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    }

    console.log({ fullUrl, pageWsUrl, proxyUrl });
    return {
      fullUrl,
      wsUrl: pageWsUrl, // Return the page WebSocket URL, not browser
      browserWsUrl, // Also return browser WebSocket for reference
      proxyUrl, // Return the proxy URL for local network access
      sessionId, // Return session ID for clipboard bridge
      cdpClient: protocol, // Return CDP client for clipboard bridge
      pageTarget, // Return page target
      clipboardBridge, // Return clipboard bridge instance
      clipboardBridgePort: server ? server.address().port : null, // Return clipboard bridge port
      clipboardClientUrl: server
        ? `http://localhost:${server.address().port}/clipboard-client.js`
        : null,
    };
  } catch (error) {
    console.error('Error launching browser:', error);
    // Clean up on error
    if (server) {
      server.close();
    }
    throw error;
  }
};

// Example usage with clipboard bridge enabled (default)
browserRunner('https://code.visualstudio.com', {
  enableClipboardBridge: true,
  clipboardBridgePort: 0, // 0 = random available port
}).catch(console.error);

// Export for use in other modules
// module.exports = browserRunner;
