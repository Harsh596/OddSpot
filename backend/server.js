require('dotenv').config();
const http = require('http');
const { app, createApp, errorHandler } = require('./app');
const { connect, mongoose } = require('./db');
const { validateJwtConfig } = require('./services/token');

const PORT = process.env.PORT || 5001;

function createConfiguredServer(appInstance = app, options = {}) {
  const server = http.createServer(
    {
      maxHeaderSize: 16384,
      ...options,
    },
    appInstance
  );

  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;

  return server;
}

const { logger } = require('./utils/logger');
const { startBackgroundScheduler, stopBackgroundScheduler } = require('./services/scheduler');
const { captureException } = require('./services/errorTracker');

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection at Promise');
  captureException(reason, { type: 'unhandledRejection' });
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception thrown');
  captureException(err, { type: 'uncaughtException' });
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

function setupGracefulShutdown(server) {
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, initiating graceful shutdown...`);
    stopBackgroundScheduler();
    server.close(async () => {
      console.log('HTTP server closed.');
      try {
        if (mongoose.connection.readyState !== 0) {
          await mongoose.connection.close(false);
          console.log('MongoDB connection closed.');
        }
        process.exit(0);
      } catch (err) {
        console.error('Error closing MongoDB connection:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('Graceful shutdown timed out (10s), forcing process termination.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function start() {
  try {
    validateJwtConfig();
    await connect();
    console.log('MongoDB connected successfully.');
    const server = createConfiguredServer(app);
    setupGracefulShutdown(server);
    server.listen(PORT, () => {
      console.log(`Oddspot backend listening on port ${PORT}`);
    });
    return server;
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = {
  app,
  createApp,
  start,
  createConfiguredServer,
  setupGracefulShutdown,
  errorHandler,
};
