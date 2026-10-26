// backend/middleware/requestLogger.js
// Structured HTTP request logging with slow-request alerts (>1000ms).

const { logger, sanitizeCrlf } = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const requestId = req.id || req.headers['x-request-id'] || 'unknown';
    const userId = req.user?.id || req.user?._id || 'anonymous';
    const method = req.method;
    const route = req.baseUrl ? `${req.baseUrl}${req.route?.path || req.path || ''}` : req.originalUrl || req.url;
    const statusCode = res.statusCode;

    const userAgent = req.headers['user-agent'] || 'unknown';

    const logPayload = {
      requestId: sanitizeCrlf(String(requestId)),
      userId: sanitizeCrlf(String(userId)),
      method: sanitizeCrlf(String(method)),
      route: sanitizeCrlf(String(route)),
      userAgent: sanitizeCrlf(String(userAgent)),
      statusCode,
      durationMs,
    };

    if (durationMs > 1000) {
      logger.warn(logPayload, `Slow request: ${method} ${route} took ${durationMs}ms`);
    } else {
      logger.info(logPayload, `Request completed: ${method} ${route} -> ${statusCode}`);
    }
  });

  next();
}

module.exports = requestLogger;
