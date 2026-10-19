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

  let queryBefore = Post.findById(postId).select('tier');
  if (session) queryBefore = queryBefore.session(session);
  const postBefore = await queryBefore;
  if (!postBefore) return null;

  const updateOpts = { new: true };
  if (session) updateOpts.session = session;

  // Single atomic aggregation pipeline update
  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    [
      { $set: { lastEngagedAt: new Date(), ...counterUpdates } },
      { $set: { 'meter.score': scoreExpr } },
      { $set: { tier: tierExpr } },
    ],
    updateOpts
  );
  if (!updatedPost) return null;

  const tieredUp = postBefore.tier === 'city' && updatedPost.tier === 'country';
  return {
    score: updatedPost.meter.score,
    tieredUp,
    meter: updatedPost.meter,
    tier: updatedPost.tier,
  };
}

// Atomic vote casting via MongoDB Transactions.
// Guarantees vote record and post meter counters remain strictly consistent even under failure.
async function castVote(userId, postId, value, externalSession = null) {
  const executeVote = async (session) => {
    // 1. Verify target post exists and is not removed
    let postQuery = Post.findOne({ _id: postId, removed: { $ne: true } }).select('_id');
    if (session) postQuery = postQuery.session(session);
    const post = await postQuery;
    if (!post) {
      const err = new Error('Post not found');
      err.statusCode = 404;
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

      const updateOpts = session ? { session } : {};
      await Vote.updateOne({ _id: existing._id }, { $set: { value } }, updateOpts);

      const delta = {};
      delta[value === 1 ? 'likes' : 'dislikes'] = 1;
      delta[value === 1 ? 'dislikes' : 'likes'] = -1;
      return await meter.applyDelta(postId, delta, session);
    }

    // 3. Not existing: create vote
    const createOpts = session ? { session } : {};
    await Vote.create([{ userId, postId, value }], createOpts);

    const delta = {};
    delta[value === 1 ? 'likes' : 'dislikes'] = 1;
    return await meter.applyDelta(postId, delta, session);
  };

  if (externalSession) {
    return await executeVote(externalSession);
  }

  const session = await mongoose.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      result = await executeVote(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

const meter = { computeScore, decayedScore, applyDelta, castVote };
module.exports = meter;

