require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const requestId = require('./middleware/requestId');
const { bodyLimit, limits } = require('./middleware/bodyLimit');
const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const usersRoutes = require('./routes/users');
const commentsRoutes = require('./routes/comments');
const feedRoutes = require('./routes/feed');
const modRoutes = require('./routes/mod');
const notificationsRoutes = require('./routes/notifications');
const communitiesRoutes = require('./routes/communities');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const { metricsMiddleware, metricsHandler } = require('./services/metrics');
const { ErrorCodes, formatErrorResponse } = require('./validators');
const meter = require('./services/meter');
const meterConfig = require('./config/meter');

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

// Helper to recursively detect JSON nesting depth exceeding maxDepth (default 10)
function exceedsMaxDepth(val, maxDepth = 10, currentDepth = 1) {
  if (currentDepth > maxDepth) return true;
  if (val === null || typeof val !== 'object') return false;
  const entries = Array.isArray(val) ? val : Object.values(val);
  for (const item of entries) {
    if (item && typeof item === 'object') {
      if (exceedsMaxDepth(item, maxDepth, currentDepth + 1)) {
        return true;
      }
    }
  }
  return false;
}

const zlib = require('zlib');
const { mongoose } = require('./db');

function compressionMiddleware(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip')) {
    return next();
  }

  const originalSend = res.send.bind(res);
  res.send = function (body) {
    if (
      typeof body === 'string' &&
      Buffer.byteLength(body) > 1024 &&
      !res.getHeader('Content-Encoding')
    ) {
      const contentType = res.getHeader('Content-Type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/')) {
        const buffer = Buffer.from(body);
        if (buffer.length > 1024) {
          zlib.gzip(buffer, (err, gzipped) => {
            if (err) return originalSend(body);
            res.setHeader('Content-Encoding', 'gzip');
            res.removeHeader('Content-Length');
            res.setHeader('Vary', 'Accept-Encoding');
            return res.end(gzipped);
          });
          return;
        }
      }
    }
    return originalSend(body);
  };

  next();
}

function createApp() {
  const app = express();

  // Configure trust proxy from TRUST_PROXY env var
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (!trustProxyEnv || trustProxyEnv === 'false' || trustProxyEnv === '0') {
    app.set('trust proxy', false);
  } else if (trustProxyEnv === 'true') {
    app.set('trust proxy', 1);
  } else if (/^\d+$/.test(trustProxyEnv)) {
    app.set('trust proxy', Number(trustProxyEnv));
  } else {
    app.set('trust proxy', trustProxyEnv);
  }

  // Exact-match comma-separated CORS configuration
  const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const allowedOrigins = rawFrontendUrl
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) {
          return cb(null, true);
        }
        return cb(null, false);
      },
      credentials: true,
    })
  );

  // Response compression middleware for payloads > 1KB
  app.use(compressionMiddleware);

  // Root health and readiness probes
  const handleHealth = (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  };

  const handleReady = async (req, res) => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db.command({ ping: 1 });
        return res.status(200).json({ status: 'ready', db: 'up' });
      }
      return res.status(503).json({ status: 'not_ready', db: 'down' });
    } catch {
      return res.status(503).json({ status: 'not_ready', db: 'down' });
    }
  };

  app.get('/health', handleHealth);
  app.get('/ready', handleReady);
  app.get('/metrics', metricsHandler);

  // 1. Request ID generation / preservation
  app.use(requestId);

  // Observability: Metrics collection & structured request logging
  app.use(metricsMiddleware);
  app.use(requestLogger);

  // 2. Security headers with helmet
  app.use(helmet());

  // 4. Per-route JSON body limiters with multipart bypass hook
  app.use(bodyLimit);

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

    // Reject any request payload exceeding maximum allowed nesting depth of 10
    if (exceedsMaxDepth(req.body, 10)) {
      return res.status(400).json(
        formatErrorResponse(
          ErrorCodes.VALIDATION_FAILED,
          'Request body exceeds maximum allowed nesting depth of 10'
        )
      );
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

  // Health & readiness probes & metrics
  apiRouter.get('/health', handleHealth);
  apiRouter.get('/ready', handleReady);
  apiRouter.get('/metrics', metricsHandler);

  // Public configuration endpoint
  apiRouter.get('/config/public', (req, res) => {
    res.json({
      name: 'OddSpot',
      version: '1.0.0',
      meter: {
        label: meterConfig.label || 'Oddometer',
        countryThreshold: meter.getCountryThreshold ? meter.getCountryThreshold() : 50,
      },
      limits: {
        postMaxImages: 6,
        postMaxTags: 10,
        titleMaxLength: 140,
        bodyMaxLength: 10000,
        commentMaxLength: 5000,
        payloadLimits: limits,
      },
      features: {
        hideExactAllowed: true,
      },
    });
  });

  // OpenAPI spec endpoint
  apiRouter.get('/openapi.json', (req, res) => {
    const primaryPath = path.resolve(__dirname, '../docs/openapi.json');
    const localPath = path.resolve(__dirname, 'docs/openapi.json');
    if (fs.existsSync(primaryPath)) {
      return res.sendFile(primaryPath);
    }
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }
    res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'OpenAPI specification not found'));
  });

  // Mount resource routes
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/posts', postsRoutes);
  apiRouter.use('/users', usersRoutes);
  apiRouter.use('/comments', commentsRoutes);
  apiRouter.use('/feed', feedRoutes);
  apiRouter.use('/posts/feed', feedRoutes);
  apiRouter.use('/mod', modRoutes);
  apiRouter.use('/notifications', notificationsRoutes);
  apiRouter.use('/communities', communitiesRoutes);

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
