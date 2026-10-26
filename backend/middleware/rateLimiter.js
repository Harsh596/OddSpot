// backend/middleware/rateLimiter.js
// Persistent MongoDB-backed rate limiter with trust-scaled buckets (K10).

const mongoose = require('mongoose');
const RateLimit = require('../models/RateLimit');

function buildRateLimitKey(req, prefix = 'rl') {
  const userId = req.user?.id || req.user?._id;
  if (userId) {
    return `${prefix}:user:${userId}`;
  }
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${prefix}:ip:${clientIp}`;
}

// In-memory fallback map when MongoDB is unavailable or disconnected
const memoryStore = new Map();

function createRateLimiter(options = {}) {
  const {
    prefix = 'rl',
    windowMs = 15 * 60 * 1000,
    max = 60,
    scaleByTrust = false,
    message = 'Too many requests, please try again later',
  } = options;

  return async function rateLimiterMiddleware(req, res, next) {
    const key = buildRateLimitKey(req, prefix);
    const rawBaseMax = typeof max === 'function' ? max(req) : max;

    let effectiveMax = rawBaseMax;
    if (scaleByTrust && (req.user?.id || req.user?._id)) {
      const trustScore =
        req.user.trustScore ??
        (typeof req.user.trust === 'number' ? req.user.trust : req.user.trust?.score) ??
        1.0;

      const trustMultiplier = Math.min(1.5, Math.max(0.5, trustScore));
      if (rawBaseMax < 5) {
        effectiveMax = rawBaseMax;
      } else {
        effectiveMax = Math.max(5, Math.round(rawBaseMax * trustMultiplier));
      }
    }

    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    let hits = 1;
    let docResetAt = resetAt;

    if (mongoose.connection.readyState === 1) {
      try {
        let doc = await RateLimit.findOneAndUpdate(
          { key, resetAt: { $gt: now } },
          { $inc: { hits: 1 } },
          { new: true }
        );

        if (!doc) {
          try {
            doc = await RateLimit.findOneAndUpdate(
              { key },
              { $set: { hits: 1, resetAt } },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          } catch (err) {
            if (err.code === 11000) {
              doc = await RateLimit.findOneAndUpdate(
                { key },
                { $inc: { hits: 1 } },
                { new: true }
              );
            } else {
              throw err;
            }
          }
        }

        if (doc) {
          hits = doc.hits;
          docResetAt = doc.resetAt || resetAt;
        }
      } catch (err) {
        // Fallback to in-memory counter if MongoDB write fails
        const memEntry = memoryStore.get(key);
        if (memEntry && memEntry.resetAt > now) {
          memEntry.hits++;
          hits = memEntry.hits;
          docResetAt = memEntry.resetAt;
        } else {
          memoryStore.set(key, { hits: 1, resetAt });
          hits = 1;
          docResetAt = resetAt;
        }
      }
    } else {
      // In-memory counter for disconnected states
      const memEntry = memoryStore.get(key);
      if (memEntry && memEntry.resetAt > now) {
        memEntry.hits++;
        hits = memEntry.hits;
        docResetAt = memEntry.resetAt;
      } else {
        memoryStore.set(key, { hits: 1, resetAt });
        hits = 1;
        docResetAt = resetAt;
      }
    }

    const remaining = Math.max(0, effectiveMax - hits);
    const resetSeconds = Math.max(0, Math.ceil((docResetAt.getTime() - Date.now()) / 1000));

    res.setHeader('RateLimit-Limit', effectiveMax);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (hits > effectiveMax) {
      res.setHeader('Retry-After', resetSeconds);
      const errorMsg = typeof message === 'string' ? message : 'Too many requests, please try again later';
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: errorMsg,
          details: [],
        },
        message: errorMsg,
        code: 'RATE_LIMITED',
      });
    }

    next();
  };
}

module.exports = {
  buildRateLimitKey,
  createRateLimiter,
};
