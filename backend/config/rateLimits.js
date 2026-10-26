// backend/config/rateLimits.js
// Rate limit configurations with dynamic non-production overrides.
// In production (NODE_ENV === 'production'), environment overrides are strictly ignored.

const rateLimit = require('express-rate-limit');
const { ErrorCodes, formatErrorResponse } = require('../validators/errorCodes');

function getAuthRateLimitMax(defaultVal = 20) {
  if (process.env.NODE_ENV !== 'production' && process.env.AUTH_RATE_LIMIT_MAX) {
    const val = Number(process.env.AUTH_RATE_LIMIT_MAX);
    if (!Number.isNaN(val) && val > 0) return val;
  }
  return defaultVal;
}

function getWriteRateLimitMax(defaultVal = 30) {
  if (process.env.NODE_ENV !== 'production' && process.env.WRITE_RATE_LIMIT_MAX) {
    const val = Number(process.env.WRITE_RATE_LIMIT_MAX);
    if (!Number.isNaN(val) && val > 0) return val;
  }
  return defaultVal;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getAuthRateLimitMax(20),
  standardHeaders: true,
  legacyHeaders: false,
  message: formatErrorResponse(
    ErrorCodes.RATE_LIMITED,
    'Too many auth requests from this IP, please try again after 15 minutes'
  ),
});

const createPostLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: () => getWriteRateLimitMax(30),
  standardHeaders: true,
  legacyHeaders: false,
  message: formatErrorResponse(
    ErrorCodes.RATE_LIMITED,
    'Too many posts created, please try again later'
  ),
});

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteRateLimitMax(120),
  standardHeaders: true,
  legacyHeaders: false,
  message: formatErrorResponse(
    ErrorCodes.RATE_LIMITED,
    'Too many votes submitted, please slow down'
  ),
});

const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteRateLimitMax(60),
  standardHeaders: true,
  legacyHeaders: false,
  message: formatErrorResponse(
    ErrorCodes.RATE_LIMITED,
    'Too many comments submitted, please slow down'
  ),
});

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteRateLimitMax(20),
  standardHeaders: true,
  legacyHeaders: false,
  message: formatErrorResponse(
    ErrorCodes.RATE_LIMITED,
    'Too many reports submitted, please slow down'
  ),
});

module.exports = {
  getAuthRateLimitMax,
  getWriteRateLimitMax,
  authLimiter,
  createPostLimiter,
  voteLimiter,
  commentLimiter,
  reportLimiter,
};
