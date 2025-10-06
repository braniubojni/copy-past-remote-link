/**
 * Clipboard Bridge for Remote Browser Automation
 *
 * This manages clipboard state on the server and injects text
 * directly into the remote browser using CDP Input.insertText,
 * completely bypassing navigator.clipboard limitations.
 */

class ClipboardBridge {
  constructor(cdpClient) {
    this.cdpClient = cdpClient;
    this.clipboardContent = '';
    this.pasteQueue = [];
    this.clipboardModulePromise = null;
    this.setupPasteListener();
  }

  async loadClipboardModule() {
    if (!this.clipboardModulePromise) {
      this.clipboardModulePromise = import('clipboardy').catch((error) => {
        console.warn(
          '⚠️ clipboardy not available; system clipboard sync disabled:',
          error.message
        );
        return null;
      });
    }
    return this.clipboardModulePromise;
  }

  async readSystemClipboard() {
    const clipboardModule = await this.loadClipboardModule();
    if (!clipboardModule || !clipboardModule.default) {
      return null;
    }

    try {
      const value = await clipboardModule.default.read();
      return value;
    } catch (error) {
      console.warn('⚠️ Unable to read system clipboard:', error.message);
      return null;
    }
  }

  async writeSystemClipboard(text) {
    const clipboardModule = await this.loadClipboardModule();
    if (!clipboardModule || !clipboardModule.default) {
      return;
    }

    try {
      await clipboardModule.default.write(text);
    } catch (error) {
      console.warn('⚠️ Unable to write to system clipboard:', error.message);
    }
  }

  async ensureClipboardContent() {
    if (this.clipboardContent) {
      return;
    }

    const systemClipboard = await this.readSystemClipboard();
    if (systemClipboard) {
      this.clipboardContent = systemClipboard;
      console.log(
        `📋 Loaded system clipboard: "${systemClipboard.substring(0, 50)}..."`
      );
    }
  }

  /**
   * Set clipboard content from server side
   * Call this from your automation script when you want to "paste"
   */
  setClipboard(text) {
    this.clipboardContent = text;
    this.writeSystemClipboard(text);
    console.log(`📋 Clipboard updated: "${text.substring(0, 50)}..."`);
  }

  /**
   * Get current clipboard content
   */
  getClipboard() {
    return this.clipboardContent;
  }

  /**
   * Listen for paste requests from the browser
   * When user presses Ctrl+V in browser, we intercept and inject from server clipboard
   */
  setupPasteListener() {
    // Poll for paste requests from the browser
    setInterval(async () => {
      try {
        const result = await this.cdpClient.Runtime.evaluate({
          expression: `
            (function() {
              if (window.__PASTE_QUEUE__ && window.__PASTE_QUEUE__.length > 0) {
                const requests = [...window.__PASTE_QUEUE__];
                window.__PASTE_QUEUE__ = [];
                return requests;
              }
              return null;
            })()
          `,
          returnByValue: true,
        });

        if (result.result.value && Array.isArray(result.result.value)) {
          for (const request of result.result.value) {
            await this.executePaste(request);
          }
        }
      } catch (error) {
        console.error('Error checking paste queue:', error.message);
      }
    }, 50); // Check every 50ms for responsive pasting
  }

  /**
   * Execute paste operation using CDP Input.insertText
   */
  async executePaste(request) {
    const { selector } = request;

    await this.ensureClipboardContent();

    if (!this.clipboardContent) {
      console.warn('⚠️ No clipboard content to paste');
      return;
    }

    const { Runtime, DOM, Input } = this.cdpClient;

    if (!Runtime?.evaluate || !DOM?.getDocument) {
      console.error('❌ Paste failed: Runtime or DOM domain unavailable');
      return;
    }

    const inputSupported =
      typeof Input?.insertText === 'function' && Input !== undefined;

    try {
      console.log(`📋 Executing paste into: ${selector}`);

      if (typeof DOM.enable === 'function') {
        await DOM.enable().catch(() => {});
      }

      // Get the element
      const { root } = await DOM.getDocument();
      const { nodeId } = await DOM.querySelector({
        nodeId: root.nodeId,
        selector: selector,
      });

      if (!nodeId) {
        console.warn(`⚠️ Unable to find element for selector: ${selector}`);
        await this.fallbackPaste(selector);
        return;
      }

      // Focus the element (required for Input.insertText)
      if (typeof DOM.focus === 'function') {
        await DOM.focus({ nodeId });
      }

      if (inputSupported) {
        // Insert text directly - bypasses clipboard entirely
        await Input.insertText({
          text: this.clipboardContent,
        });
      } else {
        throw new Error('Input.insertText not supported by this target');
      }

      console.log(
        `✅ Pasted successfully: "${this.clipboardContent.substring(0, 30)}..."`
      );

      // Dispatch input event to trigger any listeners
      await Runtime.evaluate({
        expression: `
          (function() {
            const el = document.querySelector('${selector}');
            if (el) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `,
      });
    } catch (error) {
      console.error('❌ Paste failed:', error.message);

      await this.fallbackPaste(selector);
    }
  }

