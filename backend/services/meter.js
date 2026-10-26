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

// Atomically bump counters, recalculate score, and update tier in a single update pipeline.
// Supports passing an active Mongoose session for multi-document transaction atomicity.
async function applyDelta(postId, delta, session = null) {
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
      { $set: { 'meter.score': scoreExpr } },
      { $set: { tier: tierExpr } },
    ],
    updateOpts
  );
  if (!postBefore) return null;

  const newMeter = {
    likes: (postBefore.meter?.likes || 0) + (delta.likes || 0),
    dislikes: (postBefore.meter?.dislikes || 0) + (delta.dislikes || 0),
    comments: (postBefore.meter?.comments || 0) + (delta.comments || 0),
    visits: (postBefore.meter?.visits || 0) + (delta.visits || 0),
    reactions: (postBefore.meter?.reactions || 0) + (delta.reactions || 0),
  };
  const newScore = computeScore(newMeter);
  newMeter.score = newScore;

  const wasCity = postBefore.tier === 'city' || !postBefore.tier;
  const isCountry = postBefore.tier === 'country' || newScore >= countryThreshold;
  const newTier = isCountry ? 'country' : 'city';
  const tieredUp = wasCity && newScore >= countryThreshold;

  return {
    score: newScore,
    tieredUp,
    meter: newMeter,
    tier: newTier,
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

      const delta = {};
      delta[value === 1 ? 'likes' : 'dislikes'] = 1;
      delta[value === 1 ? 'dislikes' : 'likes'] = -1;
      return await meter.applyDelta(postId, delta, session);
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

    const delta = {};
    delta[value === 1 ? 'likes' : 'dislikes'] = 1;
    return await meter.applyDelta(postId, delta, session);
  }, actualSession);
}

const meter = { computeScore, decayedScore, applyDelta, castVote };
module.exports = meter;

