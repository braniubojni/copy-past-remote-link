const http = require('http');
const httpProxy = require('http-proxy');
const os = require('os');

/**
 * Get the local IP address of this machine
 */
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Create a proxy server to access Chrome DevTools from local network
 * @param {number} localPort - The port where Chrome DevTools is running
 * @param {string} url - The DevTools URL to proxy
 * @returns {Promise<string>} The accessible proxy URL
 */
async function createProxy(localPort, url) {
  const SERVER_ADDRESS = process.env.SERVER_ADDRESS || getLocalIPAddress();

  const proxy = httpProxy.createProxyServer({});
  let server;
  let checkInterval;
  let listenPort;
  const checkLocalPort = () => {
    const options = {
      hostname: 'localhost',
      port: localPort,
      method: 'HEAD',
    };

    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.log(
          `Local server on port ${localPort} is not active. Shutting down proxy...`
        );
        shutdownProxy();
      }
    });

    req.on('error', () => {
      console.log(
        `Local server on port ${localPort} is not active. Shutting down proxy...`
      );
      shutdownProxy();
    });

    req.end();
  };

  const shutdownProxy = () => {
    clearInterval(checkInterval);
    if (server) {
      server.close(() => {
        console.log(`Proxy server on port ${listenPort} has been shut down.`);
      });
    }
  };

  server = http.createServer((req, res) => {
    // res.setHeader("Access-Control-Allow-Origin", "*");
    // res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    // res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    // res.setHeader('content-security-policy', '')

    // const userAgent = req.headers['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    proxy.web(
      req,
      res,
      {
        target: `http://localhost:${localPort}`,
        headers: {
          ...req.headers,
          // 'User-Agent': userAgent
        },
      },
      (err) => {
        console.error('Proxy error:', err);
        res.writeHead(500, {
          'Content-Type': 'text/plain',
        });
        res.end('Something went wrong.');
      }
    );
  });

  server.on('upgrade', (req, socket, head) => {
    console.log(
      `WebSocket connection from ${req.socket.remoteAddress}:${req.socket.remotePort}`
    );
    proxy.ws(
      req,
      socket,
      head,
      {
        target: `http://localhost:${localPort}`,
      },
      (err) => {
        console.error('WebSocket proxy error:', err.message || err);
        socket.destroy();
      }
    );

    socket.on('message', (message) => {
      console.log('Received WebSocket message:', message.toString());
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error.message || error);
      socket.destroy();
    });

    socket.on('close', () => {
      console.log('WebSocket connection closed by client');
    });
  });

  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('Connection', 'keep-alive');
  });

  proxy.on('open', (proxySocket) => {
    console.log('WebSocket connection opened');
    proxySocket.setTimeout(120000);
  });

  proxy.on('close', () => {
    console.log('WebSocket connection closed');
  });

  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      listenPort = server.address().port;

      console.log(`✓ Proxy server running on port ${listenPort}`);
      console.log(`📡 Local IP: ${SERVER_ADDRESS}`);

      // Build the network URL and replace WebSocket parameter
      let networkUrl = url
        // Replace the base localhost URL with network address
        .replace(
          `http://localhost:${localPort}`,
          `http://${SERVER_ADDRESS}:${listenPort}`
        )
        // Replace the WebSocket parameter with network address
        .replace(/ws=localhost:\d+/g, `ws=${SERVER_ADDRESS}:${listenPort}`);

      console.log(`🌐 Access DevTools from local network: ${networkUrl}`);

      resolve(networkUrl);

      // Check every 5 seconds if the local Chrome is still running
      checkInterval = setInterval(checkLocalPort, 5000);
    });

    server.on('error', (err) => {
      console.error('Proxy server error:', err.message || err);
      reject(err);
    });
  });
}

module.exports = createProxy;
