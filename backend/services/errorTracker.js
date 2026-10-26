// backend/services/errorTracker.js
// Pluggable error-tracking hook (Sentry / Datadog / OpenTelemetry) behind ERROR_TRACKING_DSN.

const { logger } = require('../utils/logger');

function isConfigured() {
  return Boolean(process.env.ERROR_TRACKING_DSN && process.env.ERROR_TRACKING_DSN.trim());
}

function captureException(err, context = {}) {
  if (!isConfigured()) {
    // Safe no-op when DSN is not configured
    return false;
  }

  try {
    const dsn = process.env.ERROR_TRACKING_DSN;
    const errorDetails = {
      message: err?.message || String(err),
      name: err?.name || 'Error',
      stack: err?.stack || null,
      context,
      capturedAt: new Date().toISOString(),
      dsnPrefix: dsn ? dsn.slice(0, 10) + '...' : null,
    };

    logger.error({ err: errorDetails }, `[errorTracker] Exception captured: ${errorDetails.message}`);
    return true;
  } catch (trackingError) {
    logger.error({ trackingError }, '[errorTracker] Failed to capture exception');
    return false;
  }
}

module.exports = {
  captureException,
  isConfigured,
};
