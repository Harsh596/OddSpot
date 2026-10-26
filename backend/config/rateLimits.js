// backend/config/rateLimits.js
// Rate limit configurations backed by MongoDB RateLimit store with non-production overrides (K10).

const { createRateLimiter } = require('../middleware/rateLimiter');

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

const authLimiter = createRateLimiter({
  prefix: 'auth',
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getAuthRateLimitMax(20),
  message: 'Too many auth requests from this IP, please try again after 15 minutes',
});

const createPostLimiter = createRateLimiter({
  prefix: 'post:create',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: () => getWriteRateLimitMax(30),
  scaleByTrust: true,
  message: 'Too many posts created, please try again later',
});

const voteLimiter = createRateLimiter({
  prefix: 'vote',
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteRateLimitMax(120),
  scaleByTrust: true,
  message: 'Too many votes submitted, please slow down',
});

const commentLimiter = createRateLimiter({
  prefix: 'comment',
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteRateLimitMax(60),
  scaleByTrust: true,
  message: 'Too many comments submitted, please slow down',
});

const reportLimiter = createRateLimiter({
  prefix: 'report',
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteRateLimitMax(20),
  scaleByTrust: true,
  message: 'Too many reports submitted, please slow down',
});

module.exports = {
  getAuthRateLimitMax,
  getWriteRateLimitMax,
  authLimiter,
  createPostLimiter,
  voteLimiter,
  commentLimiter,
  reportLimiter,
  createRateLimiter,
};
