require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connect } = require('./db');
const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');

const app = express();
const PORT = process.env.PORT || 5001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Security headers with helmet
app.use(helmet());

// CORS restricted to configured FRONTEND_URL (no wildcard)
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// Body limit of 100kb
app.use(express.json({ limit: '100kb' }));

// Handle JSON parser errors immediately, returning a generic error without parser internals
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload too large (max 100kb)' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  next(err);
});

// Helper to recursively detect NUL (\0 / \u0000) characters in any string or key
function containsNullByte(val) {
  if (typeof val === 'string') {
    return val.includes('\0');
  }
  if (Array.isArray(val)) {
    return val.some(containsNullByte);
  }
  if (val && typeof val === 'object') {
    for (const key of Object.keys(val)) {
      if (key.includes('\0') || containsNullByte(val[key])) {
        return true;
      }
    }
  }
  return false;
}

// Central content-type validation and req.body guarding middleware
app.use((req, res, next) => {
  const contentLength = req.headers['content-length'];
  const hasBody =
    (contentLength !== undefined && contentLength !== '0') ||
    Boolean(req.headers['transfer-encoding']);

  if (hasBody) {
    // Non-JSON payloads are rejected
    if (!req.is('json')) {
      return res.status(400).json({
        error: 'Invalid content-type: Content-Type must be application/json',
      });
    }
  }

  // Ensure req.body is always an object, never undefined, null, or array
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    req.body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  }

  // Reject any request body containing NUL (\0 / \u0000) characters
  if (containsNullByte(req.body)) {
    return res.status(400).json({ error: 'Request body must not contain null characters' });
  }

  next();
});

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);

// 404 handler for unmatched /api routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Central error handler
function errorHandler(err, req, res, next) {
  // If headers have already been sent, delegate to default express error handler
  if (res.headersSent) {
    return next(err);
  }

  // 1. Payload size exceeded
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload too large (max 100kb)' });
  }

  // 2. Syntax / JSON body errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // 3. MongoDB duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
    return res.status(409).json({
      error: `Duplicate entry detected for ${field}`,
      code: 'DUPLICATE_KEY',
      field,
    });
  }

  // 4. Mongoose ValidationError
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: details.length ? details : [err.message],
    });
  }

  // 5. Mongoose CastError (e.g. invalid ObjectId format)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: `Invalid ID format for ${err.path || 'id'}`,
      code: 'INVALID_ID',
    });
  }

  // 6. Explicit HTTP status on error object
  if (err.statusCode || err.status) {
    const status = err.statusCode || err.status;
    return res.status(status).json({
      error: err.message || 'Error occurred',
      ...(err.code ? { code: err.code } : {}),
    });
  }

  // 7. Generic internal server error
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal server error',
  });
}

app.use(errorHandler);

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

module.exports = { app, start, errorHandler };
