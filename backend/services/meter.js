const cfg = require('../config/meter');
const { Post, Vote } = require('../models');

function computeScore(m) {
  const w = cfg.weights;
  return (
    m.reactions * w.reaction +
    m.visits * w.visit +
    m.comments * w.comment +
    m.likes * w.like +
    m.dislikes * w.dislike
  );
}

// Ranking-time decay. Stored score stays raw; apply this when sorting.
function decayedScore(post, now = Date.now()) {
  const ageH = (now - new Date(post.createdAt).getTime()) / 36e5;
  return post.meter.score * Math.pow(0.5, ageH / cfg.decayHalfLifeHours);
}

// Atomically bump counters, then recompute score and tier.
async function applyDelta(postId, delta) {
  const post = await Post.findByIdAndUpdate(
    postId,
    {
      $inc: Object.fromEntries(Object.entries(delta).map(([k, v]) => [`meter.${k}`, v])),
      $set: { lastEngagedAt: new Date() },
    },
    { new: true }
  );
  if (!post) return null;

  const score = computeScore(post.meter);
  const update = { 'meter.score': score };
  let tieredUp = false;
  if (post.tier === 'city' && score >= cfg.thresholds.country) {
    update.tier = 'country';
    tieredUp = true;
  }
  await Post.updateOne({ _id: postId }, { $set: update });
  return { score, tieredUp };
}

// value: 1 or -1. Handles new vote, change of vote and unchanged vote.
async function castVote(userId, postId, value) {
  const existing = await Vote.findOne({ userId, postId });
  if (existing && existing.value === value) return null;

  const delta = {};
  if (!existing) {
    delta[value === 1 ? 'likes' : 'dislikes'] = 1;
    await Vote.create({ userId, postId, value });
  } else {
    delta[value === 1 ? 'likes' : 'dislikes'] = 1;
    delta[value === 1 ? 'dislikes' : 'likes'] = -1;
    existing.value = value;
    await existing.save();
  }
  return applyDelta(postId, delta);
}

module.exports = { computeScore, decayedScore, applyDelta, castVote };
