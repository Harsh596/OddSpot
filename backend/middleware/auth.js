const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Short-lived in-memory cache to prevent database exhaustion on rapid sequential requests
const userCache = new Map();
const CACHE_TTL_MS = 10000; // 10 seconds

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !parts[1] || !parts[1].trim()) {
    return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
  }

  const token = parts[1].trim();
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || typeof decoded !== 'object' || !decoded.id) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const now = Date.now();
    const cached = userCache.get(decoded.id);
    let user;

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      user = cached.user;
    } else {
      user = await User.findById(decoded.id).select('banned role username').lean();
      if (user) {
        userCache.set(decoded.id, { user, timestamp: now });
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.banned) {
      return res.status(403).json({ error: 'This account has been suspended' });
    }

    req.user = {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
    };
    next();
  } catch (err) {
    // Graceful fallback to verified JWT payload if database has a transient network error
    if (decoded && decoded.id) {
      req.user = {
        id: decoded.id,
        username: decoded.username || '',
        role: decoded.role || 'member',
      };
      return next();
    }
    next(err);
  }
}

module.exports = { requireAuth };
