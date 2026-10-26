// backend/middleware/rateLimiter.js
// Persistent MongoDB-backed rate limiter with trust-scaled buckets (K10).

const mongoose = require('mongoose');
const RateLimit = require('../models/RateLimit');

/**
 * Normalizes an IP address:
 * - Unmaps IPv4-mapped IPv6 addresses ("::ffff:1.2.3.4" -> "1.2.3.4")
 * - Expands IPv6 addresses and collapses them to their /64 subnet prefix
 * - Converts to lower case and trims
 */
function normalizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return 'unknown';
  let ip = rawIp.trim().toLowerCase();

  // Strip IPv4-mapped IPv6 prefix (e.g. "::ffff:192.168.1.1")
  if (ip.startsWith('::ffff:')) {
    const unmapped = ip.slice(7);
    if (unmapped.includes('.')) {
      return unmapped;
    }
  }

  // If standard IPv4 (contains no colons)
  if (!ip.includes(':')) {
    return ip;
  }

  // Handle IPv6 address expansion and extract /64 prefix (first 4 hextets)
  // Strip optional zone index (e.g. fe80::1%eth0)
  const zoneIndex = ip.indexOf('%');
  if (zoneIndex !== -1) {
    ip = ip.slice(0, zoneIndex);
  }

  // Split on "::"
  const doubleColonParts = ip.split('::');
  let hextets = [];

  if (doubleColonParts.length === 1) {
    hextets = ip.split(':');
  } else if (doubleColonParts.length === 2) {
    const left = doubleColonParts[0] ? doubleColonParts[0].split(':') : [];
    const right = doubleColonParts[1] ? doubleColonParts[1].split(':') : [];
    const missing = 8 - (left.length + right.length);
    const middle = new Array(Math.max(0, missing)).fill('0');
    hextets = [...left, ...middle, ...right];
  } else {
    return ip;
  }

  while (hextets.length < 8) {
    hextets.push('0');
  }

  // First 4 hextets make up the /64 prefix
  const prefix4 = hextets.slice(0, 4).map((h) => {
    const val = parseInt(h || '0', 16);
    return isNaN(val) ? '0' : val.toString(16);
  });

  return `${prefix4.join(':')}::/64`;
}

function buildRateLimitKey(req, prefix = 'rl') {
  const userId = req.user?.id || req.user?._id;
  if (userId) {
    return `${prefix}:user:${userId}`;
  }
  const rawIp = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  const clientIp = normalizeIp(rawIp);
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
  normalizeIp,
};
