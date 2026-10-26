require('dotenv').config();
const { app, createApp, errorHandler } = require('./app');
const { connect } = require('./db');
const { validateJwtConfig } = require('./services/token');

const PORT = process.env.PORT || 5001;

async function start() {
  try {
    validateJwtConfig();
    await connect();
    console.log('MongoDB connected successfully.');
    const server = app.listen(PORT, () => {
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

module.exports = { app, createApp, start, errorHandler };
