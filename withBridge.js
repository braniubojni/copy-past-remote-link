const CDP = require('chrome-remote-interface');
const PermissionsManager = require('./lib/permissions');
const NetworkMonitor = require('./lib/network-monitor');
const ScriptInjector = require('./lib/script-injector');
const DevToolsInfo = require('./lib/devtools-info');
const PageEventHandler = require('./lib/page-event-handler');
const CHROME_FLAGS = require('./lib/chrome-flags');
const createProxy = require('./lib/proxy');
const { ServerEventListener } = require('./lib/client-to-server-events');
const ClipboardBridge = require('./lib/clipboard-bridge');

const browserRunner = async (startingUrl = null) => {
  if (!startingUrl) {
    throw new Error('startingUrl is required');
  }

  try {
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

    // NEW: Initialize Clipboard Bridge
    const clipboardBridge = new ClipboardBridge(protocol);

    // Get the target info to grant permissions
    const targets = await Target.getTargets();
    const pageTarget = targets.targetInfos.find((t) => t.type === 'page');
    await permissionsManager.grantForTarget(pageTarget);

    // Get DevTools URLs and WebSocket information
    const { fullUrl, pageWsUrl, browserWsUrl } =
      await devToolsInfo.getPageInfo();

    // Register scripts for new documents
    await scriptInjector.registerForNewDocuments();

    // Setup page event listeners
    pageEventHandler.setupListeners();

    // Perform initial script injection
    await pageEventHandler.performInitialInjection();

    // NEW: Inject clipboard bridge client script
    await clipboardBridge.injectClientScript();

    // Setup server event listener for client-to-server communication
    const serverEvents = new ServerEventListener(protocol);

    // Register event listeners for copy/cut events
    serverEvents.on('copy', (data, timestamp) => {
      // Automatically sync copied text to clipboard bridge
      if (data.text) {
        clipboardBridge.setClipboard(data.text);
        console.log(
          `📋 Synced copied text to clipboard: "${data.text.substring(
            0,
            30
          )}..."`
        );
      }
    });

    serverEvents.on('cut', (data) => {
      if (data.text) {
        clipboardBridge.setClipboard(data.text);
        console.log(
          `📋 Synced cut text to clipboard: "${data.text.substring(0, 30)}..."`
        );
      }
    });

    console.log('✓ Server event listener initialized');

    // Setup proxy to access DevTools frontend from local network
    const proxyUrl = await createProxy(browserInstance.port, fullUrl);
    console.log(`🌐 DevTools accessible on local network: ${proxyUrl}`);

    console.log({ fullUrl, pageWsUrl, proxyUrl });

    return {
      fullUrl,
      wsUrl: pageWsUrl,
      browserWsUrl,
      proxyUrl,
      serverEvents,
      clipboardBridge, // NEW: Return clipboard bridge
      protocol, // NEW: Return protocol for direct access
    };
  } catch (error) {
    console.error('Error launching browser:', error);
    throw error;
  }
};

browserRunner('https://code.visualstudio.com');

// module.exports = browserRunner;
