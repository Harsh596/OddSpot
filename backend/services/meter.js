const { mongoose } = require('../db');
const cfg = require('../config/meter');
const { Post, Vote } = require('../models');

function computeScore(m) {
  const w = cfg.weights;
  const commenters = m.commenters !== undefined ? m.commenters : (m.comments || 0);
  return (
    (m.reactions || 0) * (w.reaction ?? 5) +
    (m.visits || 0) * (w.visit ?? 4) +
    commenters * (w.comment ?? 3) +
    (m.likes || 0) * (w.like ?? 1) +
    (m.dislikes || 0) * (w.dislike ?? -0.5)
  );
}

function getCountryThreshold(countryCode) {
  if (process.env.METER_COUNTRY_THRESHOLD) {
    return Number(process.env.METER_COUNTRY_THRESHOLD);
  }

  if (!countryCode) {
    return cfg.thresholds?.country ?? 50;
  }

  return (async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const posts = await Post.find({
      'place.countryCode': countryCode,
      removed: { $ne: true },
      createdAt: { $gte: fourteenDaysAgo },
    }).select('meter.score');

    if (!posts || posts.length === 0) {
      return cfg.thresholds?.country ?? 50;
    }

    const scores = posts.map((p) => p.meter?.score || 0).sort((a, b) => a - b);
    const p80Index = Math.min(scores.length - 1, Math.floor(scores.length * 0.8));
    const p80 = scores[p80Index];

    return Math.min(500, Math.max(50, Math.round(p80 || 50)));
  })();
}

function calculatePointsToNextTier(score = 0, tier = 'city', countryCode = null) {
  if (tier === 'country') return 0;
  const threshold = process.env.METER_COUNTRY_THRESHOLD
    ? Number(process.env.METER_COUNTRY_THRESHOLD)
    : (cfg.thresholds?.country ?? 50);
  return Math.max(0, threshold - (Number(score) || 0));
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
async function applyDelta(postId, deltaInput, session = null, options = {}) {
  const delta = { ...deltaInput };
  if (delta.comments !== undefined && delta.commenters === undefined) {
    delta.commenters = delta.comments;
  }

  const userId = options?.userId;
  const freezeScoreOpt = Boolean(options?.freezeScore);
  const velocityStatus = trackInteraction(postId, userId);

  const counterUpdates = {};
  for (const [k, v] of Object.entries(delta)) {
    if (k === 'commenters') {
      counterUpdates['meter.commenters'] = {
        $add: [{ $ifNull: ['$meter.commenters', { $ifNull: ['$meter.comments', 0] }] }, v],
      };
    } else {
      counterUpdates[`meter.${k}`] = { $add: [{ $ifNull: [`$meter.${k}`, 0] }, v] };
    }
  }

  const w = cfg.weights;
  const scoreExpr = {
    $add: [
      { $multiply: [{ $ifNull: ['$meter.reactions', 0] }, w.reaction ?? 5] },
      { $multiply: [{ $ifNull: ['$meter.visits', 0] }, w.visit ?? 4] },
      { $multiply: [{ $ifNull: ['$meter.commenters', { $ifNull: ['$meter.comments', 0] }] }, w.comment ?? 3] },
      { $multiply: [{ $ifNull: ['$meter.likes', 0] }, w.like ?? 1] },
      { $multiply: [{ $ifNull: ['$meter.dislikes', 0] }, w.dislike ?? -0.5] },
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

  let countryThreshold = process.env.METER_COUNTRY_THRESHOLD
    ? Number(process.env.METER_COUNTRY_THRESHOLD)
    : cfg.thresholds.country;

  if (!process.env.METER_COUNTRY_THRESHOLD) {
    const postDoc = await Post.findById(postId).select('place.countryCode').session(session);
    if (postDoc?.place?.countryCode) {
      countryThreshold = await getCountryThreshold(postDoc.place.countryCode);
    }
  }

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
    commenters: (postBefore.meter?.commenters ?? postBefore.meter?.comments ?? 0) + (delta.commenters || 0),
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
  label: cfg.label || 'Oddometer',
  getCountryThreshold,
  calculatePointsToNextTier,
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

