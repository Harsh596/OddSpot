// backend/routes/communities.js
// Communities endpoints: creation, discovery, atomic membership join/leave, and community feeds (P14).

const { Router } = require('express');
const mongoose = require('mongoose');
const { Community, Membership, Post } = require('../models');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { withTransaction } = require('../utils/withTransaction');
const { serializePost } = require('../utils/postSerializer');
const {
  validateBody,
  validateQuery,
  communities: communitiesValidators,
  ErrorCodes,
  formatErrorResponse,
} = require('../validators');

const router = Router();

// Helper to escape regex special characters safely
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 1. POST /api/v1/communities (requires auth)
router.post(
  '/',
  requireAuth,
  validateBody(communitiesValidators.createCommunitySchema),
  async (req, res, next) => {
    try {
      const {
        name,
        slug,
        description,
        scope,
        place,
        coordinates,
        rules,
        flairs,
      } = req.body;

      // Unique slug check
      const existing = await Community.findOne({ slug: slug.toLowerCase() });
      if (existing) {
        return res
          .status(409)
          .json(
            formatErrorResponse(
              ErrorCodes.CONFLICT,
              'A community with this slug already exists'
            )
          );
      }

      const center =
        Array.isArray(coordinates) && coordinates.length === 2
          ? { type: 'Point', coordinates }
          : undefined;

      const { community } = await withTransaction(async (session) => {
        const [createdCommunity] = await Community.create(
          [
            {
              name,
              slug: slug.toLowerCase(),
              description,
              scope,
              place,
              center,
              rules,
              flairs,
              memberCount: 1,
              createdBy: req.user.id,
            },
          ],
          { session }
        );

        await Membership.create(
          [
            {
              userId: req.user.id,
              communityId: createdCommunity._id,
              role: 'owner',
            },
          ],
          { session }
        );

        return { community: createdCommunity };
      });

      return res.status(201).json({
        community,
        role: 'owner',
      });
    } catch (err) {
      next(err);
    }
  }
);

