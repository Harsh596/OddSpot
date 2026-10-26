// backend/routes/posts.js
// Handles post creation, proximity feeds, voting, comments, and reports with atomic operations.

const { Router } = require('express');
const mongoose = require('mongoose');
const {
  createPostLimiter,
  voteLimiter,
  commentLimiter,
  reportLimiter,
} = require('../config/rateLimits');
const { Post, User, Comment, Report } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { idempotency } = require('../middleware/idempotency');
const meterService = require('../services/meter');
const cfg = require('../config/meter');
const {
  validateBody,
  validateQuery,
  validateParams,
  ErrorCodes,
  formatErrorResponse,
  posts: postsValidators,
} = require('../validators');

const router = Router();

// Allowed radius steps for maxDistance (1, 2, 5, 10, 25 km)
const ALLOWED_RADIUS_STEPS = [1000, 2000, 5000, 10000, 25000];

// Fuzz coordinates to ~500 meters (~0.005 degrees)
function fuzzCoordinates([lng, lat]) {
  const fuzzStep = 0.005;
  const fuzzedLat = Number((Math.round(lat / fuzzStep) * fuzzStep).toFixed(4));
  const fuzzedLng = Number((Math.round(lng / fuzzStep) * fuzzStep).toFixed(4));
  return [fuzzedLng, fuzzedLat];
}

// Calculate spherical distance between two [lng, lat] points in meters
function getHaversineDistanceMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6371000; // Earth radius in meters
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Snap requested maxDistance to nearest allowed radius step
function snapMaxDistance(input) {
  if (input === undefined || input === null) return 10000;
  const num = Number(input);
  if (isNaN(num) || num <= 0) return 10000;
  return ALLOWED_RADIUS_STEPS.reduce((prev, curr) =>
    Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev
  );
}

// Format post output for API responses, enforcing hideExact fuzzing and anti-trilateration protection
function sanitizePost(post, queryCoords = null) {
  const doc = post.toObject ? post.toObject() : { ...post };

  if (doc.hideExact && doc.location && Array.isArray(doc.location.coordinates)) {
    const fuzzedCoords = fuzzCoordinates(doc.location.coordinates);
    doc.location = {
      ...doc.location,
      coordinates: fuzzedCoords,
      fuzzed: true,
    };

    // Calculate distance to fuzzed coordinates, rounded to nearest 500 meters
    if (queryCoords) {
      const distToFuzzed = getHaversineDistanceMeters(queryCoords, fuzzedCoords);
      doc.distanceMeters = Math.round(distToFuzzed / 500) * 500;
    } else if (doc.distanceMeters !== undefined) {
      doc.distanceMeters = Math.round(doc.distanceMeters / 500) * 500;
    }
  } else if (doc.distanceMeters !== undefined) {
    doc.distanceMeters = Math.round(doc.distanceMeters);
  }

  return doc;
}

