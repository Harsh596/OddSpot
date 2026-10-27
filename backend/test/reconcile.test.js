// backend/tests/reconcile.test.js
// Tests scripts/reconcileCounters.js dry-run and apply modes,
// counter drift detection, score recalculation, tier ratcheting,
// and strict filtering of soft-deleted comments and posts.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestDb, teardownTestDb, clearCollections, createTestUser, createTestPost } = require('./setup');
const models = require('../models');
const { reconcileCounters } = require('../scripts/reconcileCounters');
const cfg = require('../config/meter');

describe('Wave 1: Counter Reconciliation Integration Tests', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  test('1. Dry run on clean DB reports 0 drift', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    const result = await reconcileCounters({ apply: false, quiet: true });
    assert.equal(result.totalInspected, 1);
    assert.equal(result.totalWithDrift, 0);
    assert.equal(result.totalFixed, 0);
  });

  test('2. Dry run detects artificial drift without modifying database', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    // Create 2 real likes in Votes collection
    await models.Vote.create([
      { userId: user.id, postId: post._id, value: 1 },
      { userId: (await createTestUser()).id, postId: post._id, value: 1 },
    ]);

    // Create 1 real dislike
    await models.Vote.create([
      { userId: (await createTestUser()).id, postId: post._id, value: -1 },
    ]);

    const commenter1 = await createTestUser();
    const commenter2 = await createTestUser();
    // Create 2 real comments
    await models.Comment.create([
      { postId: post._id, authorId: commenter1.id, body: 'Comment 1' },
      { postId: post._id, authorId: commenter2.id, body: 'Comment 2' },
    ]);

    // Artificially corrupt the post meter
    await models.Post.updateOne(
      { _id: post._id },
      {
        $set: {
          'meter.likes': 99,
          'meter.dislikes': 42,
          'meter.comments': 0,
          'meter.score': 1000,
        },
      }
    );

    // Run dry run
    const result = await reconcileCounters({ apply: false, quiet: true });
    assert.equal(result.totalInspected, 1);
    assert.equal(result.totalWithDrift, 1);
    assert.equal(result.totalFixed, 0);

    // Verify DB was NOT changed during dry run
    const postAfter = await models.Post.findById(post._id);
    assert.equal(postAfter.meter.likes, 99);
    assert.equal(postAfter.meter.dislikes, 42);
    assert.equal(postAfter.meter.comments, 0);
    assert.equal(postAfter.meter.score, 1000);
  });

  test('3. Reconcile with apply: true fixes counters, recalculates score, and ratchets tier', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    // Create 3 real likes (each worth +1)
    for (let i = 0; i < 3; i++) {
      const u = await createTestUser();
      await models.Vote.create({ userId: u.id, postId: post._id, value: 1 });
    }

    // Create 1 real dislike (worth -2)
    const uDislike = await createTestUser();
    await models.Vote.create({ userId: uDislike.id, postId: post._id, value: -1 });

    // Create 4 real comments (each by a unique non-author, worth +3)
    for (let i = 0; i < 4; i++) {
      const uCommenter = await createTestUser();
      await models.Comment.create({
        postId: post._id,
        authorId: uCommenter.id,
        body: `Comment ${i}`,
      });
    }

    // Corrupt post meter
    await models.Post.updateOne(
      { _id: post._id },
      {
        $set: {
          'meter.likes': 0,
          'meter.dislikes': 0,
          'meter.comments': 0,
          'meter.score': 0,
          tier: 'city',
        },
      }
    );

    // Run with apply: true
    const result = await reconcileCounters({ apply: true, quiet: true });
    assert.equal(result.totalInspected, 1);
    assert.equal(result.totalWithDrift, 1);
    assert.equal(result.totalFixed, 1);

    // Verify DB post is fully reconciled
    const fixedPost = await models.Post.findById(post._id);
    assert.equal(fixedPost.meter.likes, 3);
    assert.equal(fixedPost.meter.dislikes, 1);
    assert.equal(fixedPost.meter.comments, 4);

    const expectedScore = 3 * cfg.weights.like + 1 * cfg.weights.dislike + 4 * cfg.weights.comment;
    assert.equal(fixedPost.meter.score, expectedScore);

    // Check tier: country threshold is cfg.thresholds.country (default 50)
    assert.equal(fixedPost.tier, 'city');

    // Now add enough comments to cross country threshold (score >= cfg.thresholds.country)
    const neededComments = Math.ceil((cfg.thresholds.country - fixedPost.meter.score) / cfg.weights.comment) + 1;
    for (let i = 0; i < neededComments; i++) {
      const uExtra = await createTestUser();
      await models.Comment.create({
        postId: post._id,
        authorId: uExtra.id,
        body: `Extra comment ${i}`,
      });
    }
    await reconcileCounters({ apply: true, quiet: true });

    const tieredPost = await models.Post.findById(post._id);
    assert.ok(tieredPost.meter.score >= cfg.thresholds.country);
    assert.equal(tieredPost.tier, 'country');
  });

  test('4. Soft-deleted comments (removed: true) are strictly excluded from counter and score', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    const commenterA = await createTestUser();
    const commenterB = await createTestUser();
    // 2 active comments
    await models.Comment.create([
      { postId: post._id, authorId: commenterA.id, body: 'Active comment 1', removed: false },
      { postId: post._id, authorId: commenterB.id, body: 'Active comment 2' },
    ]);

    // 2 soft-deleted comments
    await models.Comment.create([
      { postId: post._id, authorId: (await createTestUser()).id, body: 'Removed comment 1', removed: true },
      { postId: post._id, authorId: (await createTestUser()).id, body: 'Removed comment 2', removed: true },
    ]);

    // Apply reconciliation
    await reconcileCounters({ apply: true, quiet: true });

    const postAfter = await models.Post.findById(post._id);
    // Only the 2 non-removed comments should be counted
    assert.equal(postAfter.meter.comments, 2);
    assert.equal(postAfter.meter.score, 2 * cfg.weights.comment);
  });

  test('5. Soft-deleted posts (removed: true) are excluded from reconciliation', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    // Soft delete the post
    await models.Post.updateOne({ _id: post._id }, { $set: { removed: true } });

    const result = await reconcileCounters({ apply: false, quiet: true });
    assert.equal(result.totalInspected, 0, 'Soft-deleted post must be excluded from inspection');
  });
});
