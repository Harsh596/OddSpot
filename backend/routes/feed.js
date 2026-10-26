// backend/routes/feed.js
// High-performance regional feeds: /feed/city, /feed/country, and /feed/random
// Features: lean projections, cursor pagination, weak ETag, stale-while-revalidate caching.

const { Router } = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Post } = require('../models');
const { toCityKey, resolveCountry } = require('../utils/place');
const { serializePost } = require('../utils/postSerializer');
const {
  validateQuery,
  feed: feedValidators,
  ErrorCodes,
  formatErrorResponse,
} = require('../validators');
const { optionalAuth } = require('../middleware/auth');

const router = Router();
router.use(optionalAuth);

function applyShadowBanFilter(filter, user) {
  const isStaff = user && (user.role === 'moderator' || user.role === 'admin');
  if (isStaff) return filter;
  if (user) {
    const shadowOr = [
      { shadowBannedAuthor: { $ne: true } },
      { authorId: new mongoose.Types.ObjectId(user.id) },
    ];
    if (filter.$and) {
      filter.$and.push({ $or: shadowOr });
    } else {
      filter.$or = shadowOr;
    }
  } else {
    filter.shadowBannedAuthor = { $ne: true };
  }
  return filter;
}

// Standard lean feed projection (omits heavy editHistory, updates, etc.)
const FEED_PROJECTION = {
  _id: 1,
  title: 1,
  body: 1,
  images: 1,
  type: 1,
  location: 1,
  feedLocation: 1,
  hideExact: 1,
  place: 1,
  tags: 1,
  warnings: 1,
  tier: 1,
  meter: 1,
  hotScore: 1,
  spotStatus: 1,
  solved: 1,
  authorId: 1,
  createdAt: 1,
  updatedAt: 1,
};

// Encode cursor for next page
function encodeCursor(sort, post) {
  if (!post) return null;
  let v = post.createdAt;
  if (sort === 'top') v = post.meter?.score ?? 0;
  if (sort === 'hot') v = post.hotScore ?? 0;
  return Buffer.from(JSON.stringify({ v, id: post._id.toString() })).toString('base64url');
}

// Strictly decode incoming cursor, returning 400 on malformed input
function decodeCursor(cursorStr) {
  if (!cursorStr) return null;
  if (typeof cursorStr !== 'string') {
    const err = new Error('Invalid cursor format: must be string');
    err.status = 400;
    throw err;
  }

  // 1. Check if raw 24-character hexadecimal ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(cursorStr) && mongoose.Types.ObjectId.isValid(cursorStr)) {
    return { id: cursorStr, rawId: true };
  }

  // 2. Validate base64 / base64url characters
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(cursorStr)) {
    const err = new Error('Invalid cursor format: invalid encoding');
    err.status = 400;
    throw err;
  }

  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.id || parsed.v === undefined) {
      const err = new Error('Malformed cursor payload structure: missing id or sort value');
      err.status = 400;
      throw err;
    }
    if (!/^[0-9a-fA-F]{24}$/.test(parsed.id) || !mongoose.Types.ObjectId.isValid(parsed.id)) {
      const err = new Error('Invalid cursor id format');
      err.status = 400;
      throw err;
    }
    return parsed;
  } catch (parseErr) {
    if (parseErr.status === 400) throw parseErr;
    const err = new Error('Invalid cursor format: failed to decode cursor payload');
    err.status = 400;
    throw err;
  }
}

// Send cached JSON response with weak ETag and stale-while-revalidate (for anonymous callers)
function sendCachedFeedResponse(req, res, responseBody) {
  // If request has Authorization header, it is an authenticated request
  // (Middleware ensures Cache-Control: no-store for auth requests)
  if (req.headers.authorization) {
    return res.json(responseBody);
  }

  const bodyString = JSON.stringify(responseBody);
  const hash = crypto.createHash('md5').update(bodyString).digest('hex');
  const etag = `W/"${hash}"`;

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

  const ifNoneMatch = req.headers['if-none-match'];
  if (
    ifNoneMatch &&
    (ifNoneMatch === etag ||
      ifNoneMatch === hash ||
      ifNoneMatch === `"${hash}"` ||
      ifNoneMatch === `W/"${hash}"`)
  ) {
    return res.status(304).end();
  }

  return res.type('application/json').send(bodyString);
}

