const CDP = require('chrome-remote-interface');
const { setTimeout: sleep } = require('node:timers/promises');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const chrome = await import('chrome-launcher');
    const browserInstance = await chrome.launch({
      logLevel: 'info',
      startingUrl: 'https://code.visualstudio.com/',
      chromeFlags: [
        '--no-sandbox',
        '--disable-gpu',
        // '--enable-automation',
        '--start-maximized',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process,SitePerProcess,Translate',
        '--disable-site-isolation-trials',
        '--remote-allow-origins=*',
        '--enable-blink-features=ClipboardSupport',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--settings-window-size=1920,1080',
        '--disable-setuid-sandbox',
        '--disable-features=VizDisplayCompositor',
        '--allow-running-insecure-content',
        '--disable-web-security',
        '--disable-same-site-by-default-cookies',

        '--v=1',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--force-color-profile=srgb',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--disable-features=SameSiteByDefaultCookies',
        '--allow-running-insecure-content',
      ],
    });

    const protocol = await CDP({
      port: browserInstance.port,
      local: true,
      secure: false,
    });
    const { DOM, Page, Emulation, Runtime, Network, Browser, Target } =
      protocol;

    protocol.on('disconnect', () => {
      console.error('Chrome Debugger disconnected');
    });
    protocol.on('error', (err) => {
      console.error('Debugger Protocol Error:', err);
    });

    await Promise.all([
      DOM.enable(),
      Page.enable(),
      Runtime.enable(),
      Network.enable(),
    ]);
    await Emulation.setFocusEmulationEnabled({ enabled: true });
    await Emulation.setDocumentCookieDisabled({ disabled: false });

    // Get the target info to grant permissions
    const targets = await Target.getTargets();
    const pageTarget = targets.targetInfos.find((t) => t.type === 'page');

    if (pageTarget) {
      // Grant clipboard permissions
      await Browser.grantPermissions({
        origin: pageTarget.url,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      });
      console.log('✓ Clipboard permissions granted for:', pageTarget.url);
    }

    // Also set permissions for the origin once we know the URL
    const grantPermissionsForOrigin = async (url) => {
      try {
        const origin = new URL(url).origin;
        await Browser.grantPermissions({
          origin: origin,
          permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
        });
        console.log('✓ Clipboard permissions granted for origin:', origin);
      } catch (error) {
        console.log('⚠ Could not grant permissions:', error.message);
      }
    };

    // Track network requests
    let pendingRequests = new Set();
    Network.requestWillBeSent((params) => {
      pendingRequests.add(params.requestId);
    });
    Network.responseReceived((params) => {
      pendingRequests.delete(params.requestId);
    });
    Network.loadingFailed((params) => {
      pendingRequests.delete(params.requestId);
    });
    Network.loadingFinished((params) => {
      pendingRequests.delete(params.requestId);
    });

    const data = await fetch(
      `http://localhost:${browserInstance.port}/json/version`
    ).then((res) => res.json());
    const list = await fetch(
      `http://localhost:${browserInstance.port}/json/list`
    ).then((res) => res.json());

    let fullUrl = '';
    for (const info of list.filter((item) => item.type === 'page')) {
      // Extract the WebSocket part from devtoolsFrontendUrl
      const wsParam = info.devtoolsFrontendUrl.split('?ws=')[1];

      // Construct localhost DevTools URL
      fullUrl = `http://localhost:${browserInstance.port}/devtools/inspector.html?ws=${wsParam}`;

      console.log(`DevTools URL: ${fullUrl}`);
      break; // Take the first page
    }
    const { webSocketDebuggerUrl } = data;

    console.log(webSocketDebuggerUrl, 'webSocketDebuggerUrl');

    // Load scripts
    const dompathScript = fs.readFileSync(
      path.join(__dirname, 'dompath.js'),
      'utf8'
    );
    const scriptContent = fs.readFileSync('./inserted-script.js', 'utf8');
    const duglasFunction = `
      window.duglas = async (selector) => {
        console.log('duglas called with selector:', selector);
        const text = await navigator.clipboard.readText();
        console.log(text, 'pasted text');
        const input = document.querySelector(selector);
        if (input) {
          input?.focus();
          const isContentEditable = input.isContentEditable;
          if (isContentEditable) {
            document.execCommand('insertText', false, text);
          } else {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const value = input.value;
            input.value = value.slice(0, start) + text + value.slice(end);
            // Move the cursor to the end of the pasted text
            const newCursorPos = start + text.length;
            input.setSelectionRange(newCursorPos, newCursorPos);
            // Dispatch input event to notify any listeners
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
          }
        }
      };
    `;

    // Combine all scripts into one for initial injection
    const combinedScript = `
      ${dompathScript}
      ${duglasFunction}
      ${scriptContent}
    `;

    // Helper function to wait for network idle
    const waitForNetworkIdle = async (timeout = 5000, idleTime = 500) => {
      const startTime = Date.now();
      console.log('Waiting for network to be idle...');

      while (Date.now() - startTime < timeout) {
        if (pendingRequests.size === 0) {
          console.log(
            `Network idle detected, waiting ${idleTime}ms for stability...`
          );
          await sleep(idleTime);
          if (pendingRequests.size === 0) {
            console.log('✓ Network is stable');
            return true;
          }
        }
        await sleep(100);
      }
      console.log(
        `⚠ Network idle timeout after ${timeout}ms (${pendingRequests.size} requests pending)`
      );
      return false;
    };

    // Helper function to inject scripts with verification
    const injectScripts = async (context = 'initial') => {
      try {
        console.log(`🔧 Injecting scripts (${context})...`);
        await Runtime.evaluate({
          expression: combinedScript,
          awaitPromise: false,
        });

        // Verify injection worked
        const verification = await Runtime.evaluate({
          expression:
            'typeof window.DOMPath !== "undefined" && typeof window.__COMET_INJECTED__ !== "undefined"',
          returnByValue: true,
        });

        if (verification.result.value) {
          console.log(`✅ Scripts successfully injected (${context})`);
          return true;
        } else {
          console.log(`❌ Script injection verification failed (${context})`);
          return false;
        }
      } catch (error) {
        console.error(
          `❌ Error injecting scripts (${context}):`,
          error.message
        );
        return false;
      }
    };

    // Use Page.addScriptToEvaluateOnNewDocument to inject scripts on every page load
    await Page.addScriptToEvaluateOnNewDocument({
      source: combinedScript,
    });
    console.log('✓ Script registered for new documents');

    // Wait for initial page load and network idle before injecting
    let pageLoaded = false;
    Page.loadEventFired(async () => {
      if (pageLoaded) {
        console.log('📄 Page reloaded...');
      }
      pageLoaded = true;
      console.log('📄 Page.loadEventFired triggered');

      // Wait for network to be idle
      await waitForNetworkIdle(5000, 500);

      // Inject scripts after network is stable
      const success = await injectScripts('after-load');

      // If injection failed, retry a few times
      if (!success) {
        for (let i = 1; i <= 3; i++) {
          console.log(`🔄 Retrying injection (attempt ${i}/3)...`);
          await sleep(1000);
          if (await injectScripts(`retry-${i}`)) {
            break;
          }
        }
      }
    });

    // Handle frame navigations (for SPAs)
    Page.frameNavigated(async (params) => {
      // Only handle main frame navigations
      if (!params.frame.parentId) {
        console.log('🔄 Main frame navigated to:', params.frame.url);

        // Grant permissions for the new URL
        await grantPermissionsForOrigin(params.frame.url);

        await sleep(500); // Give the page a moment to start loading
        await waitForNetworkIdle(5000, 500);
        await injectScripts('after-navigation');
      }
    });

    // Also inject immediately for the current page
    await sleep(1000); // Initial delay to let page start loading
    await waitForNetworkIdle(5000, 500);
    await injectScripts('initial');

    // Set up periodic verification and re-injection if needed
    setInterval(async () => {
      try {
        const verification = await Runtime.evaluate({
          expression: 'typeof window.__COMET_INJECTED__ !== "undefined"',
          returnByValue: true,
        });

        if (!verification.result.value) {
          console.log('⚠ Scripts lost, re-injecting...');
          await injectScripts('periodic-check');
        }
      } catch {
        // Ignore errors during verification
      }
    }, 5000); // Check every 5 seconds
    console.log({ fullUrl });
  } catch (error) {
    console.error('Error launching browser:', error);
  }
}

run();
