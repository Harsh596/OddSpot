// backend/scripts/backfillFeedLocation.js
// Idempotent migration script: backfills feedLocation, place.cityKey, and place.countryCode on all active posts.
//
// Usage:
//   node backend/scripts/backfillFeedLocation.js

require('dotenv').config();
const { connect, disconnect } = require('../db');
const { Post } = require('../models');
const { fuzzLocation } = require('../utils/fuzzLocation');
const { toCityKey, resolveCountry } = require('../utils/place');

async function backfillFeedLocation({ quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  log('=== Oddspot: Backfilling feedLocation and Canonical Place Metadata ===\n');

  const cursor = Post.collection.find({
    $or: [
      { feedLocation: { $exists: false } },
      { 'feedLocation.coordinates': { $exists: false } },
      { 'place.cityKey': { $exists: false } },
      { 'place.countryCode': { $exists: false } },
    ],
  });

  let inspected = 0;
  let updated = 0;

  for await (const post of cursor) {
    inspected++;
    const update = {};

    // 1. Compute feedLocation
    if (
      !post.feedLocation ||
      !Array.isArray(post.feedLocation.coordinates) ||
      post.feedLocation.coordinates.length !== 2
    ) {
      if (post.location && Array.isArray(post.location.coordinates)) {
        if (post.hideExact) {
          const fuzzed = fuzzLocation(post.location.coordinates, post._id.toString());
          update.feedLocation = { type: 'Point', coordinates: fuzzed };
        } else {
          update.feedLocation = { type: 'Point', coordinates: post.location.coordinates };
        }
      }
    }

    // 2. Canonical cityKey
    if (!post.place?.cityKey && post.place?.city) {
      update['place.cityKey'] = toCityKey(post.place.city);
    }

    // 3. ISO countryCode
    if (!post.place?.countryCode && post.place?.country) {
      const resolved = resolveCountry(post.place.country);
      update['place.countryCode'] = resolved ? resolved.code : 'XX';
    }

    if (Object.keys(update).length > 0) {
      await Post.updateOne({ _id: post._id }, { $set: update });
      updated++;
    }
  }

  log(`\nBackfill Complete:`);
  log(`- Posts inspected: ${inspected}`);
  log(`- Posts updated:   ${updated}`);

  return { inspected, updated };
}

async function runCli() {
  try {
    await connect();
    await backfillFeedLocation();
    await disconnect();
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  backfillFeedLocation,
};