  async fallbackPaste(selector) {
    const { Runtime } = this.cdpClient;

    if (!Runtime?.evaluate) {
      console.error('❌ Fallback paste unavailable: Runtime domain missing');
      return;
    }

    try {
      const result = await Runtime.evaluate({
        expression: `
          (function() {
            const el = document.querySelector('${selector}');
            if (!el) {
              return false;
            }
            if (el.isContentEditable) {
              document.execCommand('insertText', false, ${JSON.stringify(
                this.clipboardContent
              )});
            } else {
              const start = el.selectionStart || 0;
              const end = el.selectionEnd || 0;
              const value = el.value || '';
              el.value = value.slice(0, start) + ${JSON.stringify(
                this.clipboardContent
              )} + value.slice(end);
              const newPos = start + ${this.clipboardContent.length};
              if (typeof el.setSelectionRange === 'function') {
                el.setSelectionRange(newPos, newPos);
              }
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          })()
        `,
        returnByValue: true,
      });

      if (result?.result?.value) {
        console.log('✅ Pasted using fallback method');
      } else {
        console.warn(
          `⚠️ Fallback paste could not find element for selector: ${selector}`
        );
      }
    } catch (fallbackError) {
      console.error('❌ Fallback paste also failed:', fallbackError.message);
    }
  }

  /**
   * Manually trigger paste into a specific selector
   * Useful for programmatic pasting
   */
  async pasteInto(selector) {
    return this.executePaste({ selector, timestamp: Date.now() });
  }

  /**
   * Inject the client-side bridge script into the browser
   * This intercepts Ctrl+V and queues paste requests
   */
  async injectClientScript() {
    const clientScript = `
      (function() {
        if (window.__CLIPBOARD_BRIDGE_INJECTED__) return;
        window.__CLIPBOARD_BRIDGE_INJECTED__ = true;
        
        // Queue for paste requests
        window.__PASTE_QUEUE__ = window.__PASTE_QUEUE__ || [];
        
        // Track focused input
        let currentInput = null;
        
        document.addEventListener('focusin', (e) => {
          if (e.target.tagName === 'INPUT' || 
              e.target.tagName === 'TEXTAREA' || 
              e.target.isContentEditable) {
            currentInput = e.target;
          }
        });
        
        document.addEventListener('focusout', () => {
          // Keep reference for a bit in case paste happens right after
          setTimeout(() => {
            if (document.activeElement !== currentInput) {
              currentInput = null;
            }
          }, 100);
        });
        
        // Intercept paste events
        document.addEventListener('keydown', (e) => {
          const isCtrlV = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';
          
          if (isCtrlV && currentInput) {
            e.preventDefault();
            e.stopPropagation();
            
            // Get selector for the input
            let selector = '';
            if (currentInput.id) {
              selector = '#' + currentInput.id;
            } else if (currentInput.name) {
              const tag = currentInput.tagName.toLowerCase();
              const escapeAttrValue = (value) => {
                if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                  return CSS.escape(value);
                }
                return String(value).replace(/["\\]/g, '\\$&');
              };
              selector = tag + '[name="' + escapeAttrValue(currentInput.name) + '"]';
            } else if (window.DOMPath && window.DOMPath.fullQualifiedSelector) {
              selector = window.DOMPath.fullQualifiedSelector(currentInput);
            } else {
              selector = currentInput.tagName.toLowerCase();
            }
            
            // Queue paste request
            window.__PASTE_QUEUE__.push({
              selector: selector,
              timestamp: Date.now()
            });
            
            console.log('📋 Paste requested for:', selector);
          }
        }, true); // Use capture phase
        
        console.log('✅ Clipboard bridge client script injected');
      })();
    `;

    await this.cdpClient.Runtime.evaluate({
      expression: clientScript,
      awaitPromise: false,
    });

    // Also register for new documents
    await this.cdpClient.Page.addScriptToEvaluateOnNewDocument({
      source: clientScript,
    });

    console.log('✅ Clipboard bridge initialized');
  }

  /**
   * Cleanup
   */
  stop() {
    console.log('🛑 Clipboard bridge stopped');
  }
}

module.exports = ClipboardBridge;
