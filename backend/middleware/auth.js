const { verifyAccessToken } = require('../services/token');
const { User } = require('../models');
const { ErrorCodes, formatErrorResponse } = require('../validators/errorCodes');
const { logger } = require('../utils/logger');

// In-memory cache (30s max) to prevent database exhaustion on rapid requests
const userCache = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(
      formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'Authorization header with Bearer token is required')
    );
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !parts[1] || !parts[1].trim()) {
    return res.status(401).json(
      formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'Authorization header with Bearer token is required')
    );
  }

  const token = parts[1].trim();
  let decoded;
  try {
    decoded = verifyAccessToken(token);
    if (!decoded || typeof decoded !== 'object' || !decoded.id) {
      return res.status(401).json(
        formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid or expired token')
      );
    }
  } catch (err) {
    return res.status(401).json(
      formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid or expired token')
    );
  }

  let user;
  try {
    const now = Date.now();
    const cached = userCache.get(decoded.id);

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      user = cached.user;
    } else {
      user = await User.findById(decoded.id)
        .select('banned role username passwordChangedAt tokenVersion shadowBanned trust createdAt')
        .lean();
      if (user) {
        userCache.set(decoded.id, { user, timestamp: now });
      }
    }
  } catch (dbErr) {
    logger.error({ err: dbErr }, 'Database lookup failed during authentication');
    if (dbErr.name === 'CastError') {
      return res.status(401).json(
        formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid user ID in token')
      );
    }
    return res.status(503).json(
      formatErrorResponse('SERVICE_UNAVAILABLE', 'Authentication service temporarily unavailable')
    );
  }

  try {
    if (!user) {
      return res.status(401).json(
        formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found')
      );
    }
    if (user.banned) {
      return res.status(403).json(
        formatErrorResponse(ErrorCodes.AUTH_FORBIDDEN_BANNED, 'This account has been suspended')
      );
    }

    // Invalidate access tokens if tokenVersion has been incremented
    if (
      decoded.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      decoded.tokenVersion !== user.tokenVersion
    ) {
      userCache.delete(decoded.id);
      return res.status(401).json(
        formatErrorResponse(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Session has expired. Please log in again.')
      );
    }

    // Invalidate access tokens issued before the last password change
    if (user.passwordChangedAt && decoded.iat) {
      const changedSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (changedSec > decoded.iat) {
        userCache.delete(decoded.id);
        return res.status(401).json(
          formatErrorResponse(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Password was recently changed. Please log in again.')
        );
      }
    }

    // Role comes strictly from the database
    req.user = {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      shadowBanned: Boolean(user.shadowBanned),
      trust: user.trust,
      createdAt: user.createdAt,
    };
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !parts[1] || !parts[1].trim()) {
    return next();
  }

  const token = parts[1].trim();
  try {
    const decoded = verifyAccessToken(token);
    if (!decoded || typeof decoded !== 'object' || !decoded.id) {
      return next();
    }
    const now = Date.now();
    const cached = userCache.get(decoded.id);
    let user;

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      user = cached.user;
    } else {
      user = await User.findById(decoded.id)
        .select('banned role username passwordChangedAt tokenVersion shadowBanned trust createdAt')
        .lean();
      if (user) {
        userCache.set(decoded.id, { user, timestamp: now });
      }
    }

    if (user && !user.banned) {
      req.user = {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        shadowBanned: Boolean(user.shadowBanned),
        trust: user.trust,
        createdAt: user.createdAt,
      };
    }
  } catch (err) {
    // Non-blocking: continue as unauthenticated
  }
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(
        formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'Authentication required')
      );
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json(
        formatErrorResponse(
          ErrorCodes.FORBIDDEN,
          `Forbidden: insufficient permissions, required role in [${allowedRoles.join(', ')}]`
        )
      );
    }
    next();
  };
}

function invalidateUserAuthCache(userId = null) {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
  invalidateUserAuthCache,
  clearUserCache: invalidateUserAuthCache,
};
