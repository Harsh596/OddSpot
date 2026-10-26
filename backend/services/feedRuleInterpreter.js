// backend/services/feedRuleInterpreter.js
// Whitelisted, eval-free Home Feed Rule Interpreter (P14).
// STRICTLY rejects eval, Function, vm, and dynamic operators ($where, $function, etc.).

const { z } = require('zod');
const mongoose = require('mongoose');
const { Post } = require('../models');

// 1. Strict Zod Schema for Feed Rules
const boostTagSchema = z
  .object({
    tag: z.string().trim().min(1).max(30),
    multiplier: z.number().min(0.5).max(3.0),
  })
  .strict();

const feedRuleSchema = z
  .object({
    version: z.literal(1, {
      errorMap: () => ({ message: 'version must be 1' }),
    }),
    maxDistanceKm: z.number().min(1).max(50).optional(),
    includeTags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    excludeTags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
    excludeWarnings: z
      .array(
        z.enum(['private_property', 'walking_required', 'unsafe_night', 'other'])
      )
      .max(4)
      .optional(),
    onlyTypes: z.array(z.enum(['find', 'identify'])).max(2).optional(),
    onlyVerifiedVisited: z.boolean().optional(),
    minScore: z.number().min(-50).max(500).optional(),
    sortBy: z.enum(['hot', 'new', 'top', 'distance']).optional().default('hot'),
    boostTags: z.array(boostTagSchema).max(5).optional(),
  })
  .strict(); // STRICTLY reject unknown rule keys!

/**
 * Validates feed rules against strict schema and scans for forbidden dynamic code execution tokens.
 */
function validateFeedRules(rules) {
  if (!rules || typeof rules !== 'object') {
    throw new Error('Rules must be a JSON object');
  }

  // Pre-scan JSON serialization for forbidden code execution tokens
  const serialized = JSON.stringify(rules);
  if (/\b(eval|Function|vm|\$where|\$function|\$accumulator)\b/i.test(serialized)) {
    throw new Error('Forbidden dynamic operator or code execution token detected');
  }

  // Strict Zod parsing
  return feedRuleSchema.parse(rules);
}

/**
 * Calculates boost multiplier for a post based on whitelisted boost tags.
 */
function calculateBoostMultiplier(postTags = [], boostTags = []) {
  if (!postTags.length || !boostTags.length) return 1.0;
  let mult = 1.0;
  for (const b of boostTags) {
    if (postTags.includes(b.tag)) {
      if (b.multiplier > mult) {
        mult = b.multiplier;
      }
    }
  }
  return mult;
}

/**
 * Executes feed query interpreting whitelisted rules without any eval or dynamic code execution.
 */
async function interpretFeedRules({
  user,
  rules: rawRules,
  joinedCommunityIds = [],
  query = {},
}) {
  const validatedRules = validateFeedRules(rawRules);
  const limitNum = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

  // 1. Build Base Filter
  const filter = {
    removed: { $ne: true },
  };

  // If user belongs to communities, filter strictly to joined communities
  if (joinedCommunityIds.length > 0) {
    filter.communityId = {
      $in: joinedCommunityIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  // Shadow-ban filter
  const isStaff = user && (user.role === 'moderator' || user.role === 'admin');
  if (!isStaff) {
    if (user) {
      filter.$or = [
        { shadowBannedAuthor: { $ne: true } },
        { authorId: new mongoose.Types.ObjectId(user.id) },
      ];
    } else {
      filter.shadowBannedAuthor = { $ne: true };
    }
  }

  // 2. Tag Inclusions & Exclusions
  if (validatedRules.includeTags && validatedRules.includeTags.length > 0) {
    filter.tags = { $in: validatedRules.includeTags };
  }

  if (validatedRules.excludeTags && validatedRules.excludeTags.length > 0) {
    if (filter.tags) {
      filter.tags.$nin = validatedRules.excludeTags;
    } else {
      filter.tags = { $nin: validatedRules.excludeTags };
    }
  }

  // 3. Warning Exclusions
  if (validatedRules.excludeWarnings && validatedRules.excludeWarnings.length > 0) {
    filter.warnings = { $nin: validatedRules.excludeWarnings };
  }

  // 4. Type Filter
  if (validatedRules.onlyTypes && validatedRules.onlyTypes.length > 0) {
    filter.type = { $in: validatedRules.onlyTypes };
  }

  // 5. Verified Visited Spot Filter
  if (validatedRules.onlyVerifiedVisited === true) {
    filter['meter.visits'] = { $gt: 0 };
  }

  // 6. Minimum Meter Score
  if (validatedRules.minScore !== undefined) {
    filter['meter.score'] = { $gte: validatedRules.minScore };
  }

  // 7. Cursor pagination
  if (query.cursor) {
    try {
      const decodedId = /^[0-9a-fA-F]{24}$/.test(query.cursor)
        ? query.cursor
        : JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')).id;
      if (decodedId && mongoose.Types.ObjectId.isValid(decodedId)) {
        filter._id = { $lt: new mongoose.Types.ObjectId(decodedId) };
      }
    } catch {
      // Ignore cursor parse errors
    }
  }

  // 8. Sorting & Boost Evaluation
  const sortBy = validatedRules.sortBy || 'hot';
  let sortObj = { hotScore: -1, _id: -1 };
  if (sortBy === 'new') {
    sortObj = { createdAt: -1, _id: -1 };
  } else if (sortBy === 'top') {
    sortObj = { 'meter.score': -1, _id: -1 };
  }

  const rawDocs = await Post.find(filter)
    .sort(sortObj)
    .limit(limitNum * 2) // Fetch extra buffer for boost re-ranking
    .populate('authorId', 'username avatarUrl badges')
    .lean();

  // 9. Apply boostTags in-memory
  let processedDocs = rawDocs;
  if (validatedRules.boostTags && validatedRules.boostTags.length > 0) {
    processedDocs = rawDocs.map((post) => {
      const boost = calculateBoostMultiplier(post.tags, validatedRules.boostTags);
      const baseScore =
        sortBy === 'top' ? post.meter?.score ?? 0 : post.hotScore ?? 0;
      return {
        ...post,
        _boostedScore: baseScore * boost,
      };
    });

    processedDocs.sort((a, b) => {
      if (b._boostedScore !== a._boostedScore) {
        return b._boostedScore - a._boostedScore;
      }
      return b._id.toString().localeCompare(a._id.toString());
    });
  }

  const hasMore = processedDocs.length > limitNum;
  const posts = hasMore ? processedDocs.slice(0, limitNum) : processedDocs;
  const nextCursor =
    hasMore && posts.length > 0 ? posts[posts.length - 1]._id.toString() : null;

  return {
    posts,
    nextCursor,
    hasMore,
  };
}

module.exports = {
  feedRuleSchema,
  validateFeedRules,
  calculateBoostMultiplier,
  interpretFeedRules,
};
