/**
 * Script Injector
 * Handles injection and verification of custom scripts
 */

const fs = require('fs');
const path = require('path');

class ScriptInjector {
  constructor(Runtime, Page) {
    this.Runtime = Runtime;
    this.Page = Page;
    this.combinedScript = null;
  }

  /**
   * Load and combine all scripts
   */
  loadScripts() {
    const dompathScript = fs.readFileSync(
      path.join(__dirname, '../dompath.js'),
      'utf8'
    );
    const scriptContent = fs.readFileSync(
      path.join(__dirname, '../inserted-script.js'),
      'utf8'
    );
    const duglasFunction = `
      window.duglas = async (selector) => {
        const text = await navigator.clipboard.readText();
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

    this.combinedScript = `
      ${dompathScript}
      ${duglasFunction}
      ${scriptContent}
    `;
  }

  /**
   * Register scripts to be evaluated on new documents
   */
  async registerForNewDocuments() {
    if (!this.combinedScript) {
      this.loadScripts();
    }

    await this.Page.addScriptToEvaluateOnNewDocument({
      source: this.combinedScript,
    });
    console.log('✓ Script registered for new documents');
  }

  /**
   * Inject scripts into the current page with verification
   * @param {string} context - Context description for logging
   * @returns {Promise<boolean>} True if injection succeeded
   */
  async inject(context = 'initial') {
    if (!this.combinedScript) {
      this.loadScripts();
    }

    try {
      console.log(`🔧 Injecting scripts (${context})...`);
      await this.Runtime.evaluate({
        expression: this.combinedScript,
        awaitPromise: false,
      });

      // Verify injection worked
      const verification = await this.Runtime.evaluate({
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
      console.error(`❌ Error injecting scripts (${context}):`, error.message);
      return false;
    }
  }

  /**
   * Verify if scripts are currently injected
   */
  async verify() {
    try {
      const verification = await this.Runtime.evaluate({
        expression: 'typeof window.__COMET_INJECTED__ !== "undefined"',
        returnByValue: true,
      });
      return verification.result.value;
    } catch {
      return false;
    }
  }
}

module.exports = ScriptInjector;
