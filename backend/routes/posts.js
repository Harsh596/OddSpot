const { Router } = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { Post, User, Comment, Vote, Report } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { idempotency } = require('../middleware/idempotency');
const meterService = require('../services/meter');
const cfg = require('../config/meter');

const router = Router();

// Allowed radius steps for maxDistance (1, 2, 5, 10, 25 km)
const ALLOWED_RADIUS_STEPS = [1000, 2000, 5000, 10000, 25000];

// Rate limiters for write actions (overrideable in non-production)
function getWriteLimitMax(defaultVal) {
  if (process.env.NODE_ENV !== 'production' && process.env.WRITE_RATE_LIMIT_MAX) {
    return Number(process.env.WRITE_RATE_LIMIT_MAX);
  }
  return defaultVal;
}

const createPostLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: () => getWriteLimitMax(30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many posts created, please try again later' },
});

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteLimitMax(120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many votes submitted, please slow down' },
});

const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteLimitMax(60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments submitted, please slow down' },
});

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: () => getWriteLimitMax(20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports submitted, please slow down' },
});

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
router.post('/', requireAuth, createPostLimiter, idempotency('/api/posts'), async (req, res, next) => {
  try {
    const {
      title,
      body,
      images,
      latitude,
      longitude,
      coordinates,
      place,
      city,
      state,
      country,
      tags,
      warnings,
      hideExact,
      type,
    } = req.body || {};

    // 1. Post type validation
    let postType = 'find';
    if (type !== undefined && type !== null) {
      if (typeof type !== 'string' || !['find', 'identify'].includes(type.trim())) {
        return res.status(400).json({ error: "Post type must be 'find' or 'identify'" });
      }
      postType = type.trim();
    }

    // 2. Title validation
    if (!title || typeof title !== 'string' || !title.trim() || title.includes('\0')) {
      return res.status(400).json({ error: 'Title is required and must not contain null characters' });
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length > 140) {
      return res.status(400).json({ error: 'Title must not exceed 140 characters' });
    }

    // 3. Body validation
    let cleanBody = '';
    if (body !== undefined && body !== null) {
      if (typeof body !== 'string' || body.length > 10000 || body.includes('\0')) {
        return res.status(400).json({ error: 'Body must be text up to 10,000 characters without null characters' });
      }
      cleanBody = body.trim();
    }

    // 4. Coordinates extraction & validation
    let latNum, lngNum;
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      if (typeof coordinates[0] !== 'number' && typeof coordinates[0] !== 'string') {
        return res.status(400).json({ error: 'Invalid coordinate values' });
      }
      if (typeof coordinates[1] !== 'number' && typeof coordinates[1] !== 'string') {
        return res.status(400).json({ error: 'Invalid coordinate values' });
      }
      lngNum = Number(coordinates[0]);
      latNum = Number(coordinates[1]);
    } else if (latitude !== undefined && longitude !== undefined) {
      if (typeof latitude !== 'number' && typeof latitude !== 'string') {
        return res.status(400).json({ error: 'Latitude must be a valid number' });
      }
      if (typeof longitude !== 'number' && typeof longitude !== 'string') {
        return res.status(400).json({ error: 'Longitude must be a valid number' });
      }
      latNum = Number(latitude);
      lngNum = Number(longitude);
    } else {
      return res.status(400).json({
        error: 'Location coordinates are required (either [lng, lat] or latitude and longitude)',
      });
    }

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return res.status(400).json({ error: 'Latitude must be a number between -90 and 90' });
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ error: 'Longitude must be a number between -180 and 180' });
    }

    // 5. Place validation
    const placeCity =
      place && typeof place === 'object' && typeof place.city === 'string'
        ? place.city
        : typeof city === 'string'
        ? city
        : null;

    const placeCountry =
      place && typeof place === 'object' && typeof place.country === 'string'
        ? place.country
        : typeof country === 'string'
        ? country
        : null;

    const placeState =
      place && typeof place === 'object' && typeof place.state === 'string'
        ? place.state
        : typeof state === 'string'
        ? state
        : '';

    if (!placeCity || !placeCity.trim() || placeCity.includes('\0')) {
      return res.status(400).json({ error: 'City is invalid or contains null characters' });
    }
    if (!placeCountry || !placeCountry.trim() || placeCountry.includes('\0')) {
      return res.status(400).json({ error: 'Country is invalid or contains null characters' });
    }
    if (placeState && placeState.includes('\0')) {
      return res.status(400).json({ error: 'State must not contain null characters' });
    }

    // 6. Image validation: URLs only, https only, max 6
    let formattedImages = [];
    if (images !== undefined && images !== null) {
      if (!Array.isArray(images)) {
        return res.status(400).json({ error: 'Images must be an array' });
      }
      if (images.length > 6) {
        return res.status(400).json({ error: 'Maximum of 6 images allowed' });
      }

      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        const url =
          typeof item === 'string'
            ? item.trim()
            : item && typeof item === 'object' && typeof item.url === 'string'
            ? item.url.trim()
            : null;

        if (!url || !url.startsWith('https://')) {
          return res.status(400).json({
            error: `Image at index ${i} must have a valid HTTPS URL (only URLs are stored)`,
          });
        }

        formattedImages.push({
          url,
          width: typeof item === 'object' && item.width ? Number(item.width) : undefined,
          height: typeof item === 'object' && item.height ? Number(item.height) : undefined,
        });
      }
    }

    // 7. Tags validation: max 10, trimmed and lowercased, max 30 chars each
    let cleanTags = [];
    if (tags !== undefined && tags !== null) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
      }
      if (tags.length > 10) {
        return res.status(400).json({ error: 'Maximum of 10 tags allowed' });
      }

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        if (typeof tag !== 'string' || tag.includes('\0')) {
          return res.status(400).json({ error: `Tag at index ${i} must be a string without null characters` });
        }
        const trimmed = tag.trim().toLowerCase();
        if (trimmed.length > 30) {
          return res.status(400).json({
            error: `Tag at index ${i} exceeds maximum length of 30 characters`,
          });
        }
        if (trimmed.length > 0) {
          cleanTags.push(trimmed);
        }
      }
    }

    // 8. Warnings validation
    const validWarnings = ['private_property', 'walking_required', 'unsafe_night', 'other'];
    const cleanWarnings = Array.isArray(warnings)
      ? warnings
          .filter((w) => typeof w === 'string' && validWarnings.includes(w.trim()))
          .map((w) => w.trim())
      : [];

    // Create post with authorId taken from verified JWT
    const post = await Post.create({
      authorId: req.user.id,
      title: cleanTitle,
      body: cleanBody,
      images: formattedImages,
      location: {
        type: 'Point',
        coordinates: [lngNum, latNum],
      },
      hideExact: Boolean(hideExact),
      place: {
        city: placeCity.trim(),
        state: placeState ? placeState.trim() : '',
        country: placeCountry.trim(),
      },
      tags: cleanTags,
      warnings: cleanWarnings,
      type: postType,
    });

    // Increment user stats.posts
    await User.findByIdAndUpdate(req.user.id, { $inc: { 'stats.posts': 1 } });

    res.status(201).json(sanitizePost(post));
  } catch (err) {
    next(err);
  }
});

