// backend/tests/transactions.test.js
// Tests atomic transactions on castVote and comment creation paths,
// including simulated failure mid-operation to verify transaction rollback and zero counter drift.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { setupTestDb, teardownTestDb, clearCollections, createTestUser, createTestPost } = require('./setup');
const models = require('../models');
const meterService = require('../services/meter');

describe('Wave 1: Transactions & Atomic Writes Integration Tests', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  test('1. Successful vote updates Vote collection and Post meter atomically', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    const res = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ value: 1 });

    assert.equal(res.status, 200);
    assert.equal(res.body.changed, true);
    assert.equal(res.body.meter.likes, 1);

    const voteInDb = await models.Vote.findOne({ userId: user.id, postId: post._id });
    assert.ok(voteInDb);
    assert.equal(voteInDb.value, 1);

    const postInDb = await models.Post.findById(post._id);
    assert.equal(postInDb.meter.likes, 1);
  });

  test('2. Simulated failure during castVote rolls back Vote and leaves Post meter with 0 drift', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    // Verify initial state
    const initialPost = await models.Post.findById(post._id);
    assert.equal(initialPost.meter.likes, 0);

    // Monkey-patch applyDelta to throw an intentional failure
    const originalApplyDelta = meterService.applyDelta;
    meterService.applyDelta = async () => {
      throw new Error('SIMULATED_TRANSACTION_FAILURE_MID_VOTE');
    };

    try {
      await assert.rejects(
        async () => {
          await meterService.castVote(user.id, post._id, 1);
        },
        (err) => {
          assert.equal(err.message, 'SIMULATED_TRANSACTION_FAILURE_MID_VOTE');
          return true;
        }
      );
    } finally {
      // Restore original applyDelta
      meterService.applyDelta = originalApplyDelta;
    }

    // Verify atomicity: Vote was rolled back, Post meter is untouched
    const voteInDb = await models.Vote.findOne({ userId: user.id, postId: post._id });
    assert.equal(voteInDb, null, 'Vote document must be rolled back on transaction abort');

    const postAfter = await models.Post.findById(post._id);
    assert.equal(postAfter.meter.likes, 0, 'Post meter.likes must remain 0 with zero counter drift');
    assert.equal(postAfter.meter.score, 0, 'Post meter.score must remain 0');
  });

  test('3. Successful comment creation updates Comment collection and Post meter atomically', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    const res = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 'Transactional comment test body' });

    assert.equal(res.status, 201);
    assert.ok(res.body.comment);

    const commentsInDb = await models.Comment.find({ postId: post._id });
    assert.equal(commentsInDb.length, 1);
    assert.equal(commentsInDb[0].body, 'Transactional comment test body');

    const postInDb = await models.Post.findById(post._id);
    assert.equal(postInDb.meter.comments, 1);
  });

  test('4. Simulated failure during comment creation rolls back Comment and leaves Post meter with 0 drift', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    // Verify initial state
    const initialCommentsCount = await models.Comment.countDocuments({ postId: post._id });
    assert.equal(initialCommentsCount, 0);

    // Monkey-patch applyDelta to throw an intentional failure during comment creation
    const originalApplyDelta = meterService.applyDelta;
    meterService.applyDelta = async () => {
      throw new Error('SIMULATED_TRANSACTION_FAILURE_MID_COMMENT');
    };

    try {
      const res = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ body: 'This comment must roll back' });

      // Error handler catches error from transaction
      assert.equal(res.status, 500);
    } finally {
      meterService.applyDelta = originalApplyDelta;
    }

    // Verify atomicity: Comment document was rolled back, Post meter is untouched
    const commentsAfter = await models.Comment.find({ postId: post._id });
    assert.equal(commentsAfter.length, 0, 'Comment document must not be persisted on transaction abort');

    const postAfter = await models.Post.findById(post._id);
    assert.equal(postAfter.meter.comments, 0, 'Post meter.comments must remain 0 with zero counter drift');
    assert.equal(postAfter.meter.score, 0, 'Post meter.score must remain 0');
  });
});