// Build query filter with cursor pagination for sort=new|hot|top
async function buildFeedFilter({ baseFilter, sort, cursorStr, pageNum, limitNum, user = null }) {
  const filter = { ...baseFilter };
  applyShadowBanFilter(filter, user);
  let sortObj = { createdAt: -1, _id: -1 };

  if (sort === 'top') {
    sortObj = { 'meter.score': -1, _id: -1 };
  } else if (sort === 'hot') {
    sortObj = { hotScore: -1, _id: -1 };
  }

  if (cursorStr) {
    const decoded = decodeCursor(cursorStr);
    if (decoded) {
      if (decoded.rawId) {
        // Fallback: look up document by raw ID to resolve its sort key
        const pivot = await Post.findById(decoded.id).select('createdAt meter hotScore').lean();
        if (pivot) {
          if (sort === 'top') {
            const v = pivot.meter?.score ?? 0;
            filter.$or = mongoose.trusted([
              { 'meter.score': { $lt: v } },
              { 'meter.score': v, _id: { $lt: pivot._id } },
            ]);
          } else if (sort === 'hot') {
            const v = pivot.hotScore ?? 0;
            filter.$or = mongoose.trusted([
              { hotScore: { $lt: v } },
              { hotScore: v, _id: { $lt: pivot._id } },
            ]);
          } else {
            const v = pivot.createdAt;
            filter.$or = mongoose.trusted([
              { createdAt: { $lt: new Date(v) } },
              { createdAt: new Date(v), _id: { $lt: pivot._id } },
            ]);
          }
        }
      } else {
        const { v, id } = decoded;
        const objId = new mongoose.Types.ObjectId(id);
        if (sort === 'top') {
          filter.$or = mongoose.trusted([
            { 'meter.score': { $lt: Number(v) } },
            { 'meter.score': Number(v), _id: { $lt: objId } },
          ]);
        } else if (sort === 'hot') {
          filter.$or = mongoose.trusted([
            { hotScore: { $lt: Number(v) } },
            { hotScore: Number(v), _id: { $lt: objId } },
          ]);
        } else {
          filter.$or = mongoose.trusted([
            { createdAt: { $lt: new Date(v) } },
            { createdAt: new Date(v), _id: { $lt: objId } },
          ]);
        }
      }
    }
  }

  return { filter, sortObj };
}

