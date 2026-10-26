const { mongoose } = require('../db');
const cfg = require('../config/meter');
const { Post, Vote } = require('../models');

function computeScore(m) {
  const w = cfg.weights;
  return (
    (m.reactions || 0) * w.reaction +
    (m.visits || 0) * w.visit +
    (m.comments || 0) * w.comment +
    (m.likes || 0) * w.like +
    (m.dislikes || 0) * w.dislike
  );
}

// Ranking-time decay. Stored score stays raw; apply this when sorting.
function decayedScore(post, now = Date.now()) {
  const ageH = (now - new Date(post.createdAt).getTime()) / 36e5;
  return post.meter.score * Math.pow(0.5, ageH / cfg.decayHalfLifeHours);
}

// Calculate hot score: combines logarithmic engagement score with creation timestamp
function calculateHotScore(score = 0, createdAt = new Date()) {
  const s = Number(score) || 0;
  const order = Math.log10(Math.max(Math.abs(s), 1));
  const sign = s > 0 ? 1 : s < 0 ? -1 : 0;
  const t = new Date(createdAt).getTime() / 1000;
  // Epoch: 1700000000 (Nov 2023), 45000 seconds (12.5 hours) per decade
  const seconds = t - 1700000000;
  return Number((sign * order + seconds / 45000).toFixed(7));
}

// Interaction velocity tracking per post: Map<postIdString, Array<{ userId, timestamp }>>
const postInteractions = new Map();

function trackInteraction(postId, userId) {
  if (!postId) return { isSurge: false, count: 0, uniqueUsers: 0 };
  const now = Date.now();
  const windowMs = 60000; // 60 seconds sliding window
  const key = postId.toString();

  const history = (postInteractions.get(key) || []).filter((item) => now - item.timestamp < windowMs);
  history.push({ userId: userId ? userId.toString() : 'anon', timestamp: now });
  postInteractions.set(key, history);

  const uniqueUsers = new Set(history.map((h) => h.userId));
  // Surge triggers if >= 10 interactions from distinct Sybil accounts within 60s
  const isSurge = uniqueUsers.size >= 10;
  return { isSurge, count: history.length, uniqueUsers: uniqueUsers.size };
}

function resetVelocityTracking(postId) {
  if (postId) {
    postInteractions.delete(postId.toString());
  } else {
    postInteractions.clear();
  }
}

// Atomically bump counters, recalculate score, and update tier in a single update pipeline.
// Supports passing an active Mongoose session for multi-document transaction atomicity.
async function applyDelta(postId, delta, session = null, options = {}) {
  const userId = options?.userId;
  const freezeScoreOpt = Boolean(options?.freezeScore);
  const velocityStatus = trackInteraction(postId, userId);

  const counterUpdates = {};
  for (const [k, v] of Object.entries(delta)) {
    counterUpdates[`meter.${k}`] = { $add: [{ $ifNull: [`$meter.${k}`, 0] }, v] };
  }

  const w = cfg.weights;
  const scoreExpr = {
    $add: [
      { $multiply: [{ $ifNull: ['$meter.reactions', 0] }, w.reaction] },
      { $multiply: [{ $ifNull: ['$meter.visits', 0] }, w.visit] },
      { $multiply: [{ $ifNull: ['$meter.comments', 0] }, w.comment] },
      { $multiply: [{ $ifNull: ['$meter.likes', 0] }, w.like] },
      { $multiply: [{ $ifNull: ['$meter.dislikes', 0] }, w.dislike] },
    ],
  };

  const effectiveScoreExpr = freezeScoreOpt
    ? { $ifNull: ['$meter.score', 0] }
    : {
        $cond: {
          if: { $eq: ['$velocityFrozen', true] },
          then: { $ifNull: ['$meter.score', 0] },
          else: scoreExpr,
        },
      };

  const countryThreshold = process.env.METER_COUNTRY_THRESHOLD
    ? Number(process.env.METER_COUNTRY_THRESHOLD)
    : cfg.thresholds.country;

  // Tier ratchet: if already 'country', stay 'country'; otherwise transition if score >= threshold
  const tierExpr = {
    $cond: {
      if: { $eq: ['$tier', 'country'] },
      then: 'country',
      else: {
        $cond: {
          if: { $gte: ['$meter.score', countryThreshold] },
          then: 'country',
          else: '$tier',
        },
      },
    },
  };

  const updateOpts = { returnDocument: 'before' };
  if (session) updateOpts.session = session;

  // Single atomic aggregation pipeline update returning document BEFORE modification
  const postBefore = await Post.findOneAndUpdate(
    { _id: postId },
    [
      { $set: { lastEngagedAt: new Date(), ...counterUpdates } },
      { $set: { 'meter.score': effectiveScoreExpr } },
      { $set: { tier: tierExpr } },
    ],
    updateOpts
  );
  if (!postBefore) return null;

  // If newly triggered surge from 10 Sybil accounts, flag post as velocityFrozen and underReview
  if (velocityStatus.isSurge && !postBefore.velocityFrozen) {
    await Post.updateOne(
      { _id: postId },
      { $set: { velocityFrozen: true, underReview: true } },
      updateOpts.session ? { session: updateOpts.session } : {}
    );
  }

  const isFrozen = postBefore.velocityFrozen || velocityStatus.isSurge || freezeScoreOpt;
  const newMeter = {
    likes: (postBefore.meter?.likes || 0) + (delta.likes || 0),
    dislikes: (postBefore.meter?.dislikes || 0) + (delta.dislikes || 0),
    comments: (postBefore.meter?.comments || 0) + (delta.comments || 0),
    visits: (postBefore.meter?.visits || 0) + (delta.visits || 0),
    reactions: (postBefore.meter?.reactions || 0) + (delta.reactions || 0),
  };
  const newScore = isFrozen ? (postBefore.meter?.score ?? 0) : computeScore(newMeter);
  newMeter.score = newScore;

  const wasCity = postBefore.tier === 'city' || !postBefore.tier;
  const isCountry = postBefore.tier === 'country' || newScore >= countryThreshold;
  const newTier = isCountry ? 'country' : 'city';
  const tieredUp = wasCity && newScore >= countryThreshold;

  const newHotScore = calculateHotScore(newScore, postBefore.createdAt);
  await Post.updateOne(
    { _id: postId },
    { $set: { hotScore: newHotScore } },
    updateOpts.session ? { session: updateOpts.session } : {}
  );

  if (tieredUp && postBefore.authorId) {
    try {
      const { notifyTierUp } = require('./notifications');
      await notifyTierUp({
        post: {
          _id: postId,
          authorId: postBefore.authorId,
          tier: newTier,
          meter: newMeter,
        },
      });
    } catch (e) {
      console.error('Failed to dispatch tier_up notification:', e.message);
    }
  }

  return {
    score: newScore,
    tieredUp,
    meter: newMeter,
    tier: newTier,
    hotScore: newHotScore,
    velocityFrozen: isFrozen,
  };
}

