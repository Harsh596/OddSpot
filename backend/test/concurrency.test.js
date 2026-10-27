// backend/tests/concurrency.test.js
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  request,
  setupTestDb,
  teardownTestDb,
  clearCollections,
  createTestUser,
  createTestPost,
  models,
} = require('./setup');
const meter = require('../services/meter');

describe('Concurrency & Race Condition Integration Tests', () => {
  let user;
  let voter;
  let post;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    meter.resetVelocityTracking();
    user = await createTestUser();
    voter = await createTestUser();
    const postRes = await createTestPost(user.token, { title: 'Concurrency Test Post' });
    post = postRes.body;
  });

  it('1. 20 parallel likes from ONE user: zero 500s and likes counter is exactly 1', async () => {
    const promises = Array.from({ length: 20 }, () =>
      request(app)
        .post(`/api/posts/${post._id}/vote`)
        .set('Authorization', `Bearer ${voter.token}`)
        .send({ value: 1 })
    );

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);

    // No 500s allowed
    const has500 = statuses.some((s) => s >= 500);
    assert.equal(has500, false, 'No vote request may return HTTP 500');

    // All should be 200
    for (const status of statuses) {
      assert.equal(status, 200);
    }

    // Database counter check
    const postDoc = await models.Post.findById(post._id);
    assert.equal(postDoc.meter.likes, 1, 'Likes counter must be exactly 1');
    assert.equal(postDoc.meter.dislikes, 0);

    // Exactly one vote record in DB
    const voteCount = await models.Vote.countDocuments({
      userId: voter.id,
      postId: post._id,
    });
    assert.equal(voteCount, 1);
  });

  it('2. 20 parallel like->dislike switches from ONE user: zero 500s, likes=0, dislikes=1', async () => {
    // Initial upvote
    await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${voter.token}`)
      .send({ value: 1 });

    // 20 parallel downvotes
    const promises = Array.from({ length: 20 }, () =>
      request(app)
        .post(`/api/posts/${post._id}/vote`)
        .set('Authorization', `Bearer ${voter.token}`)
        .send({ value: -1 })
    );

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);

    const has500 = statuses.some((s) => s >= 500);
    assert.equal(has500, false, 'No switch request may return HTTP 500');

    for (const status of statuses) {
      assert.equal(status, 200);
    }

    const postDoc = await models.Post.findById(post._id);
    assert.equal(postDoc.meter.likes, 0, 'Likes counter must be 0 after switch');
    assert.equal(postDoc.meter.dislikes, 1, 'Dislikes counter must be 1 after switch');

    const voteDoc = await models.Vote.findOne({
      userId: voter.id,
      postId: post._id,
    });
    assert.equal(voteDoc.value, -1);
  });

  it('3. Tier moves city -> country on score threshold and never reverts back down', async () => {
    process.env.METER_COUNTRY_THRESHOLD = '2';

    try {
      const commenter = await createTestUser();
      // Add a comment (+3 points), which exceeds threshold of 2
      const commentRes = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${commenter.token}`)
        .send({ body: 'Country tier booster' });

      assert.equal(commentRes.status, 201);

      let postDoc = await models.Post.findById(post._id);
      assert.equal(postDoc.tier, 'country', 'Post tier must escalate to country');

      // Now downvote to reduce score below 2
      await request(app)
        .post(`/api/posts/${post._id}/vote`)
        .set('Authorization', `Bearer ${commenter.token}`)
        .send({ value: -1 });

      postDoc = await models.Post.findById(post._id);
      assert.equal(
        postDoc.tier,
        'country',
        'Post tier must NEVER ratchet backwards to city'
      );
    } finally {
      delete process.env.METER_COUNTRY_THRESHOLD;
    }
  });

  it('4. Concurrent comments execute atomically without score drift', async () => {
    // 8 concurrent comments from 8 distinct commenters (+3 points each -> +24 points total)
    const commenters = await Promise.all(
      Array.from({ length: 8 }, () => createTestUser())
    );
    const promises = commenters.map((c, i) =>
      request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${c.token}`)
        .send({ body: `Concurrent comment ${i}` })
    );

    const responses = await Promise.all(promises);
    for (const r of responses) {
      assert.equal(r.status, 201);
    }

    const postDoc = await models.Post.findById(post._id);
    assert.equal(postDoc.meter.comments, 8);
    assert.equal(postDoc.meter.score, 24);
  });
});