// 2. GET /api/v1/communities/nearby
router.get(
  '/nearby',
  validateQuery(communitiesValidators.nearbyCommunitiesQuerySchema),
  async (req, res, next) => {
    try {
      const { longitude, latitude, radius = 50000, q, limit = 20 } = req.query;
      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);

      const filter = {};
      if (q && typeof q === 'string' && q.trim().length > 0) {
        const escaped = escapeRegex(q.trim());
        filter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { description: { $regex: escaped, $options: 'i' } },
        ];
      }

      if (latitude !== undefined && longitude !== undefined) {
        filter.center = {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [Number(longitude), Number(latitude)],
            },
            $maxDistance: Number(radius),
          },
        };
      }

      const communities = await Community.find(filter)
        .limit(limitNum)
        .lean();

      return res.status(200).json({
        communities,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3. GET /api/v1/communities/:slug
router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string') {
      return res
        .status(400)
        .json(formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Slug is required'));
    }

    const community = await Community.findOne({ slug: slug.toLowerCase() }).lean();
    if (!community) {
      return res
        .status(404)
        .json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Community not found'));
    }

    let isMember = false;
    let memberRole = null;

    if (req.user) {
      const membership = await Membership.findOne({
        userId: req.user.id,
        communityId: community._id,
      }).lean();

      if (membership) {
        isMember = true;
        memberRole = membership.role;
      }
    }

    return res.status(200).json({
      community,
      isMember,
      memberRole,
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/v1/communities/:slug/join (requires auth)
router.post('/:slug/join', requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const community = await Community.findOne({ slug: slug.toLowerCase() });
    if (!community) {
      return res
        .status(404)
        .json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Community not found'));
    }

    const result = await withTransaction(async (session) => {
      const existing = await Membership.findOne({
        userId: req.user.id,
        communityId: community._id,
      }).session(session);

      if (existing) {
        return {
          ok: true,
          joined: false,
          role: existing.role,
          memberCount: community.memberCount,
        };
      }

      await Membership.create(
        [
          {
            userId: req.user.id,
            communityId: community._id,
            role: 'member',
          },
        ],
        { session }
      );

      const updated = await Community.findByIdAndUpdate(
        community._id,
        { $inc: { memberCount: 1 } },
        { session, new: true }
      );

      return {
        ok: true,
        joined: true,
        role: 'member',
        memberCount: updated.memberCount,
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/v1/communities/:slug/leave (requires auth)
router.post('/:slug/leave', requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const community = await Community.findOne({ slug: slug.toLowerCase() });
    if (!community) {
      return res
        .status(404)
        .json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Community not found'));
    }

    const result = await withTransaction(async (session) => {
      const membership = await Membership.findOne({
        userId: req.user.id,
        communityId: community._id,
      }).session(session);

      if (!membership) {
        return {
          ok: true,
          left: false,
          memberCount: community.memberCount,
        };
      }

      // Owner cannot leave without transferring ownership (400)
      if (membership.role === 'owner') {
        const err = new Error(
          'Owner cannot leave community without transferring ownership'
        );
        err.statusCode = 400;
        err.code = ErrorCodes.FORBIDDEN;
        throw err;
      }

      await Membership.deleteOne({ _id: membership._id }).session(session);

      const updated = await Community.findByIdAndUpdate(
        community._id,
        { $inc: { memberCount: -1 } },
        { session, new: true }
      );

      return {
        ok: true,
        left: true,
        memberCount: updated.memberCount,
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json(formatErrorResponse(err.code || ErrorCodes.FORBIDDEN, err.message));
    }
    next(err);
  }
});

// 6. GET /api/v1/communities/:slug/posts
router.get(
  '/:slug/posts',
  optionalAuth,
  validateQuery(communitiesValidators.communityPostsQuerySchema),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { cursor, limit = 20, sort = 'hot' } = req.query;
      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);

      const community = await Community.findOne({ slug: slug.toLowerCase() }).lean();
      if (!community) {
        return res
          .status(404)
          .json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Community not found'));
      }

      const filter = {
        communityId: community._id,
        removed: { $ne: true },
      };

      // Shadow-ban filter
      const isStaff =
        req.user && (req.user.role === 'moderator' || req.user.role === 'admin');
      if (!isStaff) {
        if (req.user) {
          filter.$or = [
            { shadowBannedAuthor: { $ne: true } },
            { authorId: new mongoose.Types.ObjectId(req.user.id) },
          ];
        } else {
          filter.shadowBannedAuthor = { $ne: true };
        }
      }

      // Cursor filtering
      if (cursor) {
        try {
          const decodedId = /^[0-9a-fA-F]{24}$/.test(cursor)
            ? cursor
            : JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')).id;
          if (decodedId && mongoose.Types.ObjectId.isValid(decodedId)) {
            filter._id = { $lt: new mongoose.Types.ObjectId(decodedId) };
          }
        } catch {
          // Ignore invalid cursor
        }
      }

      let sortObj = { hotScore: -1, _id: -1 };
      if (sort === 'new') {
        sortObj = { createdAt: -1, _id: -1 };
      } else if (sort === 'top') {
        sortObj = { 'meter.score': -1, _id: -1 };
      }

      const rawPosts = await Post.find(filter)
        .sort(sortObj)
        .limit(limitNum + 1)
        .populate('authorId', 'username avatarUrl badges')
        .lean();

      const hasMore = rawPosts.length > limitNum;
      const posts = hasMore ? rawPosts.slice(0, limitNum) : rawPosts;
      const nextCursor =
        hasMore && posts.length > 0 ? posts[posts.length - 1]._id.toString() : null;

      return res.status(200).json({
        community: {
          id: community._id.toString(),
          name: community.name,
          slug: community.slug,
        },
        posts: posts.map(serializePost),
        nextCursor,
        hasMore,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
