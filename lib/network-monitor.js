/**
 * Network Monitor
 * Tracks network requests and provides idle detection
 */

const { setTimeout: sleep } = require('node:timers/promises');

class NetworkMonitor {
  constructor(Network) {
    this.Network = Network;
    this.pendingRequests = new Set();
    this.setupListeners();
  }

  /**
   * Setup network event listeners
   */
  setupListeners() {
    this.Network.requestWillBeSent((params) => {
      this.pendingRequests.add(params.requestId);
    });

    this.Network.responseReceived((params) => {
      this.pendingRequests.delete(params.requestId);
    });

    this.Network.loadingFailed((params) => {
      this.pendingRequests.delete(params.requestId);
    });

    this.Network.loadingFinished((params) => {
      this.pendingRequests.delete(params.requestId);
    });
  }

  /**
   * Wait for network to be idle
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @param {number} idleTime - Time to confirm stability in milliseconds
   * @returns {Promise<boolean>} True if network became idle, false if timeout
   */
  async waitForIdle(timeout = 5000, idleTime = 500) {
    const startTime = Date.now();
    console.log('Waiting for network to be idle...');

    while (Date.now() - startTime < timeout) {
      if (this.pendingRequests.size === 0) {
        console.log(
          `Network idle detected, waiting ${idleTime}ms for stability...`
        );
        await sleep(idleTime);
        if (this.pendingRequests.size === 0) {
          console.log('✓ Network is stable');
          return true;
        }
      }
      await sleep(100);
    }

    console.log(
      `⚠ Network idle timeout after ${timeout}ms (${this.pendingRequests.size} requests pending)`
    );
    return false;
  }

  /**
   * Get current number of pending requests
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }
}

module.exports = NetworkMonitor;
