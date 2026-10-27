// backend/test/postAuditFixes.test.js
// Regression test suite for Phase P20 (Post-Build Security & Spec Audit Remediation Fixes 1–7).

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../app');
const { mongoose } = require('../db');
const {
  setupTestDb,
  teardownTestDb,
  clearCollections,
  createTestUser,
  createTestPost,
} = require('./setup');
const models = require('../models');
const { getCountryThreshold } = require('../services/meter');
const { reconcileCounters } = require('../scripts/reconcileCounters');
const { requireAuth, invalidateUserAuthCache } = require('../middleware/auth');
const { generateAccessToken } = require('../services/token');
const { validateFuzzConfig } = require('../utils/fuzzLocation');

describe('P20: Post-Build Security & Spec Audit Remediation', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    invalidateUserAuthCache();
  });

  test('FIX-1: 5 comments by 1 non-author user increment meter.comments to 5 but meter.commenters to 1 and add only +3 to meter.score', async () => {
    const author = await createTestUser();
    const commenter = await createTestUser();

    const postRes = await createTestPost(author.token);
    const postId = postRes.body._id;

    // Submit 5 comments on the post using the same commenter
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${commenter.token}`)
        .send({ body: `Comment number ${i} from single commenter` });
      assert.equal(res.status, 201, `Comment ${i} creation failed: ${JSON.stringify(res.body)}`);
    }

    const updatedPost = await models.Post.findById(postId).lean();
    assert.equal(updatedPost.meter.comments, 5, 'meter.comments should reflect all 5 comments');
    assert.equal(updatedPost.meter.commenters, 1, 'meter.commenters should only be 1 for single non-author user');
    assert.equal(updatedPost.meter.score, 3, 'meter.score should only add +3 (1 unique commenter * 3 points)');

    const postCommenterCount = await models.PostCommenter.countDocuments({ postId, userId: commenter.id });
    assert.equal(postCommenterCount, 1, 'PostCommenter collection should have exactly 1 record for this pair');
  });

  test('FIX-1: Relative country threshold returns 80th percentile of recent 14-day country scores clamped to [50, 500] when METER_COUNTRY_THRESHOLD env is unset', async () => {
    const origEnv = process.env.METER_COUNTRY_THRESHOLD;
    try {
      delete process.env.METER_COUNTRY_THRESHOLD;

      const author = await createTestUser();
      const testCountryCode = 'US';

      // 1. When no posts exist, defaults to 50
      const defaultThreshold = await getCountryThreshold(testCountryCode);
      assert.equal(defaultThreshold, 50, 'Default threshold should be 50 with no posts');

      // 2. Insert 10 posts with scores 10, 20, 30, 40, 50, 60, 70, 80, 90, 100 in country US within last 14 days
      const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      for (let i = 0; i < scores.length; i++) {
        await models.Post.create({
          title: `Audit Post ${i}`,
          description: `Description ${i}`,
          category: 'other',
          authorId: author.id,
          location: { type: 'Point', coordinates: [10 + i * 0.01, 10 + i * 0.01] },
          feedLocation: { type: 'Point', coordinates: [10 + i * 0.01, 10 + i * 0.01] },
          place: { city: 'Seattle', cityKey: 'seattle', country: 'United States', countryCode: testCountryCode },
          meter: { score: scores[i], likes: scores[i], dislikes: 0, comments: 0, commenters: 0, visits: 0, reactions: 0 },
          createdAt: new Date(Date.now() - (i + 1) * 3600 * 1000), // Within last 14 days
          removed: false,
        });
      }

      // p80 of [10..100] is index 8 (score 90)
      const calculatedThreshold = await getCountryThreshold(testCountryCode);
      assert.equal(calculatedThreshold, 90, 'Threshold should be 80th percentile score (90)');

      // 3. Test upper clamp at 500
      await models.Post.updateMany(
        { 'place.countryCode': testCountryCode },
        { $set: { 'meter.score': 850 } }
      );
      const clampedMax = await getCountryThreshold(testCountryCode);
      assert.equal(clampedMax, 500, 'Threshold should clamp to max 500');

      // 4. Test lower clamp at 50
      await models.Post.updateMany(
        { 'place.countryCode': testCountryCode },
        { $set: { 'meter.score': 15 } }
      );
      const clampedMin = await getCountryThreshold(testCountryCode);
      assert.equal(clampedMin, 50, 'Threshold should clamp to min 50');
    } finally {
      if (origEnv !== undefined) {
        process.env.METER_COUNTRY_THRESHOLD = origEnv;
      }
    }
  });

  test('FIX-2: reconcileCounters uses exact weights (likes*1, dislikes*-0.5, commenters*3, visits*4, reactions*5)', async () => {
    const author = await createTestUser();
    const postRes = await createTestPost(author.token);
    const postId = postRes.body._id;

    // 3 likes (+3)
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const u3 = await createTestUser();
    await models.Vote.create([
      { userId: u1.id, postId, value: 1 },
      { userId: u2.id, postId, value: 1 },
      { userId: u3.id, postId, value: 1 },
    ]);

    // 2 dislikes (-1)
    const u4 = await createTestUser();
    const u5 = await createTestUser();
    await models.Vote.create([
      { userId: u4.id, postId, value: -1 },
      { userId: u5.id, postId, value: -1 },
    ]);

    // 2 distinct commenters posting 3 comments (+6)
    const c1 = await createTestUser();
    const c2 = await createTestUser();
    await models.Comment.create([
      { postId, authorId: c1.id, body: 'C1 first' },
      { postId, authorId: c1.id, body: 'C1 second' },
      { postId, authorId: c2.id, body: 'C2 first' },
    ]);

    // 2 verified visits (+8)
    const v1 = await createTestUser();
    const v2 = await createTestUser();
    await models.Visit.create([
      { postId, userId: v1.id, verified: true, visitedAt: new Date() },
      { postId, userId: v2.id, verified: true, visitedAt: new Date() },
    ]);

    // 1 reaction (+5)
    const r1 = await createTestUser();
    await models.Reaction.create({
      postId,
      userId: r1.id,
      type: 'mind_blown',
    });

    // Reconcile and apply
    const result = await reconcileCounters({ apply: true, quiet: true });
    assert.equal(result.totalInspected, 1);
    assert.equal(result.totalFixed, 1);

    const post = await models.Post.findById(postId).lean();
    assert.equal(post.meter.likes, 3);
    assert.equal(post.meter.dislikes, 2);
    assert.equal(post.meter.comments, 3);
    assert.equal(post.meter.commenters, 2);
    assert.equal(post.meter.visits, 2);
    assert.equal(post.meter.reactions, 1);

    // Expected score: 3*1 + 2*(-0.5) + 2*3 + 2*4 + 1*5 = 3 - 1 + 6 + 8 + 5 = 21
    assert.equal(post.meter.score, 21, 'Score must match exact unified formula');
  });

  test('FIX-3: auth middleware fails closed (503) instead of trusting JWT payload if DB lookup throws on cache miss', async () => {
    invalidateUserAuthCache();

    const fakeUserId = new mongoose.Types.ObjectId().toHexString();
    const token = generateAccessToken({
      id: fakeUserId,
      username: 'test_db_down_user',
      tokenVersion: 1,
    });

    const origFindById = models.User.findById;
    try {
      // 1. Simulate DB failure / timeout
      models.User.findById = function () {
        return {
          select: function () {
            return {
              lean: async function () {
                throw new Error('Atlas M0 connection timeout');
              },
            };
          },
        };
      };

      let statusResult = null;
      let jsonResult = null;
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = {
        status: (code) => {
          statusResult = code;
          return res;
        },
        json: (data) => {
          jsonResult = data;
          return res;
        },
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      await requireAuth(req, res, next);

      assert.equal(nextCalled, false, 'next() must NOT be called on DB error');
      assert.equal(statusResult, 503, 'Must return 503 SERVICE_UNAVAILABLE');
      assert.equal(jsonResult.code, 'SERVICE_UNAVAILABLE');
      assert.equal(jsonResult.error, 'Authentication service temporarily unavailable');

      // 2. Simulate CastError (e.g. malformed ObjectId)
      models.User.findById = function () {
        return {
          select: function () {
            return {
              lean: async function () {
                const err = new Error('Cast to ObjectId failed');
                err.name = 'CastError';
                throw err;
              },
            };
          },
        };
      };

      statusResult = null;
      jsonResult = null;
      await requireAuth(req, res, next);

      assert.equal(statusResult, 401, 'CastError should return 401');
      assert.equal(jsonResult.code, 'AUTH_INVALID_TOKEN');
    } finally {
      models.User.findById = origFindById;
    }
  });

  test('FIX-4: validateFuzzConfig throws in NODE_ENV=production when FUZZ_SECRET is missing or < 32 chars', () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.FUZZ_SECRET;
    const origSalt = process.env.LOCATION_FUZZ_SALT;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.FUZZ_SECRET;
      delete process.env.LOCATION_FUZZ_SALT;

      // 1. Missing secret in production
      assert.throws(
        () => validateFuzzConfig(),
        /FATAL: FUZZ_SECRET must be configured and contain at least 32 characters in production/
      );

      // 2. Secret < 32 characters in production
      process.env.FUZZ_SECRET = 'short_secret_123';
      assert.throws(
        () => validateFuzzConfig(),
        /FATAL: FUZZ_SECRET must be configured and contain at least 32 characters in production/
      );

      // 3. Valid secret (>= 32 chars) in production
      process.env.FUZZ_SECRET = 'a'.repeat(32);
      assert.doesNotThrow(() => validateFuzzConfig());

      // 4. In development/test, missing secret does not throw
      process.env.NODE_ENV = 'test';
      delete process.env.FUZZ_SECRET;
      assert.doesNotThrow(() => validateFuzzConfig());
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret !== undefined) process.env.FUZZ_SECRET = origSecret;
      else delete process.env.FUZZ_SECRET;
      if (origSalt !== undefined) process.env.LOCATION_FUZZ_SALT = origSalt;
      else delete process.env.LOCATION_FUZZ_SALT;
    }
  });
});
