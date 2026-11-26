'use strict';

const http = require('node:http');
const { PORT, HOST } = require('./src/config');
const { handleRequest } = require('./src/router');

/**
 * Creates the Node.js HTTP server instance using the built-in http module.
 * @param {{ logger?: ((message: string) => void) | null }} [options]
 * @returns {http.Server}
 */
function createAppServer({ logger = null } = {}) {
  return http.createServer((req, res) => {
    // Measure request latency and log the resolved HTTP status once sent.
    if (logger) {
      const startTime = process.hrtime.bigint();
      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        logger(
          `[${new Date().toISOString()}] ${req.method} ${req.url} -> ${res.statusCode} (${durationMs.toFixed(1)} ms)`
        );
      });
    }

    handleRequest(req, res);
  });
}

/**
 * Starts listening on the configured port and host.
 * @param {number} [port]
 * @param {string} [host]
 * @param {{ logger?: ((message: string) => void) | null }} [options]
 * @returns {Promise<http.Server>}
 */
function startServer(port = PORT, host = HOST, { logger = console.log } = {}) {
  const server = createAppServer({ logger });

  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address();
      const activePort = typeof address === 'object' && address ? address.port : port;
      const activeHost = !host || host === '0.0.0.0' || host === '::' ? 'localhost' : host;
      console.log(`FreshFold Laundry server running at http://${activeHost}:${activePort}/home`);
      console.log('Available routes: /home, /services, /pricing, /about, /contact, /api/status');
      resolve(server);
    };

    server.once('error', onError);
    // Bind dual-stack when HOST is omitted so both localhost and 127.0.0.1 work.
    if (host) {
      server.listen(port, host, onListening);
    } else {
      server.listen(port, onListening);
    }
  });
}

// Start the server only when executed directly (allows test suites to import createAppServer).
if (require.main === module) {
  startServer()
    .then((server) => {
      // Gracefully close active connections before exiting on interrupt signals.
      const shutdown = (signal) => {
        console.log(`\nReceived ${signal}. Closing HTTP server...`);
        server.close(() => {
          console.log('Server stopped cleanly.');
          process.exit(0);
        });
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}

module.exports = {
  createAppServer,
  startServer,
};
