require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const errorHandler = require('./middleware/errorHandler');
const { ErrorCodes, formatErrorResponse } = require('./validators');

// Helper to recursively detect NUL (\0 / \u0000) characters in any string or key
function containsNullByte(val) {
  if (typeof val === 'string') {
    return val.includes('\0') || val.includes('\u0000');
  }
  if (Array.isArray(val)) {
    return val.some(containsNullByte);
  }
  if (val && typeof val === 'object') {
    for (const key of Object.keys(val)) {
      if (key.includes('\0') || key.includes('\u0000') || containsNullByte(val[key])) {
        return true;
      }
    }
  }
  return false;
}

function createApp() {
  const app = express();
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  // 1. Request ID generation / preservation
  app.use((req, res, next) => {
    const reqId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = reqId;
    res.setHeader('X-Request-Id', reqId);
    next();
  });

  // 2. Security headers with helmet
  app.use(helmet());

  // 3. CORS restricted to configured FRONTEND_URL (no wildcard)
  app.use(
    cors({
      origin: FRONTEND_URL,
      credentials: true,
    })
  );

  // 4. Per-route JSON body limiters with multipart bypass hook
  const jsonLogin = express.json({ limit: '2kb' });
  const jsonPost = express.json({ limit: '50kb' });
  const jsonComment = express.json({ limit: '10kb' });
  const jsonDefault = express.json({ limit: '100kb' });

  app.use((req, res, next) => {
    // Pass-through bypass hook for future multipart uploads
    if (req.is('multipart/*')) {
      return next();
    }

    const url = req.originalUrl || req.url || '';
    if (req.method === 'POST') {
      if (url.includes('/auth/login')) {
        return jsonLogin(req, res, next);
      }
      if (url.match(/\/posts\/[^/]+\/comments/)) {
        return jsonComment(req, res, next);
      }
      if (url.match(/\/posts\/?(\?.*)?$/)) {
        return jsonPost(req, res, next);
      }
    }

    return jsonDefault(req, res, next);
  });

  // 5. Handle JSON parser errors immediately, returning a generic error without parser internals
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json(
        formatErrorResponse(ErrorCodes.PAYLOAD_TOO_LARGE, 'Request payload too large')
      );
    }
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json(
        formatErrorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body')
      );
    }
    next(err);
  });

  // 6. Central content-type validation and req.body guarding middleware
  app.use((req, res, next) => {
    const contentLength = req.headers['content-length'];
    const hasBody =
      (contentLength !== undefined && contentLength !== '0') ||
      Boolean(req.headers['transfer-encoding']);

    if (hasBody) {
      // If multipart bypass hook applies, do not enforce application/json
      if (req.is('multipart/*')) {
        return next();
      }

      // Non-JSON payloads are rejected
      if (!req.is('json')) {
        return res.status(400).json(
          formatErrorResponse(
            ErrorCodes.INVALID_CONTENT_TYPE,
            'Invalid content-type: Content-Type must be application/json'
          )
        );
      }
    }

    // Ensure req.body is always an object, never undefined, null, or array
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      req.body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    }

    // Reject any request body containing NUL (\0 / \u0000) characters
    if (containsNullByte(req.body)) {
      return res.status(400).json(
        formatErrorResponse(
          ErrorCodes.VALIDATION_FAILED,
          'Request body must not contain null characters'
        )
      );
    }

    next();
  });

  // K12: Cache-Control and Pragma headers on /api/auth/* and requests with Authorization headers
  app.use((req, res, next) => {
    const url = req.originalUrl || req.url || '';
    if (url.includes('/auth') || req.headers['authorization']) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  // 7. API Router mounted under /api/v1 and aliased to /api
  const apiRouter = express.Router();

  // Basic health check
  apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // OpenAPI spec endpoint
  apiRouter.get('/openapi.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'docs/openapi.json'));
  });

  // Mount resource routes
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/posts', postsRoutes);

  // 404 handler for unmatched /api routes
  apiRouter.use((req, res) => {
    res.status(404).json(
      formatErrorResponse(
        ErrorCodes.NOT_FOUND,
        `Route ${req.method} ${req.originalUrl} not found`
      )
    );
  });

  // Mount /api/v1 and alias /api
  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  // 8. Central error handler
  app.use(errorHandler);

  return app;
}

const app = createApp();

module.exports = { app, createApp, errorHandler };
