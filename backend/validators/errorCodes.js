// backend/validators/errorCodes.js
// Standardized error codes and dual-compatible error envelope formatter.

const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_CONTENT_TYPE: 'INVALID_CONTENT_TYPE',
  INVALID_ID: 'INVALID_ID',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  AUTH_FORBIDDEN_BANNED: 'AUTH_FORBIDDEN_BANNED',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  IDEMPOTENCY_IN_FLIGHT: 'IDEMPOTENCY_IN_FLIGHT',
  IDEMPOTENCY_KEY_MISMATCH: 'IDEMPOTENCY_KEY_MISMATCH',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
};

// Dual-compatible error envelope:
// - res.body.error is a string (satisfies assert.match and legacy smoke tests)
// - res.body.code is a string (satisfies assert.strictEqual(res.body.code, 'VALIDATION_FAILED'))
// - res.body.message is a string
// - res.body.details is an array
function formatErrorResponse(code, message, details = []) {
  const detailList = Array.isArray(details) ? details : (details ? [details] : []);
  return {
    error: message,
    code,
    message,
    details: detailList,
  };
}

module.exports = {
  ErrorCodes,
  formatErrorResponse,
};