// POST /api/posts - Create a new post
router.post(
  '/',
  requireAuth,
  createPostLimiter,
  idempotency('/api/posts'),
  validateBody(postsValidators.createPostSchema),
  async (req, res, next) => {
    try {
      const {
        title,
        body = '',
        images = [],
        latitude,
        longitude,
        city,
        state = '',
        country,
        tags = [],
        warnings = [],
        hideExact = false,
        type = 'find',
      } = req.body;

      const formattedImages = images.map((img) => ({
        url: typeof img === 'string' ? img : img.url,
        ...(img.width ? { width: img.width } : {}),
        ...(img.height ? { height: img.height } : {}),
      }));

      const post = await Post.create({
        authorId: req.user.id,
        title,
        body,
        images: formattedImages,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        hideExact: Boolean(hideExact),
        place: {
          city,
          state,
          country,
        },
        tags,
        warnings,
        type,
      });

      // Increment user stats.posts
      await User.findByIdAndUpdate(req.user.id, { $inc: { 'stats.posts': 1 } });

      res.status(201).json(sanitizePost(post));
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/posts/nearby - Proximity feed with radius protection
router.get('/nearby', validateQuery(postsValidators.nearbyQuerySchema), async (req, res, next) => {
  try {
    const { lat, lng, maxDistance, limit, page } = req.query;

    const latNum = Number(lat);
    const lngNum = Number(lng);

    // Snap maxDistance to fixed allowed steps [1000, 2000, 5000, 10000, 25000]
    const snappedDistance = snapMaxDistance(maxDistance);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const pageNum = Math.max(Number(page) || 1, 1);
    const skipNum = (pageNum - 1) * limitNum;

    // Over-fetch by 1000 meters in $geoNear so that hideExact posts
    // whose true point is outside the radius but whose fuzzed point is inside
    // are included for subsequent evaluation.
    const overfetchDistance = snappedDistance + 1000;

    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lngNum, latNum] },
          distanceField: 'distanceMeters',
          maxDistance: overfetchDistance,
          spherical: true,
          query: { removed: { $ne: true } },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'authorId',
          foreignField: '_id',
          as: 'author',
          pipeline: [{ $project: { username: 1, avatarUrl: 1, badges: 1 } }],
        },
      },
      {
        $unwind: { path: '$author', preserveNullAndEmptyArrays: true },
      },
      { $limit: 100 },
    ];

    const rawPosts = await Post.aggregate(pipeline);
    const queryCoords = [lngNum, latNum];

    // Filter in application code:
    // For hideExact posts, inclusion in feed MUST depend ONLY on distance to fuzzed point!
    const filteredPosts = [];
    for (const raw of rawPosts) {
      if (raw.hideExact && raw.location && Array.isArray(raw.location.coordinates)) {
        const fuzzedCoords = fuzzCoordinates(raw.location.coordinates);
        const distToFuzzed = getHaversineDistanceMeters(queryCoords, fuzzedCoords);
        if (distToFuzzed <= snappedDistance) {
          filteredPosts.push(sanitizePost(raw, queryCoords));
        }
      } else {
        if (raw.distanceMeters <= snappedDistance) {
          filteredPosts.push(sanitizePost(raw, queryCoords));
        }
      }
    }

    // Sort by sanitized distanceMeters so sort order doesn't leak exact sub-500m ranking
    filteredPosts.sort((a, b) => {
      const distA = a.distanceMeters || 0;
      const distB = b.distanceMeters || 0;
      if (distA !== distB) return distA - distB;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const paginatedPosts = filteredPosts.slice(skipNum, skipNum + limitNum);

    res.json({
      page: pageNum,
      limit: limitNum,
      radiusMeters: snappedDistance,
      totalNearby: filteredPosts.length,
      count: paginatedPosts.length,
      posts: paginatedPosts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/posts/:id - View single post
router.get('/:id', validateParams(postsValidators.postIdParamSchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    const post = await Post.findOne({ _id: id, removed: { $ne: true } })
      .populate('authorId', 'username avatarUrl badges');

    if (!post) {
      return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Post not found'));
    }

    res.json(sanitizePost(post));
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:id/vote - Like or dislike
router.post(
  '/:id/vote',
  requireAuth,
  voteLimiter,
  validateParams(postsValidators.postIdParamSchema),
  validateBody(postsValidators.voteSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { value } = req.body;

      const post = await Post.findOne({ _id: id, removed: { $ne: true } });
      if (!post) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Post not found'));
      }

      const result = await meterService.castVote(req.user.id, post._id, value);
      if (!result) {
        const currentPost = await Post.findById(id).select('meter tier');
        return res.json({
          message: 'Vote already recorded',
          changed: false,
          score: currentPost ? currentPost.meter.score : post.meter.score,
          meter: currentPost ? currentPost.meter : post.meter,
          tier: currentPost ? currentPost.tier : post.tier,
        });
      }

      const updatedPost = await Post.findById(id).select('meter tier');
      res.json({
        message: 'Vote cast successfully',
        changed: true,
        score: updatedPost ? updatedPost.meter.score : result.score,
        meter: updatedPost ? updatedPost.meter : result.meter,
        tier: updatedPost ? updatedPost.tier : result.tier,
        tieredUp: result.tieredUp,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/posts/:id/comments - Add a comment
router.post(
  '/:id/comments',
  requireAuth,
  commentLimiter,
  idempotency('/api/posts/:id/comments'),
  validateParams(postsValidators.postIdParamSchema),
  validateBody(postsValidators.commentSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { body, parentId = null } = req.body;

      const session = await mongoose.startSession();
      let commentDoc;
      let deltaResult;
      try {
        await session.withTransaction(async () => {
          const post = await Post.findOne({ _id: id, removed: { $ne: true } }).session(session);
          if (!post) {
            const err = new Error('Post not found');
            err.statusCode = 404;
            err.code = ErrorCodes.NOT_FOUND;
            throw err;
          }

          const createdComments = await Comment.create(
            [
              {
                postId: post._id,
                authorId: req.user.id,
                parentId,
                body,
              },
            ],
            { session }
          );
          commentDoc = createdComments[0];

          deltaResult = await meterService.applyDelta(post._id, { comments: 1 }, session);
        });
      } finally {
        await session.endSession();
      }

      const populated = await Comment.findById(commentDoc._id)
        .populate('authorId', 'username avatarUrl badges');

      res.status(201).json({
        comment: populated,
        meterScore: deltaResult ? deltaResult.score : 0,
      });
    } catch (err) {
      if (err.statusCode === 404 || err.message === 'Post not found') {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Post not found'));
      }
      next(err);
    }
  }
);

// GET /api/posts/:id/comments - List comments for a post
router.get(
  '/:id/comments',
  validateParams(postsValidators.postIdParamSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { limit = 50, page = 1 } = req.query;

      const post = await Post.findOne({ _id: id, removed: { $ne: true } });
      if (!post) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Post not found'));
      }

      const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const pageNum = Math.max(Number(page) || 1, 1);
      const skipNum = (pageNum - 1) * limitNum;

      const comments = await Comment.find({ postId: id, removed: { $ne: true } })
        .sort({ createdAt: 1 })
        .skip(skipNum)
        .limit(limitNum)
        .populate('authorId', 'username avatarUrl badges');

      res.json({
        count: comments.length,
        comments,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/posts/:id/report - Report a post
router.post(
  '/:id/report',
  requireAuth,
  reportLimiter,
  validateParams(postsValidators.postIdParamSchema),
  validateBody(postsValidators.reportSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason, details, notes } = req.body;

      const post = await Post.findOne({ _id: id, removed: { $ne: true } });
      if (!post) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Post not found'));
      }

      // Guardrail: Users cannot report their own posts
      if (post.authorId.toString() === req.user.id) {
        return res.status(400).json(
          formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'You cannot report your own post')
        );
      }

      // Check for duplicate report
      const existing = await Report.findOne({
        reporterId: req.user.id,
        targetType: 'post',
        targetId: post._id,
      });
      if (existing) {
        return res.status(409).json(
          formatErrorResponse(ErrorCodes.DUPLICATE_KEY, 'You have already reported this post')
        );
      }

      const cleanDetails = details || notes || undefined;
      let report;
      try {
        report = await Report.create({
          targetType: 'post',
          targetId: post._id,
          reporterId: req.user.id,
          reason,
          details: cleanDetails,
        });
      } catch (createErr) {
        if (createErr.code === 11000) {
          return res.status(409).json(
            formatErrorResponse(ErrorCodes.DUPLICATE_KEY, 'You have already reported this post')
          );
        }
        throw createErr;
      }

      // Automatic fuzzing: when post reaches REPORT_FUZZ_THRESHOLD reports for 'unsafe_or_private'
      let autoFuzzed = false;
      if (reason === 'unsafe_or_private') {
        const fuzzThreshold = cfg.reportFuzzThreshold || 3;
        const unsafeCount = await Report.countDocuments({
          targetType: 'post',
          targetId: post._id,
          reason: 'unsafe_or_private',
        });

        if (unsafeCount >= fuzzThreshold && !post.hideExact) {
          await Post.updateOne({ _id: post._id }, { $set: { hideExact: true } });
          autoFuzzed = true;
        }
      }

      res.status(201).json({
        message: 'Report submitted successfully',
        reportId: report._id,
        autoFuzzed,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