// GET /api/posts/nearby - Proximity feed with radius protection
router.get('/nearby', async (req, res, next) => {
  try {
    const { lat, lng, maxDistance, limit, page } = req.query;

    if (lat === undefined || lat === null || (typeof lat !== 'string' && typeof lat !== 'number')) {
      return res.status(400).json({ error: 'Valid latitude query parameter is required (-90 to 90)' });
    }
    if (lng === undefined || lng === null || (typeof lng !== 'string' && typeof lng !== 'number')) {
      return res.status(400).json({ error: 'Valid longitude query parameter is required (-180 to 180)' });
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return res.status(400).json({ error: 'Valid latitude query parameter is required (-90 to 90)' });
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ error: 'Valid longitude query parameter is required (-180 to 180)' });
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
      // Bound aggregation fetch to prevent memory issues
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
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const post = await Post.findOne({ _id: id, removed: { $ne: true } })
      .populate('authorId', 'username avatarUrl badges');

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(sanitizePost(post));
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:id/vote - Like or dislike
router.post('/:id/vote', requireAuth, voteLimiter, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { value } = req.body || {};

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    if (value !== 1 && value !== -1) {
      return res.status(400).json({ error: 'Vote value must be 1 (like) or -1 (dislike)' });
    }

    const post = await Post.findOne({ _id: id, removed: { $ne: true } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
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
});

// POST /api/posts/:id/comments - Add a comment
router.post('/:id/comments', requireAuth, commentLimiter, idempotency('/api/posts/:id/comments'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { body, parentId } = req.body || {};

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    if (!body || typeof body !== 'string' || !body.trim() || body.includes('\0')) {
      return res.status(400).json({ error: 'Comment body is required and must not contain null characters' });
    }

    const cleanBody = body.trim();
    if (cleanBody.length > 5000) {
      return res.status(400).json({ error: 'Comment body must not exceed 5000 characters' });
    }

    let validParentId = null;
    if (parentId !== undefined && parentId !== null) {
      if (typeof parentId !== 'string' || !mongoose.Types.ObjectId.isValid(parentId)) {
        return res.status(400).json({ error: 'Invalid parent comment ID' });
      }
      validParentId = parentId;
    }

    const session = await mongoose.startSession();
    let commentDoc;
    let deltaResult;
    try {
      await session.withTransaction(async () => {
        const post = await Post.findOne({ _id: id, removed: { $ne: true } }).session(session);
        if (!post) {
          const err = new Error('Post not found');
          err.statusCode = 404;
          throw err;
        }

        const createdComments = await Comment.create(
          [
            {
              postId: post._id,
              authorId: req.user.id,
              parentId: validParentId,
              body: cleanBody,
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
    next(err);
  }
});

// GET /api/posts/:id/comments - List comments for a post
router.get('/:id/comments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50, page = 1 } = req.query;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const post = await Post.findOne({ _id: id, removed: { $ne: true } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
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
});

// POST /api/posts/:id/report - Report a post
router.post('/:id/report', requireAuth, reportLimiter, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, details } = req.body || {};

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const validReasons = ['unsafe_or_private', 'nsfw', 'spam', 'doxxing', 'misinformation', 'other'];
    if (!reason || typeof reason !== 'string' || !validReasons.includes(reason.trim())) {
      return res.status(400).json({
        error: `Valid reason is required. Must be one of: ${validReasons.join(', ')}`,
      });
    }

    let cleanDetails = undefined;
    if (details !== undefined && details !== null) {
      if (typeof details !== 'string') {
        return res.status(400).json({ error: 'Details must be text' });
      }
      cleanDetails = details.trim();
      if (cleanDetails.length > 500) {
        return res.status(400).json({ error: 'Details must not exceed 500 characters' });
      }
    }

    const post = await Post.findOne({ _id: id, removed: { $ne: true } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Guardrail: Users cannot report their own posts
    if (post.authorId.toString() === req.user.id) {
      return res.status(400).json({ error: 'You cannot report your own post' });
    }

    // Check for duplicate report
    const existing = await Report.findOne({
      reporterId: req.user.id,
      targetType: 'post',
      targetId: post._id,
    });
    if (existing) {
      return res.status(409).json({ error: 'You have already reported this post' });
    }

    let report;
    try {
      report = await Report.create({
        targetType: 'post',
        targetId: post._id,
        reporterId: req.user.id,
        reason: reason.trim(),
        details: cleanDetails,
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        return res.status(409).json({ error: 'You have already reported this post' });
      }
      throw createErr;
    }

    // Automatic fuzzing: when post reaches REPORT_FUZZ_THRESHOLD reports for 'unsafe_or_private'
    let autoFuzzed = false;
    if (reason.trim() === 'unsafe_or_private') {
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
});

module.exports = router;
