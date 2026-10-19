// backend/tests/idempotency.test.js
// Tests Idempotency-Key header support on POST /api/posts and comments,
// including response replay, parameter mismatch (422), concurrent in-flight (409),
// and 60-second lock timeout re-acquisition.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { setupTestDb, teardownTestDb, clearCollections, createTestUser, createTestPost } = require('./setup');
const models = require('../models');

describe('Wave 1: Idempotency-Key Integration Tests', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  test('1. POST /api/posts without Idempotency-Key succeeds normally', async () => {
    const user = await createTestUser();
    const payload = {
      title: 'test_post_no_idempotency',
      body: 'Testing normal post creation',
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      country: 'India',
      images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    };

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(payload);

    assert.equal(res.status, 201);
    const keysCount = await models.IdempotencyKey.countDocuments({});
    assert.equal(keysCount, 0);
  });

  test('2. POST /api/posts with Idempotency-Key creates post and completed idempotency entry', async () => {
    const user = await createTestUser();
    const payload = {
      title: 'test_post_idempotent_1',
      body: 'Testing initial idempotent submission',
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      country: 'India',
      images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    };

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-post-key-1001')
      .send(payload);

    assert.equal(res.status, 201);
    assert.ok(res.body._id);

    const record = await models.IdempotencyKey.findOne({
      userId: user.id,
      key: 'req-post-key-1001',
    });
    assert.ok(record);
    assert.equal(record.status, 'completed');
    assert.equal(record.statusCode, 201);
    assert.equal(String(record.responseBody._id), String(res.body._id));
  });

  test('3. Replaying POST /api/posts with identical key and payload replays cached response and avoids duplicates', async () => {
    const user = await createTestUser();
    const payload = {
      title: 'test_post_replay_check',
      body: 'Testing replay logic',
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      country: 'India',
      images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    };

    // First attempt
    const res1 = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-post-replay-1002')
      .send(payload);

    assert.equal(res1.status, 201);
    const createdId = res1.body._id;

    // Check stats.posts after first creation
    const userAfterFirst = await models.User.findById(user.id);
    assert.equal(userAfterFirst.stats.posts, 1);

    // Second attempt (exact same key and payload)
    const res2 = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-post-replay-1002')
      .send(payload);

    assert.equal(res2.status, 201);
    assert.equal(res2.body._id, createdId);

    // Verify DB state: exactly 1 post created, stats.posts not incremented again
    const postCount = await models.Post.countDocuments({ title: 'test_post_replay_check' });
    assert.equal(postCount, 1);

    const userAfterSecond = await models.User.findById(user.id);
    assert.equal(userAfterSecond.stats.posts, 1);
  });

  test('4. Idempotency key reuse with different parameters returns 422 IDEMPOTENCY_KEY_MISMATCH', async () => {
    const user = await createTestUser();
    const payload1 = {
      title: 'test_post_mismatch_original',
      body: 'First payload',
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      country: 'India',
      images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    };
    const payload2 = {
      title: 'test_post_mismatch_modified',
      body: 'Different payload with same key',
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      country: 'India',
      images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    };

    const res1 = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-post-mismatch-1003')
      .send(payload1);
    assert.equal(res1.status, 201);

    const res2 = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-post-mismatch-1003')
      .send(payload2);

    assert.equal(res2.status, 422);
    assert.equal(res2.body.code, 'IDEMPOTENCY_KEY_MISMATCH');
  });

  test('5. In-flight request (< 60s) returns 409 IDEMPOTENCY_IN_FLIGHT', async () => {
    const user = await createTestUser();
    const { hashPayload } = require('../middleware/idempotency');
    const payload = {
      title: 'test_post_inflight',
      body: 'In-flight testing',
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      country: 'India',
      images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    };

    // Pre-insert an in-flight pending lock created 10 seconds ago
    await models.IdempotencyKey.create({
      userId: user.id,
      key: 'req-inflight-key',
      endpoint: '/api/posts',
      requestHash: hashPayload(payload),
      status: 'pending',
      lockedAt: new Date(Date.now() - 10000),
    });

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-inflight-key')
      .send(payload);

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'IDEMPOTENCY_IN_FLIGHT');
  });

  test('6. In-flight lock older than 60s allows retry to re-acquire the lock and complete', async () => {
    const user = await createTestUser();
    const { hashPayload } = require('../middleware/idempotency');
    const payload = {
      title: 'test_post_lock_timeout',
      body: 'Lock timeout testing',
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      country: 'India',
      images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    };

    // Pre-insert an abandoned pending lock created 65 seconds ago (> 60s timeout)
    await models.IdempotencyKey.create({
      userId: user.id,
      key: 'req-timeout-key',
      endpoint: '/api/posts',
      requestHash: hashPayload(payload),
      status: 'pending',
      lockedAt: new Date(Date.now() - 65000),
    });

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-timeout-key')
      .send(payload);

    assert.equal(res.status, 201);
    assert.ok(res.body._id);

    // Verify key was updated to completed
    const record = await models.IdempotencyKey.findOne({
      userId: user.id,
      key: 'req-timeout-key',
    });
    assert.equal(record.status, 'completed');
    assert.equal(record.statusCode, 201);
  });

  test('7. POST /api/posts/:id/comments with Idempotency-Key replays without duplicate comments or counter drift', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    const commentPayload = { body: 'Unique idempotent comment body' };

    // First submission
    const res1 = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-comment-key-555')
      .send(commentPayload);

    assert.equal(res1.status, 201);
    const commentId = res1.body.comment._id;

    // Verify post comments counter is 1
    const postAfterFirst = await models.Post.findById(post._id);
    assert.equal(postAfterFirst.meter.comments, 1);

    // Second submission with exact same key
    const res2 = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'req-comment-key-555')
      .send(commentPayload);

    assert.equal(res2.status, 201);
    assert.equal(res2.body.comment._id, commentId);

    // Verify DB state: exactly 1 comment doc, post comments counter is still 1
    const totalComments = await models.Comment.countDocuments({ postId: post._id });
    assert.equal(totalComments, 1);

    const postAfterSecond = await models.Post.findById(post._id);
    assert.equal(postAfterSecond.meter.comments, 1);
  });

  test('8. Malformed or excessively long Idempotency-Key returns 400 Bad Request', async () => {
    const user = await createTestUser();
    const payload = {
      title: 'test_post_bad_key',
      body: 'Testing bad key',
      latitude: 12.9716,
      longitude: 77.5946,
      city: 'Bengaluru',
      country: 'India',
      images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    };

    // Empty key
    const resEmpty = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', '   ')
      .send(payload);
    assert.equal(resEmpty.status, 400);

    // Over 128 characters
    const longKey = 'a'.repeat(129);
    const resLong = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', longKey)
      .send(payload);
    assert.equal(resLong.status, 400);
  });
});