const { withTransaction } = require('../utils/withTransaction');

// Atomic vote casting via MongoDB Transactions.
// Guarantees vote record and post meter counters remain strictly consistent even under failure.
async function castVote(userId, postId, value, externalSession = null, options = {}) {
  let actualSession = externalSession;
  let opts = options;
  if (
    externalSession &&
    typeof externalSession === 'object' &&
    !externalSession.withTransaction &&
    externalSession._failBeforeApplyDelta !== undefined
  ) {
    opts = externalSession;
    actualSession = null;
  }

  return await withTransaction(async (session) => {
    // 1. Verify target post exists and is not removed
    let postQuery = Post.findOne({ _id: postId, removed: { $ne: true } }).select('_id authorId');
    if (session) postQuery = postQuery.session(session);
    const post = await postQuery;
    if (!post) {
      const err = new Error('Post not found');
      err.statusCode = 404;
      throw err;
    }

    // K6: Forbid self-voting
    if (post.authorId && post.authorId.toString() === userId.toString()) {
      const err = new Error('Authors cannot vote on their own post');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    // 2. Check existing vote
    let voteQuery = Vote.findOne({ userId, postId });
    if (session) voteQuery = voteQuery.session(session);
    const existing = await voteQuery;

    if (existing) {
      if (existing.value === value) {
        return null; // Idempotent: already voted this value
      }

      await Vote.updateOne({ _id: existing._id }, { $set: { value } }, { session });

      // Task P2-T1: Support _failBeforeApplyDelta test injection hook in NODE_ENV=test
      if (
        process.env.NODE_ENV === 'test' &&
        (opts._failBeforeApplyDelta || (actualSession && actualSession._failBeforeApplyDelta))
      ) {
        const err = new Error('SIMULATED_TRANSACTION_FAILURE_BEFORE_APPLY_DELTA');
        err.code = 'SIMULATED_FAILURE';
        throw err;
      }

      if (opts.shadowBanned) {
        const currentPost = await Post.findById(postId).select('meter tier').session(session);
        return {
          score: currentPost ? currentPost.meter.score : 0,
          meter: currentPost ? currentPost.meter : {},
          tier: currentPost ? currentPost.tier : 'city',
          tieredUp: false,
        };
      }

      const delta = {};
      delta[value === 1 ? 'likes' : 'dislikes'] = 1;
      delta[value === 1 ? 'dislikes' : 'likes'] = -1;
      return await meter.applyDelta(postId, delta, session, { userId, ...opts });
    }

    // 3. Not existing: create vote
    await Vote.create([{ userId, postId, value }], { session });

    // Task P2-T1: Support _failBeforeApplyDelta test injection hook in NODE_ENV=test
    if (
      process.env.NODE_ENV === 'test' &&
      (opts._failBeforeApplyDelta || (actualSession && actualSession._failBeforeApplyDelta))
    ) {
      const err = new Error('SIMULATED_TRANSACTION_FAILURE_BEFORE_APPLY_DELTA');
      err.code = 'SIMULATED_FAILURE';
      throw err;
    }

    if (opts.shadowBanned) {
      const currentPost = await Post.findById(postId).select('meter tier').session(session);
      return {
        score: currentPost ? currentPost.meter.score : 0,
        meter: currentPost ? currentPost.meter : {},
        tier: currentPost ? currentPost.tier : 'city',
        tieredUp: false,
      };
    }

    const delta = {};
    delta[value === 1 ? 'likes' : 'dislikes'] = 1;
    return await meter.applyDelta(postId, delta, session, { userId, ...opts });
  }, actualSession);
}

const meter = {
  computeScore,
  decayedScore,
  calculateHotScore,
  applyDelta,
  castVote,
  trackInteraction,
  recordInteraction: trackInteraction,
  resetVelocityTracking,
};
module.exports = meter;

