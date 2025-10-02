/**
 * Page Event Handler
 * Manages page load and navigation events
 */

const { setTimeout: sleep } = require('node:timers/promises');

class PageEventHandler {
  constructor(Page, networkMonitor, scriptInjector, permissionsManager) {
    this.Page = Page;
    this.networkMonitor = networkMonitor;
    this.scriptInjector = scriptInjector;
    this.permissionsManager = permissionsManager;
    this.pageLoaded = false;
  }

  /**
   * Setup all page event listeners
   */
  setupListeners() {
    this.setupLoadEventListener();
    this.setupNavigationListener();
    this.setupPeriodicCheck();
  }

  /**
   * Handle page load events
   */
  setupLoadEventListener() {
    this.Page.loadEventFired(async () => {
      if (this.pageLoaded) {
        console.log('📄 Page reloaded...');
      }
      this.pageLoaded = true;
      console.log('📄 Page.loadEventFired triggered');

      // Wait for network to be idle
      await this.networkMonitor.waitForIdle(5000, 500);

      // Inject scripts after network is stable
      const success = await this.scriptInjector.inject('after-load');

      // If injection failed, retry a few times
      if (!success) {
        for (let i = 1; i <= 3; i++) {
          console.log(`🔄 Retrying injection (attempt ${i}/3)...`);
          await sleep(1000);
          if (await this.scriptInjector.inject(`retry-${i}`)) {
            break;
          }
        }
      }
    });
  }

  /**
   * Handle frame navigation events (for SPAs)
   */
  setupNavigationListener() {
    this.Page.frameNavigated(async (params) => {
      // Only handle main frame navigations
      if (!params.frame.parentId) {
        console.log('🔄 Main frame navigated to:', params.frame.url);

        // Grant permissions for the new URL
        await this.permissionsManager.grantForOrigin(params.frame.url);

        await sleep(500); // Give the page a moment to start loading
        await this.networkMonitor.waitForIdle(5000, 500);
        await this.scriptInjector.inject('after-navigation');
      }
    });
  }

  /**
   * Setup periodic verification and re-injection if needed
   */
  setupPeriodicCheck() {
    setInterval(async () => {
      const isInjected = await this.scriptInjector.verify();

      if (!isInjected) {
        console.log('⚠ Scripts lost, re-injecting...');
        await this.scriptInjector.inject('periodic-check');
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Perform initial injection
   */
  async performInitialInjection() {
    await sleep(1000); // Initial delay to let page start loading
    await this.networkMonitor.waitForIdle(5000, 500);
    await this.scriptInjector.inject('initial');
  }
}

module.exports = PageEventHandler;
