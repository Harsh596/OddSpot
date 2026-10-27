// backend/routes/users.js
// User profile routes, caller's posts list, and GDPR/privacy data export.

const express = require('express');
const router = express.Router();
const { User, Post, Comment, Vote, Report, Visit, Membership } = require('../models');
const { serializePost } = require('../utils/postSerializer');
const { requireAuth } = require('../middleware/auth');
const {
  validateBody,
  feed: feedValidators,
  ErrorCodes,
  formatErrorResponse,
} = require('../validators');

// PATCH /api/v1/users/me/preferences - Save user preferences (feedConfig, theme, profileLayout)
router.patch(
  '/me/preferences',
  requireAuth,
  validateBody(feedValidators.updatePreferencesSchema),
  async (req, res, next) => {
    try {
      const { feedConfig, theme, profileLayout } = req.body;
      const update = {};
      if (feedConfig !== undefined) update.feedConfig = feedConfig;
      if (theme !== undefined) update.theme = theme;
      if (profileLayout !== undefined) update.profileLayout = profileLayout;

      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: update },
        { new: true }
      ).lean();

      if (!user) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
      }

      res.json({
        ok: true,
        preferences: {
          feedConfig: user.feedConfig,
          theme: user.theme,
          profileLayout: user.profileLayout,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/users/me - Update user profile (avatarUrl, bio)
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { avatarUrl, bio } = req.body;
    const update = {};
    if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== '') {
      const { validateSafeImageUrl } = require('../utils/imageUrlValidator');
      const avatarValidation = validateSafeImageUrl(avatarUrl);
      if (!avatarValidation.valid) {
        return res.status(400).json(
          formatErrorResponse(
            ErrorCodes.VALIDATION_FAILED,
            avatarValidation.error || 'Invalid avatar URL'
          )
        );
      }
      update.avatarUrl = avatarUrl;
    } else if (avatarUrl === null || avatarUrl === '') {
      update.avatarUrl = null;
    }

    if (bio !== undefined) {
      update.bio = typeof bio === 'string' ? bio.slice(0, 300) : '';
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!user) {
      return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    return res.status(200).json({
      ok: true,
      user: {
        id: user._id.toString(),
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        bio: user.bio || '',
      },
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json(formatErrorResponse(ErrorCodes.VALIDATION_FAILED, err.message));
    }
    next(err);
  }
});

// PATCH /api/v1/users/me/profile - Alias for profile update
router.patch('/me/profile', requireAuth, (req, res, next) => {
  req.url = '/me';
  return router.handle(req, res, next);
});

// POST /api/v1/users/me/onboarding-complete - Complete scout onboarding and award 'scout' badge
router.post('/me/onboarding-complete', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: { onboardingDone: true },
        $addToSet: { badges: 'scout' },
      },
      { new: true }
    ).lean();

    if (!user) {
      return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    res.json({
      onboardingDone: true,
      badges: user.badges || [],
    });
  } catch (err) {
    next(err);
  }
});

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

// GET /api/v1/users/:username/visits - Verified visits for a user
router.get('/:username/visits', async (req, res, next) => {
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

    const visits = await Visit.find({ userId: user._id, verified: true })
      .sort({ createdAt: -1 })
      .populate({
        path: 'postId',
        select: '-__v',
      })
      .lean();

    // Sanitize visits and their populated post summaries
    const sanitizedVisits = visits
      .filter((v) => v.postId && v.postId.removed !== true)
      .map((v) => {
        const serializedPost = serializePost(v.postId);
        // Never leak exact coordinates for hidden posts
        const visitCoords =
          v.postId.hideExact && serializedPost.location?.coordinates
            ? serializedPost.location.coordinates
            : v.location?.coordinates;

        return {
          id: v._id.toString(),
          postId: serializedPost._id?.toString() || v.postId._id?.toString(),
          post: serializedPost,
          spotStatus: v.spotStatus || 'still_there',
          photoUrl: v.photoUrl || null,
          note: v.note || null,
          location: {
            type: 'Point',
            coordinates: visitCoords,
            fuzzed: Boolean(v.postId.hideExact),
          },
          verified: true,
          createdAt: v.createdAt,
        };
      });

    res.json({
      count: sanitizedVisits.length,
      visits: sanitizedVisits,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/:username/posts - Public posts created by a user
router.get('/:username/posts', async (req, res, next) => {
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

    const rawPosts = await Post.find({
      authorId: user._id,
      removed: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .lean();

    const posts = rawPosts.map((p) => serializePost(p));

    res.json({
      count: posts.length,
      posts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/:username/communities - Joined communities for a user
router.get('/:username/communities', async (req, res, next) => {
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

    const memberships = await Membership.find({ userId: user._id })
      .populate('communityId')
      .lean();

    const communities = memberships
      .filter((m) => m.communityId)
      .map((m) => ({
        ...m.communityId,
        id: m.communityId._id.toString(),
        role: m.role,
        joinedAt: m.createdAt,
      }));

    res.json({
      count: communities.length,
      communities,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

