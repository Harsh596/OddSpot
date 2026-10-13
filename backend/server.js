require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connect } = require('./db');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5001;

// CORS setup: keep frontend and backend independent over HTTP
app.use(cors());

// Parse incoming JSON payloads
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Central error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

async function start() {
  try {
    await connect();
    console.log('MongoDB connected successfully.');
    app.listen(PORT, () => {
      console.log(`Oddspot backend listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
