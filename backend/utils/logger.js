// backend/utils/logger.js
// Structured pino logger with strict secret redaction and CRLF log-injection prevention.

const pino = require('pino');

const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function sanitizeCrlf(val) {
  if (typeof val === 'string') {
    return val.replace(ANSI_REGEX, '').replace(/[\r\n]+/g, ' ');
  }
  if (val && typeof val === 'object' && !(val instanceof Error)) {
    const res = Array.isArray(val) ? [] : {};
    for (const [k, v] of Object.entries(val)) {
      const sanitizedKey = typeof k === 'string' ? k.replace(ANSI_REGEX, '').replace(/[\r\n]+/g, ' ') : k;
      res[sanitizedKey] = sanitizeCrlf(v);
    }
    return res;
  }
  return val;
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'MONGODB_URI',
  'jwtSecret',
  'fuzzSecret',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.MONGODB_URI',
  '*.jwtSecret',
  '*.fuzzSecret',
  '*.authorization',
  '*.Authorization',
];

function createLogger(destination, options = {}) {
  const defaultLevel = destination
    ? 'info'
    : (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'));

  return pino(
    {
      level: options.level || defaultLevel,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      hooks: {
        logMethod(inputArgs, method) {
          const sanitized = inputArgs.map((arg) => sanitizeCrlf(arg));
          return method.apply(this, sanitized);
        },
      },
      ...options,
    },
    destination
  );
}

const logger = createLogger();

module.exports = {
  logger,
  createLogger,
  sanitizeCrlf,
  REDACT_PATHS,
};
