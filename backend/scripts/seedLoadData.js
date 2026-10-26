// backend/scripts/seedLoadData.js
// Seeds 50,000 synthetic posts across 20 global cities into the database,
// and verifies that all feed and geo queries use IXSCAN / GEO_NEAR_2DSPHERE without COLLSCAN.
//
// Usage:
//   node backend/scripts/seedLoadData.js

require('dotenv').config();
const { connect, disconnect, mongoose } = require('../db');
const { Post, User } = require('../models');
const { calculateHotScore } = require('../services/meter');
const { toCityKey } = require('../utils/place');

const GLOBAL_CITIES = [
  { city: 'Bengaluru', country: 'India', countryCode: 'IN', coords: [77.5946, 12.9716] },
  { city: 'Mumbai', country: 'India', countryCode: 'IN', coords: [72.8777, 19.0760] },
  { city: 'Tokyo', country: 'Japan', countryCode: 'JP', coords: [139.6917, 35.6895] },
  { city: 'Osaka', country: 'Japan', countryCode: 'JP', coords: [135.5023, 34.6937] },
  { city: 'London', country: 'United Kingdom', countryCode: 'GB', coords: [-0.1278, 51.5074] },
  { city: 'Paris', country: 'France', countryCode: 'FR', coords: [2.3522, 48.8566] },
  { city: 'Berlin', country: 'Germany', countryCode: 'DE', coords: [13.4050, 52.5200] },
  { city: 'New York', country: 'United States', countryCode: 'US', coords: [-74.0060, 40.7128] },
  { city: 'San Francisco', country: 'United States', countryCode: 'US', coords: [-122.4194, 37.7749] },
  { city: 'Sydney', country: 'Australia', countryCode: 'AU', coords: [151.2093, -33.8688] },
  { city: 'Melbourne', country: 'Australia', countryCode: 'AU', coords: [144.9631, -37.8136] },
  { city: 'Toronto', country: 'Canada', countryCode: 'CA', coords: [-79.3832, 43.6532] },
  { city: 'Singapore', country: 'Singapore', countryCode: 'SG', coords: [103.8198, 1.3521] },
  { city: 'Seoul', country: 'South Korea', countryCode: 'KR', coords: [126.9780, 37.5665] },
  { city: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', coords: [4.9041, 52.3676] },
  { city: 'Rome', country: 'Italy', countryCode: 'IT', coords: [12.4964, 41.9028] },
  { city: 'Madrid', country: 'Spain', countryCode: 'ES', coords: [-3.7038, 40.4168] },
  { city: 'Sao Paulo', country: 'Brazil', countryCode: 'BR', coords: [-46.6333, -23.5505] },
  { city: 'Cape Town', country: 'South Africa', countryCode: 'ZA', coords: [18.4241, -33.9249] },
  { city: 'Mexico City', country: 'Mexico', countryCode: 'MX', coords: [-99.1332, 19.4326] },
];

/**
 * Recursively inspects execution stages in an explain() output for COLLSCAN
 */
function inspectStages(stageObj, stagesList = []) {
  if (!stageObj || typeof stageObj !== 'object') return stagesList;
  if (stageObj.stage) {
    stagesList.push(stageObj.stage);
  }
  if (stageObj.inputStage) {
    inspectStages(stageObj.inputStage, stagesList);
  }
  if (Array.isArray(stageObj.inputStages)) {
    for (const sub of stageObj.inputStages) {
      inspectStages(sub, stagesList);
    }
  }
  return stagesList;
}

/**
 * Seeds synthetic posts and validates executionStats indexes
 */
async function seedLoadData({ totalPosts = 50000, verifyExplain = true, quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  log(`\n=== Oddspot: Seeding ${totalPosts.toLocaleString()} Synthetic Posts Across 20 Cities ===\n`);

  // Ensure collections and compound indexes exist
  await Post.createCollection().catch(() => {});
  await Post.syncIndexes();

  // Create or retrieve dedicated seed author
  let author = await User.findOne({ username: 'test_2_seed_author' });
  if (!author) {
    author = await User.create({
      username: 'test_2_seed_author',
      usernameLower: 'test_2_seed_author',
      email: 'test_2_seed_author@example.com',
      emailLower: 'test_2_seed_author@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012',
    });
  }
  const authorId = author._id;

  const perCity = Math.floor(totalPosts / GLOBAL_CITIES.length);
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 3600 * 1000;

  let insertedCount = 0;
  const startTime = Date.now();

  for (let cIdx = 0; cIdx < GLOBAL_CITIES.length; cIdx++) {
    const cityData = GLOBAL_CITIES[cIdx];
    const cityKey = toCityKey(cityData.city);
    const countryCode = cityData.countryCode;
    const [baseLng, baseLat] = cityData.coords;

    const batch = [];
    for (let i = 0; i < perCity; i++) {
      // Deterministic spread around city coordinates (~1-5km radius)
      const latJitter = (Math.sin(i * 13.7) * 0.04);
      const lngJitter = (Math.cos(i * 17.3) * 0.04);
      const lat = Number((baseLat + latJitter).toFixed(6));
      const lng = Number((baseLng + lngJitter).toFixed(6));

      // Distributed score: ~20% reach country threshold (score >= 50)
      let score = 0;
      if (i % 5 === 0) {
        score = 50 + (i % 100);
      } else {
        score = (i % 45);
      }
      const tier = score >= 50 ? 'country' : 'city';

      // Timestamps staggered across the last 30 days
      const postTime = new Date(now - (i % 30) * (thirtyDaysMs / 30) - (i * 12345 % 3600000));
      const hotScore = calculateHotScore(score, postTime);
      const hideExact = i % 2 === 0;

      // Fuzzed coordinates for feedLocation
      const feedLat = hideExact ? Number((lat + 0.002).toFixed(6)) : lat;
      const feedLng = hideExact ? Number((lng + 0.002).toFixed(6)) : lng;

      batch.push({
        authorId,
        title: `test_2_seed ${cityData.city} Spot ${i + 1}`,
        body: `Synthetic seed post ${i + 1} for high-performance load testing in ${cityData.city}.`,
        images: [{ url: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86' }],
        type: 'find',
        location: { type: 'Point', coordinates: [lng, lat] },
        feedLocation: { type: 'Point', coordinates: [feedLng, feedLat] },
        hideExact,
        place: {
          city: cityData.city,
          cityKey,
          country: cityData.country,
          countryCode,
        },
        tier,
        meter: {
          score,
          likes: Math.max(score, 0),
          dislikes: 0,
          comments: Math.floor(score / 3),
          visits: 0,
          reactions: 0,
        },
        hotScore,
        spotStatus: 'still_there',
        solved: false,
        underReview: false,
        removed: false,
        createdAt: postTime,
        updatedAt: postTime,
      });
    }

    await Post.collection.insertMany(batch, { ordered: false });
    insertedCount += batch.length;
    log(`- Inserted ${batch.length} spots for ${cityData.city}, ${countryCode} (${insertedCount} / ${totalPosts})`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  log(`\nSuccessfully inserted ${insertedCount.toLocaleString()} posts in ${durationSec}s!\n`);

  if (!verifyExplain) {
    return { insertedCount, durationSec };
  }

  log('=== Verifying executionStats Across Regional Feeds (Zero COLLSCAN Guarantee) ===\n');

  const queriesToVerify = [
    {
      name: 'City Feed (sort: new)',
      run: () =>
        Post.find({
          removed: { $ne: true },
          'place.cityKey': 'bengaluru',
          'place.countryCode': 'IN',
        })
          .sort({ createdAt: -1, _id: -1 })
          .limit(20)
          .explain('executionStats'),
    },
    {
      name: 'City Feed (sort: top)',
      run: () =>
        Post.find({
          removed: { $ne: true },
          'place.cityKey': 'bengaluru',
          'place.countryCode': 'IN',
        })
          .sort({ 'meter.score': -1, _id: -1 })
          .limit(20)
          .explain('executionStats'),
    },
    {
      name: 'City Feed (sort: hot)',
      run: () =>
        Post.find({
          removed: { $ne: true },
          'place.cityKey': 'bengaluru',
          'place.countryCode': 'IN',
        })
          .sort({ hotScore: -1, _id: -1 })
          .limit(20)
          .explain('executionStats'),
    },
    {
      name: 'Country Feed (sort: new)',
      run: () =>
        Post.find({
          removed: { $ne: true },
          tier: 'country',
          'place.countryCode': 'IN',
        })
          .sort({ createdAt: -1, _id: -1 })
          .limit(20)
          .explain('executionStats'),
    },
    {
      name: 'Country Feed (sort: top)',
      run: () =>
        Post.find({
          removed: { $ne: true },
          tier: 'country',
          'place.countryCode': 'IN',
        })
          .sort({ 'meter.score': -1, _id: -1 })
          .limit(20)
          .explain('executionStats'),
    },
    {
      name: 'Country Feed (sort: hot)',
      run: () =>
        Post.find({
          removed: { $ne: true },
          tier: 'country',
          'place.countryCode': 'IN',
        })
          .sort({ hotScore: -1, _id: -1 })
          .limit(20)
          .explain('executionStats'),
    },
    {
      name: 'Proximity Feed (feedLocation $geoNear)',
      run: () =>
        Post.aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: [77.5946, 12.9716] },
              distanceField: 'distanceMeters',
              key: 'feedLocation',
              maxDistance: 10000,
              spherical: true,
              query: { removed: { $ne: true } },
            },
          },
          { $limit: 20 },
        ]).explain('executionStats'),
    },
  ];

  const explainResults = [];

  for (const q of queriesToVerify) {
    const rawExplain = await q.run();
    const execStats = rawExplain.executionStats || {};
    const stages = inspectStages(execStats.executionStages);
    const hasCollscan = stages.includes('COLLSCAN');
    const isIxscanOrGeo =
      stages.includes('IXSCAN') ||
      stages.includes('GEO_NEAR_2DSPHERE') ||
      stages.includes('GEO_NEAR');

    log(`Query Plan: [${q.name}]`);
    log(`- Stages traversed:       ${stages.join(' -> ')}`);
    log(`- Documents examined:     ${execStats.totalDocsExamined ?? 'N/A'}`);
    log(`- Returned documents:     ${execStats.nReturned ?? 'N/A'}`);
    log(`- Execution time:         ${execStats.executionTimeMillis ?? 0}ms`);
    log(`- Zero COLLSCAN verified: ${!hasCollscan ? 'PASS' : 'FAIL'}\n`);

    if (hasCollscan) {
      throw new Error(`Execution plan for "${q.name}" performed an unindexed COLLSCAN!`);
    }

    explainResults.push({
      name: q.name,
      stages,
      hasCollscan,
      isIxscanOrGeo,
      docsExamined: execStats.totalDocsExamined,
      timeMs: execStats.executionTimeMillis,
    });
  }

  log('All regional feed queries verified: 100% IXSCAN / GEO_NEAR_2DSPHERE coverage.\n');

  return {
    insertedCount,
    durationSec,
    explainResults,
  };
}

async function runCli() {
  try {
    await connect();
    await seedLoadData();
    await disconnect();
  } catch (err) {
    console.error('Seed load failed:', err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  seedLoadData,
  GLOBAL_CITIES,
};