// GET /api/v1/feed/home - Home feed (country-tier highlights and trending community spots)
router.get('/home', async (req, res, next) => {
  try {
    const limitNum = Math.floor(Math.min(Math.max(Number(req.query.limit) || 20, 1), 50));
    const sort = req.query.sort || 'hot';

    let sortObj = { hotScore: -1, _id: -1 };
    if (sort === 'top') sortObj = { 'meter.score': -1, _id: -1 };
    if (sort === 'new') sortObj = { createdAt: -1, _id: -1 };

    // Fetch country-tier spots for home digest, applying shadow-ban privacy
    const homeFilter = applyShadowBanFilter({ removed: { $ne: true }, tier: 'country' }, req.user);
    let docs = await Post.find(homeFilter, FEED_PROJECTION)
      .sort(sortObj)
      .limit(limitNum)
      .populate('authorId', 'username avatarUrl badges')
      .lean();

    // Fallback to top overall spots if few country tier spots exist
    if (docs.length < 5) {
      const fallbackFilter = applyShadowBanFilter({ removed: { $ne: true } }, req.user);
      docs = await Post.find(fallbackFilter, FEED_PROJECTION)
        .sort(sortObj)
        .limit(limitNum)
        .populate('authorId', 'username avatarUrl badges')
        .lean();
    }

    const posts = docs.map((doc) => serializePost(doc));

    const responseBody = {
      feedType: 'home',
      sort,
      count: posts.length,
      posts,
    };

    return sendCachedFeedResponse(req, res, responseBody);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/feed/city - Filtered city feed with sort=new|hot|top
router.get(
  '/city',
  validateQuery(feedValidators.cityFeedQuerySchema),
  async (req, res, next) => {
    try {
      const {
        city,
        cityKey,
        country,
        countryCode,
        sort = 'new',
        limit = 20,
        cursor,
        page,
      } = req.query;

      const rawCity = cityKey || city;
      const canonicalCityKey = toCityKey(rawCity);

      const rawCountry = countryCode || country;
      const resolvedCountry = resolveCountry(rawCountry);
      const canonicalCountryCode = resolvedCountry ? resolvedCountry.code : String(rawCountry).trim().toUpperCase();

      if (!canonicalCityKey || !canonicalCountryCode) {
        return res.status(400).json(
          formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Valid city and country are required')
        );
      }

      const limitNum = Math.floor(Math.min(Math.max(Number(limit) || 20, 1), 50));
      const pageNum = page ? Math.floor(Math.max(Number(page) || 1, 1)) : null;

      const baseFilter = {
        removed: { $ne: true },
        'place.cityKey': canonicalCityKey,
        'place.countryCode': canonicalCountryCode,
      };

      const { filter, sortObj } = await buildFeedFilter({
        baseFilter,
        sort,
        cursorStr: cursor,
        pageNum,
        limitNum,
        user: req.user,
      });

      let query = Post.find(filter, FEED_PROJECTION)
        .sort(sortObj)
        .limit(limitNum + 1)
        .populate('authorId', 'username avatarUrl badges')
        .lean();

      if (!cursor && pageNum && pageNum > 1) {
        query = query.skip((pageNum - 1) * limitNum);
      }

      const rawDocs = await query;
      const hasMore = rawDocs.length > limitNum;
      const docs = hasMore ? rawDocs.slice(0, limitNum) : rawDocs;
      const nextCursor = hasMore && docs.length > 0 ? encodeCursor(sort, docs[docs.length - 1]) : null;

      const posts = docs.map((doc) => serializePost(doc));

      const responseBody = {
        cityKey: canonicalCityKey,
        countryCode: canonicalCountryCode,
        sort,
        count: posts.length,
        hasMore,
        nextCursor,
        posts,
      };

      return sendCachedFeedResponse(req, res, responseBody);
    } catch (err) {
      if (err.status === 400 || err.statusCode === 400) {
        return res.status(400).json(
          formatErrorResponse(
            err.code || ErrorCodes.VALIDATION_FAILED,
            err.message || 'Invalid cursor format'
          )
        );
      }
      next(err);
    }
  }
);

// GET /api/v1/feed/country - Country tier feed (tier='country' & countryCode)
router.get(
  '/country',
  validateQuery(feedValidators.countryFeedQuerySchema),
  async (req, res, next) => {
    try {
      const {
        country,
        countryCode,
        sort = 'new',
        limit = 20,
        cursor,
        page,
      } = req.query;

      const rawCountry = countryCode || country;
      const resolvedCountry = resolveCountry(rawCountry);
      const canonicalCountryCode = resolvedCountry ? resolvedCountry.code : String(rawCountry).trim().toUpperCase();

      if (!canonicalCountryCode) {
        return res.status(400).json(
          formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Valid country is required')
        );
      }

      const limitNum = Math.floor(Math.min(Math.max(Number(limit) || 20, 1), 50));
      const pageNum = page ? Math.floor(Math.max(Number(page) || 1, 1)) : null;

      const baseFilter = {
        removed: { $ne: true },
        tier: 'country',
        'place.countryCode': canonicalCountryCode,
      };

      const { filter, sortObj } = await buildFeedFilter({
        baseFilter,
        sort,
        cursorStr: cursor,
        pageNum,
        limitNum,
        user: req.user,
      });

      let query = Post.find(filter, FEED_PROJECTION)
        .sort(sortObj)
        .limit(limitNum + 1)
        .populate('authorId', 'username avatarUrl badges')
        .lean();

      if (!cursor && pageNum && pageNum > 1) {
        query = query.skip((pageNum - 1) * limitNum);
      }

      const rawDocs = await query;
      const hasMore = rawDocs.length > limitNum;
      const docs = hasMore ? rawDocs.slice(0, limitNum) : rawDocs;
      const nextCursor = hasMore && docs.length > 0 ? encodeCursor(sort, docs[docs.length - 1]) : null;

      const posts = docs.map((doc) => serializePost(doc));

      const responseBody = {
        countryCode: canonicalCountryCode,
        tier: 'country',
        sort,
        count: posts.length,
        hasMore,
        nextCursor,
        posts,
      };

      return sendCachedFeedResponse(req, res, responseBody);
    } catch (err) {
      if (err.status === 400 || err.statusCode === 400) {
        return res.status(400).json(
          formatErrorResponse(
            err.code || ErrorCodes.VALIDATION_FAILED,
            err.message || 'Invalid cursor format'
          )
        );
      }
      next(err);
    }
  }
);

// GET /api/v1/feed/random - Random sample of country tier posts with optional country teleport
router.get(
  '/random',
  validateQuery(feedValidators.randomFeedQuerySchema),
  async (req, res, next) => {
    try {
      const { country, countryCode, limit = 10 } = req.query;

      const limitNum = Math.floor(Math.min(Math.max(Number(limit) || 10, 1), 20));

      const match = {
        removed: { $ne: true },
        tier: 'country',
      };

      if (country || countryCode) {
        const rawCountry = countryCode || country;
        const resolved = resolveCountry(rawCountry);
        match['place.countryCode'] = resolved ? resolved.code : String(rawCountry).trim().toUpperCase();
      }

      // Shadow-ban filter: exclude shadowBannedAuthor unless viewer is author or staff
      const isStaff = req.user && (req.user.role === 'moderator' || req.user.role === 'admin');
      if (!isStaff) {
        if (req.user) {
          match.$or = [
            { shadowBannedAuthor: { $ne: true } },
            { authorId: new mongoose.Types.ObjectId(req.user.id) },
          ];
        } else {
          match.shadowBannedAuthor = { $ne: true };
        }
      }

      const pipeline = [
        { $match: match },
        { $sample: { size: limitNum } },
        {
          $lookup: {
            from: 'users',
            localField: 'authorId',
            foreignField: '_id',
            as: 'author',
            pipeline: [{ $project: { username: 1, avatarUrl: 1, badges: 1 } }],
          },
        },
        { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      ];

      const rawDocs = await Post.aggregate(pipeline);
      const posts = rawDocs.map((doc) => serializePost(doc));

      const responseBody = {
        count: posts.length,
        posts,
      };

      return sendCachedFeedResponse(req, res, responseBody);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
