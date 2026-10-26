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
const { normalizeText } = require('../utils/normalize');
const { parseLngLat, parseStrictCoordinate } = require('../utils/coordinates');
const { withTransaction } = require('../utils/withTransaction');
const { logAudit } = require('../services/audit');

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
        place,
      } = req.body;

      // K5: Strict boolean type check for hideExact
      if (typeof hideExact !== 'boolean' && hideExact !== undefined) {
        return res.status(400).json(
          formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'hideExact must be a boolean')
        );
      }

      // K5: Validate warnings array strictly
      const ALLOWED_WARNINGS = ['private_property', 'walking_required', 'unsafe_night', 'other'];
      if (!Array.isArray(warnings) || !warnings.every((w) => ALLOWED_WARNINGS.includes(w))) {
        return res.status(400).json(
          formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Invalid warning type')
        );
      }

      // K9: Image constraints: max 6, HTTPS URL max 500 chars, width/height integer 1..10000
      if (!Array.isArray(images) || images.length > 6) {
        return res.status(400).json(
          formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Maximum of 6 images allowed')
        );
      }

      for (const img of images) {
        const url = typeof img === 'string' ? img : img?.url;
        if (typeof url !== 'string' || !url.startsWith('https://') || url.length > 500) {
          return res.status(400).json(
            formatErrorResponse(
              ErrorCodes.VALIDATION_FAILED,
              'Images must use secure HTTPS URLs not exceeding 500 characters'
            )
          );
        }
        if (typeof img === 'object' && img !== null) {
          if (img.width !== undefined && (!Number.isInteger(img.width) || img.width < 1 || img.width > 10000)) {
            return res.status(400).json(
              formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Image width must be an integer between 1 and 10000')
            );
          }
          if (img.height !== undefined && (!Number.isInteger(img.height) || img.height < 1 || img.height > 10000)) {
            return res.status(400).json(
              formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Image height must be an integer between 1 and 10000')
            );
          }
        }
      }

      const formattedImages = images.map((img) => ({
        url: typeof img === 'string' ? img : img.url,
        ...(img.width ? { width: img.width } : {}),
        ...(img.height ? { height: img.height } : {}),
      }));

      // K2: Parse, round to 6 decimal places, and reject (0, 0) Null Island
      const rawCoordinates = req.body.coordinates || [longitude, latitude];
      const parsedCoords = parseLngLat(rawCoordinates);

      // K3 Part 1: Enforce max 100 char limit on place.city, place.state, and place.country
      const rawCity = (place && place.city) || city;
      const rawCountry = (place && place.country) || country;
      const rawState = (place && place.state) || state || '';

      const normalizedCity = normalizeText(rawCity, { maxLength: 100, fieldName: 'City' });
      const normalizedCountry = normalizeText(rawCountry, { maxLength: 100, fieldName: 'Country' });
      const normalizedState = rawState ? normalizeText(rawState, { maxLength: 100, fieldName: 'State' }) : '';

      const post = await Post.create({
        authorId: req.user.id,
        title,
        body,
        images: formattedImages,
        location: {
          type: 'Point',
          coordinates: parsedCoords,
        },
        hideExact: Boolean(hideExact),
        place: {
          city: normalizedCity,
          state: normalizedState,
          country: normalizedCountry,
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

    // K2: parse strictly, round to 6 decimals, and reject Null Island (0, 0)
    const latNum = parseStrictCoordinate(lat, { min: -90, max: 90, name: 'Latitude' });
    const lngNum = parseStrictCoordinate(lng, { min: -180, max: 180, name: 'Longitude' });
    if (latNum === 0 && lngNum === 0) {
      return res.status(400).json(
        formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Coordinates (0, 0) - Null Island is not permitted')
      );
    }

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

// PATCH /api/posts/:id - Edit post (author only, within 24 hours, immutable location/hideExact)
router.patch(
  '/:id',
  requireAuth,
  validateParams(postsValidators.postIdParamSchema),
  validateBody(postsValidators.updatePostSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const post = await Post.findOne({ _id: id, removed: { $ne: true } });
      if (!post) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Post not found'));
      }

      if (post.authorId.toString() !== req.user.id.toString()) {
        return res.status(403).json(
          formatErrorResponse(ErrorCodes.FORBIDDEN, 'Only the author can edit this post')
        );
      }

      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      if (Date.now() - new Date(post.createdAt).getTime() > TWENTY_FOUR_HOURS_MS) {
        return res.status(400).json(
          formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Posts can only be edited within 24 hours of creation')
        );
      }

      // Record editHistory before updating (capped at 5)
      post.editHistory = post.editHistory || [];
      post.editHistory.push({
        title: post.title,
        body: post.body,
        tags: post.tags,
        editedAt: new Date(),
      });
      if (post.editHistory.length > 5) {
        post.editHistory = post.editHistory.slice(-5);
      }

      // Apply updates
      if (req.body.title !== undefined) post.title = req.body.title;
      if (req.body.body !== undefined) post.body = req.body.body;
      if (req.body.tags !== undefined) post.tags = req.body.tags;
      if (req.body.warnings !== undefined) post.warnings = req.body.warnings;
      if (req.body.type !== undefined) post.type = req.body.type;
      post.editedAt = new Date();

      await post.save();
      const updated = await Post.findById(post._id).populate('authorId', 'username avatarUrl badges');
      res.json(sanitizePost(updated));
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/posts/:id - Soft-delete post (author or moderator/admin)
router.delete(
  '/:id',
  requireAuth,
  validateParams(postsValidators.postIdParamSchema),
  async (req, res, next) => {
    try {
      if (!req.baseUrl.includes('v1') && !req.originalUrl.includes('/v1')) {
        return res.status(405).json(
          formatErrorResponse(ErrorCodes.NOT_FOUND, 'DELETE is only supported on /api/v1/posts/:id')
        );
      }

      const { id } = req.params;
      const post = await Post.findOne({ _id: id, removed: { $ne: true } });
      if (!post) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Post not found'));
      }

      const isAuthor = post.authorId.toString() === req.user.id.toString();
      const isStaff = ['moderator', 'admin'].includes(req.user.role);

      if (!isAuthor && !isStaff) {
        return res.status(403).json(
          formatErrorResponse(ErrorCodes.FORBIDDEN, 'Only the author or a moderator can delete this post')
        );
      }

      post.removed = true;
      await post.save();

      // Decrement author's stats.posts if present
      if (post.authorId) {
        await User.findByIdAndUpdate(post.authorId, { $inc: { 'stats.posts': -1 } });
      }

      // If deleted by moderator or admin who is not the author, log audit
      if (!isAuthor && isStaff) {
        await logAudit({
          actorId: req.user.id,
          action: 'post_deleted',
          targetType: 'post',
          targetId: post._id,
          reason: req.body?.reason || 'moderator action',
        });
      }

      res.json({ message: 'Post deleted successfully', removed: true });
    } catch (err) {
      next(err);
    }
  }
);

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

      // K6: Forbid self-voting: return 403 if user is post author
      if (post.authorId.toString() === req.user.id.toString()) {
        return res.status(403).json(
          formatErrorResponse(ErrorCodes.FORBIDDEN, 'Authors cannot vote on their own post')
        );
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

      const { commentDoc, deltaResult } = await withTransaction(async (session) => {
        const post = await Post.findOne({ _id: id, removed: { $ne: true } }).session(session);
        if (!post) {
          const err = new Error('Post not found');
          err.statusCode = 404;
          err.code = ErrorCodes.NOT_FOUND;
          throw err;
        }

        // K4: Validate parentId (valid ObjectId, belongs to same post, not removed, depth <= 3)
        if (parentId) {
          if (!mongoose.Types.ObjectId.isValid(parentId)) {
            const err = new Error('Invalid parent comment ID');
            err.statusCode = 400;
            err.code = ErrorCodes.VALIDATION_FAILED;
            throw err;
          }

          const parentComment = await Comment.findOne({
            _id: parentId,
            postId: post._id,
            removed: { $ne: true },
          }).session(session);

          if (!parentComment) {
            const err = new Error('Parent comment not found on this post');
            err.statusCode = 400;
            err.code = ErrorCodes.VALIDATION_FAILED;
            throw err;
          }

          let depth = 1;
          let curr = parentComment;
          const visited = new Set([curr._id.toString()]);
          while (curr && curr.parentId) {
            depth++;
            if (depth >= 3) {
              const err = new Error('Maximum comment nesting depth of 3 exceeded');
              err.statusCode = 400;
              err.code = ErrorCodes.VALIDATION_FAILED;
              throw err;
            }
            curr = await Comment.findOne({
              _id: curr.parentId,
              postId: post._id,
              removed: { $ne: true },
            }).session(session);
            if (curr) {
              if (visited.has(curr._id.toString())) break;
              visited.add(curr._id.toString());
            }
          }
        }

        const createdComments = await Comment.create(
          [
            {
              postId: post._id,
              authorId: req.user.id,
              parentId: parentId || null,
              body,
            },
          ],
          { session }
        );
        const createdDoc = createdComments[0];

        // Task P2-T1: Support _failBeforeApplyDelta test injection hook in NODE_ENV=test
        if (process.env.NODE_ENV === 'test' && req.body._failBeforeApplyDelta) {
          const err = new Error('SIMULATED_TRANSACTION_FAILURE_BEFORE_APPLY_DELTA');
          err.statusCode = 500;
          throw err;
        }

        const delta = await meterService.applyDelta(post._id, { comments: 1 }, session);
        return { commentDoc: createdDoc, deltaResult: delta };
      });

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
      if (err.code === ErrorCodes.VALIDATION_FAILED || err.statusCode === 400) {
        return res.status(400).json(formatErrorResponse(ErrorCodes.VALIDATION_FAILED, err.message));
      }
      next(err);
    }
  }
);

// GET /api/posts/:id/comments - List comments for a post (with cursor or page pagination)
router.get(
  '/:id/comments',
  validateParams(postsValidators.postIdParamSchema),
  validateQuery(postsValidators.commentsQuerySchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { limit = 20, page, cursor } = req.query;

      const post = await Post.findOne({ _id: id, removed: { $ne: true } });
      if (!post) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Post not found'));
      }

      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);
      let filter = { postId: id, removed: { $ne: true } };

      if (cursor) {
        if (mongoose.Types.ObjectId.isValid(cursor)) {
          filter._id = { $gt: new mongoose.Types.ObjectId(cursor) };
        } else if (!Number.isNaN(new Date(cursor).getTime())) {
          filter.createdAt = { $gt: new Date(cursor) };
        }
      }

      let query = Comment.find(filter).sort({ _id: 1 });
      if (!cursor && page) {
        const pageNum = Math.max(Number(page) || 1, 1);
        query = query.skip((pageNum - 1) * limitNum);
      }

      const rawComments = await query
        .limit(limitNum + 1)
        .populate('authorId', 'username avatarUrl badges');

      const hasMore = rawComments.length > limitNum;
      const comments = hasMore ? rawComments.slice(0, limitNum) : rawComments;
      const nextCursor = hasMore && comments.length > 0 ? comments[comments.length - 1]._id.toString() : null;

      res.json({
        count: comments.length,
        hasMore,
        nextCursor,
        comments,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/posts/:id/comments/:commentId - Edit comment (author only)
router.patch(
  '/:id/comments/:commentId',
  requireAuth,
  validateParams(postsValidators.postAndCommentIdParamSchema),
  validateBody(postsValidators.updateCommentSchema),
  async (req, res, next) => {
    try {
      const { id, commentId } = req.params;
      const comment = await Comment.findOne({
        _id: commentId,
        postId: id,
        removed: { $ne: true },
      });
      if (!comment) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Comment not found'));
      }

      if (comment.authorId.toString() !== req.user.id.toString()) {
        return res.status(403).json(
          formatErrorResponse(ErrorCodes.FORBIDDEN, 'Only the author can edit this comment')
        );
      }

      comment.body = req.body.body;
      comment.edited = true;
      comment.editedAt = new Date();
      await comment.save();

      const populated = await Comment.findById(comment._id).populate('authorId', 'username avatarUrl badges');
      res.json({ message: 'Comment updated successfully', comment: populated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/posts/:id/comments/:commentId - Soft delete comment with counter decrement inside transaction
router.delete(
  '/:id/comments/:commentId',
  requireAuth,
  validateParams(postsValidators.postAndCommentIdParamSchema),
  async (req, res, next) => {
    try {
      const { id, commentId } = req.params;
      const comment = await Comment.findOne({
        _id: commentId,
        postId: id,
        removed: { $ne: true },
      });
      if (!comment) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Comment not found'));
      }

      const isAuthor = comment.authorId.toString() === req.user.id.toString();
      const isStaff = ['moderator', 'admin'].includes(req.user.role);

      if (!isAuthor && !isStaff) {
        return res.status(403).json(
          formatErrorResponse(ErrorCodes.FORBIDDEN, 'Only the author or a moderator can delete this comment')
        );
      }

      await withTransaction(async (session) => {
        comment.removed = true;
        await comment.save({ session });

        await meterService.applyDelta(id, { comments: -1 }, session);

        if (!isAuthor && isStaff) {
          await logAudit({
            actorId: req.user.id,
            action: 'comment_deleted',
            targetType: 'comment',
            targetId: comment._id,
            reason: req.body?.reason || 'moderator action',
            session,
          });
        }
      });

      res.json({ message: 'Comment deleted successfully', removed: true });
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
