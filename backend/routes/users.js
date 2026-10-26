// backend/routes/users.js
// User profile routes, caller's posts list, and GDPR/privacy data export.

const express = require('express');
const router = express.Router();
const { User, Post, Comment, Vote, Report } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { ErrorCodes, formatErrorResponse } = require('../validators');

// GET /api/v1/users/me/posts - List authenticated user's posts
router.get('/me/posts', requireAuth, async (req, res, next) => {
  try {
    const posts = await Post.find({
      authorId: req.user.id,
      removed: { $ne: true },
    }).sort({ createdAt: -1 });

    res.json({
      count: posts.length,
      posts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/me/export - Complete personal data export (JSON dump)
router.get('/me/export', requireAuth, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Content-Disposition', 'attachment; filename="oddspot-user-data.json"');

    const user = await User.findById(req.user.id).lean();
    if (!user) {
      return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    // Strip internal credential hashes and secret tokens from user dump
    delete user.passwordHash;
    delete user.emailVerificationTokenHash;
    delete user.emailVerificationExpires;
    delete user.passwordResetTokenHash;
    delete user.passwordResetExpires;

    const [posts, comments, votes, reports] = await Promise.all([
      Post.find({ authorId: req.user.id }).lean(),
      Comment.find({ authorId: req.user.id }).lean(),
      Vote.find({ userId: req.user.id }).lean(),
      Report.find({ reporterId: req.user.id }).lean(),
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      user,
      posts,
      comments,
      votes,
      reports,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/:username - Public user profile (PII safe)
router.get('/:username', async (req, res, next) => {
  try {
    const { username } = req.params;
    if (!username || typeof username !== 'string') {
      return res.status(400).json(formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Username parameter is required'));
    }

    const usernameLower = username.toLowerCase().trim();
    const user = await User.findOne({ usernameLower }).lean();

    if (!user || user.banned) {
      return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    // Emit only public non-sensitive fields
    res.json({
      id: user._id.toString(),
      username: user.username,
      avatarUrl: user.avatarUrl || null,
      bio: user.bio || '',
      homePlace: user.homePlace || null,
      stats: {
        posts: user.stats?.posts || 0,
        visits: user.stats?.visits || 0,
      },
      badges: user.badges || [],
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
