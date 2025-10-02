/**
 * DevTools Info Manager
 * Manages DevTools URLs and WebSocket connections
 */

class DevToolsInfo {
  constructor(browserInstance) {
    this.browserInstance = browserInstance;
    this.port = browserInstance.port;
  }

  /**
   * Fetch Chrome DevTools information
   */
  async fetchInfo() {
    const data = await fetch(`http://localhost:${this.port}/json/version`).then(
      (res) => res.json()
    );

    const list = await fetch(`http://localhost:${this.port}/json/list`).then(
      (res) => res.json()
    );

    return { version: data, list };
  }

  /**
   * Get page DevTools URLs and WebSocket information
   */
  async getPageInfo() {
    const { version, list } = await this.fetchInfo();

    let fullUrl = '';
    let pageWsUrl = '';

    for (const info of list.filter((item) => item.type === 'page')) {
      // Extract the WebSocket part from devtoolsFrontendUrl
      const wsParam = info.devtoolsFrontendUrl.split('?ws=')[1];

      // Construct localhost DevTools URL
      fullUrl = `http://localhost:${this.port}/devtools/inspector.html?ws=${wsParam}`;

      // Get the page WebSocket URL (not browser WebSocket)
      pageWsUrl = info.webSocketDebuggerUrl;

      console.log(`DevTools URL: ${fullUrl}`);
      console.log(`Page WebSocket URL: ${pageWsUrl}`);
      break; // Take the first page
    }

    const browserWsUrl = version.webSocketDebuggerUrl;

    return {
      fullUrl,
      pageWsUrl,
      browserWsUrl,
      port: this.port,
    };
  }
}

module.exports = DevToolsInfo;
