// backend/scripts/reconcileCounters.js
// Recounts likes, dislikes, and non-removed comments from the source collections
// and reconciles drift in post.meter and post.tier.
//
// Usage:
//   node scripts/reconcileCounters.js          (Dry run by default)
//   node scripts/reconcileCounters.js --apply  (Commit fixes to MongoDB)

require('dotenv').config();
const { connect, disconnect } = require('../db');
const { Post, Vote, Comment } = require('../models');
const cfg = require('../config/meter');

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
    const [actualLikes, actualDislikes, actualComments] = await Promise.all([
      Vote.countDocuments({ postId: post._id, value: 1 }),
      Vote.countDocuments({ postId: post._id, value: -1 }),
      Comment.countDocuments({ postId: post._id, removed: { $ne: true } }),
    ]);

    const reactions = post.meter?.reactions || 0;
    const visits = post.meter?.visits || 0;

    const expectedScore =
      reactions * cfg.weights.reaction +
      visits * cfg.weights.visit +
      actualComments * cfg.weights.comment +
      actualLikes * cfg.weights.like +
      actualDislikes * cfg.weights.dislike;

    // Preserve tier ratchet: if already country, stay country; transition if score crosses threshold
    let expectedTier = post.tier || 'city';
    if (expectedTier !== 'country' && expectedScore >= countryThreshold) {
      expectedTier = 'country';
    }

    const currentLikes = post.meter?.likes || 0;
    const currentDislikes = post.meter?.dislikes || 0;
    const currentComments = post.meter?.comments || 0;
    const currentScore = post.meter?.score || 0;
    const currentTier = post.tier || 'city';

    const hasDrift =
      currentLikes !== actualLikes ||
      currentDislikes !== actualDislikes ||
      currentComments !== actualComments ||
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
        score: { current: currentScore, expected: expectedScore },
        tier: { current: currentTier, expected: expectedTier },
      };
      driftDetails.push(detail);

      log(
        `[DRIFT] Post ${post._id} ("${post.title}"):` +
          ` likes: ${currentLikes} -> ${actualLikes},` +
          ` dislikes: ${currentDislikes} -> ${actualDislikes},` +
          ` comments: ${currentComments} -> ${actualComments},` +
          ` score: ${currentScore} -> ${expectedScore},` +
          ` tier: ${currentTier} -> ${expectedTier}`
      );

      if (apply) {
        await Post.updateOne(
          { _id: post._id },
          {
            $set: {
              'meter.likes': actualLikes,
              'meter.dislikes': actualDislikes,
              'meter.comments': actualComments,
              'meter.score': expectedScore,
              tier: expectedTier,
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

module.exports = { reconcileCounters };
