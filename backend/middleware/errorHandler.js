// backend/middleware/errorHandler.js
// Dual-compatible central error handler middleware.
// Returns an error envelope with standardized code, message, and details,
// while preserving res.body.error string compatibility for legacy assertions.

const errorHandler = (err, req, res, next) => {
  // If headers already sent, delegate to default express handler
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  let message = err.message || 'An unexpected error occurred';
  let details = err.details || [];

  // 0. Payload size exceeded
  if (err.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload too large';
    details = ['Payload size exceeds limit'];
  }

  // 0b. Syntax / JSON body errors
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON body';
    details = ['Malformed JSON payload'];
  }

  // 1. Mongoose Duplicate Key (E11000)
  else if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyPattern || {})[0] || (err.keyValue ? Object.keys(err.keyValue)[0] : 'field');
    message = `${field} already exists`;
    details = [`${field} must be unique`];
    return res.status(statusCode).json({
      error: message,
      code,
      message,
      field,
      details,
    });
  }

  // 2. Mongoose ValidationError
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    message = messages[0] || 'Validation failed';
    details = Object.entries(err.errors || {}).map(([key, val]) => `${key}: ${val.message}`);
  }

  // 3. Mongoose CastError
  else if (err.name === 'CastError') {
    statusCode = 400;
    if (err.kind === 'ObjectId' || err.path?.endsWith('Id') || err.path === '_id' || err.path === 'id') {
      code = 'INVALID_ID';
      message = `Invalid ID format for ${err.path}`;
      details = [`${err.path}: Invalid ID format`];
    } else {
      code = 'VALIDATION_FAILED';
      message = `Invalid format for ${err.path}`;
      details = [`${err.path}: Invalid format`];
    }
  }

  // 4. Zod Validation Error (if thrown or attached)
  else if (err.name === 'ZodError') {
    statusCode = 400;
    code = 'VALIDATION_FAILED';
    const issues = err.issues || err.errors || [];
    message = issues[0]?.message || 'Validation failed';
    details = issues.map((e) => `${(e.path || []).join('.')}: ${e.message}`);
  }

  // In production, sanitize 500 messages so internal implementation details never leak
  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    message = 'An unexpected internal server error occurred';
    details = [];
  }

  // Dual-compatible response shape:
  // - res.body.error is a string (satisfies assert.match and legacy smoke tests)
  // - res.body.code is a string (satisfies assert.strictEqual(res.body.code, 'VALIDATION_FAILED'))
  // - res.body.message is a string
  // - res.body.details is an array
  return res.status(statusCode).json({
    error: message,
    code: code,
    message: message,
    details: details,
  });
};

module.exports = errorHandler;
