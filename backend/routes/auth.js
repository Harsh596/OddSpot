const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { User } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Rate limiting for auth routes: 20 attempts per 15 minutes per IP (overrideable in non-production)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => {
    if (process.env.NODE_ENV !== 'production' && process.env.AUTH_RATE_LIMIT_MAX) {
      return Number(process.env.AUTH_RATE_LIMIT_MAX);
    }
    return 20;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests from this IP, please try again after 15 minutes' },
});

// Helper to generate JWT token
function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/signup
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const { username, email, password } = req.body || {};

    // Basic validation
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 24) {
      return res.status(400).json({ error: 'Username must be between 3 and 24 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if username or email already exists
    const existing = await User.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }],
    });

    if (existing) {
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
      return res.status(409).json({ error: 'Email is already registered' });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
    });

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        homePlace: user.homePlace,
        badges: user.badges,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { identifier, password } = req.body || {};

    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ error: 'Username or email is required' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    const cleanIdentifier = identifier.trim();

    // Find user by either email or username; select '+passwordHash' because select: false is on schema
    const user = await User.findOne({
      $or: [
        { email: cleanIdentifier.toLowerCase() },
        { username: cleanIdentifier },
      ],
    }).select('+passwordHash');

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'This account has been suspended' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        homePlace: user.homePlace,
        badges: user.badges,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me (Protected route)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        homePlace: user.homePlace,
        badges: user.badges,
        stats: user.stats,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
