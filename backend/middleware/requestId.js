// backend/middleware/requestId.js
// Assigns or forwards X-Request-Id header to trace requests end-to-end,
// sanitizing incoming headers against CRLF and ANSI escape sequences.

const crypto = require('crypto');

const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function sanitizeRequestId(val) {
  if (!val || typeof val !== 'string') return null;
  // Strip ANSI escape sequences and CRLF / null bytes
  const cleaned = val
    .replace(ANSI_REGEX, '')
    .replace(/[\r\n\0]/g, '')
    .trim();
  if (!cleaned || cleaned.length > 128) return null;
  return cleaned;
}

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const reqId = sanitizeRequestId(incoming) || crypto.randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}

module.exports = requestId;
