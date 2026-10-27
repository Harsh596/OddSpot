// backend/scripts/reconcileCounters.js
// Recounts likes, dislikes, and non-removed comments from the source collections
// and reconciles drift in post.meter and post.tier.
//
// Usage:
//   node scripts/reconcileCounters.js          (Dry run by default)
//   node scripts/reconcileCounters.js --apply  (Commit fixes to MongoDB)

require('dotenv').config();
const { connect, disconnect } = require('../db');
const { Post, Vote, Comment, Visit, Reaction, PostCommenter } = require('../models');
const cfg = require('../config/meter');
const { calculateHotScore } = require('../services/meter');

async function reconcileCounters({ apply = false, quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  log(`=== Oddspot Counter Reconciliation (${apply ? 'APPLY MODE' : 'DRY RUN'}) ===\n`);

  const countryThreshold = Number(process.env.METER_COUNTRY_THRESHOLD) || cfg.thresholds.country;

  // Only reconcile active posts (strictly filter removed: { $ne: true })
  const posts = await Post.find({ removed: { $ne: true } });
  log(`Found ${posts.length} active posts to verify.\n`);

  let totalInspected = 0;
  let totalWithDrift = 0;
  let totalFixed = 0;
  const driftDetails = [];

  for (const post of posts) {
    totalInspected++;

    // Recount source truth
    const [actualLikes, actualDislikes, actualComments, actualVisits, actualReactions, activeNonAuthorComments] = await Promise.all([
      Vote.countDocuments({ postId: post._id, value: 1 }),
      Vote.countDocuments({ postId: post._id, value: -1 }),
      Comment.countDocuments({ postId: post._id, removed: { $ne: true } }),
      Visit.countDocuments({ postId: post._id }),
      Reaction.countDocuments({ postId: post._id }),
      Comment.find({
        postId: post._id,
        removed: { $ne: true },
        authorId: { $ne: post.authorId },
      }).select('authorId'),
    ]);

    const distinctCommenterIds = Array.from(
      new Set(activeNonAuthorComments.map((c) => c.authorId.toString()))
    );
    const actualCommenters = distinctCommenterIds.length;

    const expectedScore =
      actualLikes * 1 +
      actualDislikes * -0.5 +
      actualCommenters * 3 +
      actualVisits * 4 +
      actualReactions * 5;

    // Preserve tier ratchet: if already country, stay country; transition if score crosses threshold
    let expectedTier = post.tier || 'city';
    if (expectedTier !== 'country' && expectedScore >= countryThreshold) {
      expectedTier = 'country';
    }

    const currentLikes = post.meter?.likes || 0;
    const currentDislikes = post.meter?.dislikes || 0;
    const currentComments = post.meter?.comments || 0;
    const currentCommenters = post.meter?.commenters || 0;
    const currentVisits = post.meter?.visits || 0;
    const currentReactions = post.meter?.reactions || 0;
    const currentScore = post.meter?.score || 0;
    const currentTier = post.tier || 'city';

    const hasDrift =
      currentLikes !== actualLikes ||
      currentDislikes !== actualDislikes ||
      currentComments !== actualComments ||
      currentCommenters !== actualCommenters ||
      currentVisits !== actualVisits ||
      currentReactions !== actualReactions ||
      currentScore !== expectedScore ||
      currentTier !== expectedTier;

    if (hasDrift) {
      totalWithDrift++;
      const detail = {
        postId: post._id.toString(),
        title: post.title,
        likes: { current: currentLikes, expected: actualLikes },
        dislikes: { current: currentDislikes, expected: actualDislikes },
        comments: { current: currentComments, expected: actualComments },
        commenters: { current: currentCommenters, expected: actualCommenters },
        visits: { current: currentVisits, expected: actualVisits },
        reactions: { current: currentReactions, expected: actualReactions },
        score: { current: currentScore, expected: expectedScore },
        tier: { current: currentTier, expected: expectedTier },
      };
      driftDetails.push(detail);

      log(
        `[DRIFT] Post ${post._id} ("${post.title}"):` +
          ` likes: ${currentLikes} -> ${actualLikes},` +
          ` dislikes: ${currentDislikes} -> ${actualDislikes},` +
          ` comments: ${currentComments} -> ${actualComments},` +
          ` commenters: ${currentCommenters} -> ${actualCommenters},` +
          ` visits: ${currentVisits} -> ${actualVisits},` +
          ` reactions: ${currentReactions} -> ${actualReactions},` +
          ` score: ${currentScore} -> ${expectedScore},` +
          ` tier: ${currentTier} -> ${expectedTier}`
      );

      if (apply) {
        // Sync PostCommenter collection for this post
        await PostCommenter.deleteMany({
          postId: post._id,
          userId: { $nin: distinctCommenterIds },
        });
        for (const commenterId of distinctCommenterIds) {
          await PostCommenter.updateOne(
            { postId: post._id, userId: commenterId },
            { $setOnInsert: { postId: post._id, userId: commenterId, weightApplied: 1, createdAt: new Date() } },
            { upsert: true }
          );
        }

        await Post.updateOne(
          { _id: post._id },
          {
            $set: {
              'meter.likes': actualLikes,
              'meter.dislikes': actualDislikes,
              'meter.comments': actualComments,
              'meter.commenters': actualCommenters,
              'meter.visits': actualVisits,
              'meter.reactions': actualReactions,
              'meter.score': expectedScore,
              tier: expectedTier,
              hotScore: calculateHotScore(expectedScore, post.createdAt),
            },
          }
        );
        totalFixed++;
      }
    }
  }

  log(`\nReconciliation Summary:`);
  log(`- Posts inspected: ${totalInspected}`);
  log(`- Posts with drift: ${totalWithDrift}`);
  if (apply) {
    log(`- Posts corrected: ${totalFixed}`);
  } else {
    log(`- Dry run complete: ${totalWithDrift} post(s) require fixes. Run with --apply to commit.`);
  }

  return {
    totalInspected,
    totalWithDrift,
    totalFixed,
    driftDetails,
  };
}

async function runCli() {
  const apply = process.argv.includes('--apply');
  try {
    await connect();
    await reconcileCounters({ apply });
  } catch (err) {
    console.error('Reconciliation failed:', err);
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  reconcileCounters,
  reconcileAllCounters: reconcileCounters,
};
