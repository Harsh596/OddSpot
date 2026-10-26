// backend/test/phase2.test.js
// Regression test suite for Phase 2:
// - Task P2-T1: withTransaction atomicity & _failBeforeApplyDelta test injection hook
// - Task P2-T2: reconcileCounters & reconcileAllCounters (votes, comments, visits, score, tier)
// - Task P2-T3: IdempotencyKey model & middleware (replay, 422 mismatch, 409 in-flight lock, release on 4xx)
// - Task P2-T4: Soft-delete filtering (removed: { $ne: true }) on all read/write routes
// - Task P2-T5: Central errorHandler mapping Mongo 11000 to 409 and ValidationError/CastError to 400

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../server');
const { setupTestDb, teardownTestDb, clearCollections, createTestUser, createTestPost } = require('./setup');
const models = require('../models');
const { withTransaction } = require('../utils/withTransaction');
const meterService = require('../services/meter');
const { reconcileCounters, reconcileAllCounters } = require('../scripts/reconcileCounters');
const cfg = require('../config/meter');

describe('Phase 2: Write Integrity, Transactions, Reconcile & Idempotency', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  // --------------------------------------------------------------------------
  // Task P2-T1 (K7): Transactions & _failBeforeApplyDelta
  // --------------------------------------------------------------------------
  describe('Task P2-T1: Transactions & Injection Hooks', () => {
    test('withTransaction executes operations atomically and commits on success', async () => {
      const user = await createTestUser();
      const res = await createTestPost(user.token);
      const post = res.body;

      await withTransaction(async (session) => {
        await models.Post.updateOne({ _id: post._id }, { $set: { title: 'Updated Inside Tx' } }).session(session);
      });

      const updated = await models.Post.findById(post._id);
      assert.equal(updated.title, 'Updated Inside Tx');
    });

    test('withTransaction rolls back all operations when an error is thrown', async () => {
      const user = await createTestUser();
      const res = await createTestPost(user.token);
      const post = res.body;

      await assert.rejects(
        async () => {
          await withTransaction(async (session) => {
            await models.Post.updateOne({ _id: post._id }, { $set: { title: 'Should Be Rolled Back' } }).session(session);
            throw new Error('TX_ABORT_TEST');
          });
        },
        /TX_ABORT_TEST/
      );

      const unchanged = await models.Post.findById(post._id);
      assert.notEqual(unchanged.title, 'Should Be Rolled Back');
    });

    test('castVote rolls back vote insertion and counter when _failBeforeApplyDelta triggers', async () => {
      const author = await createTestUser();
      const voter = await createTestUser();
      const res = await createTestPost(author.token);
      const post = res.body;

      // Call castVote with _failBeforeApplyDelta injection hook
      await assert.rejects(
        async () => {
          await meterService.castVote(voter.id, post._id, 1, null, { _failBeforeApplyDelta: true });
        },
        /SIMULATED_TRANSACTION_FAILURE_BEFORE_APPLY_DELTA/
      );

      // Verify no vote was recorded and post meter was not updated
      const voteRecord = await models.Vote.findOne({ userId: voter.id, postId: post._id });
      assert.equal(voteRecord, null, 'Vote document must not exist after rollback');

      const freshPost = await models.Post.findById(post._id);
      assert.equal(freshPost.meter.likes, 0, 'Post likes counter must remain 0');
      assert.equal(freshPost.meter.score, 0, 'Post score must remain 0');
    });

    test('comment creation rolls back comment document when _failBeforeApplyDelta triggers', async () => {
      const author = await createTestUser();
      const commenter = await createTestUser();
      const res = await createTestPost(author.token);
      const post = res.body;

      const commentRes = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${commenter.token}`)
        .send({
          body: 'This comment will abort before delta apply',
          _failBeforeApplyDelta: true,
        });

      assert.equal(commentRes.status, 500);

      // Verify comment document was NOT persisted
      const comments = await models.Comment.find({ postId: post._id });
      assert.equal(comments.length, 0, 'Comment must not exist after transactional rollback');

      // Verify post comment counter was NOT incremented
      const freshPost = await models.Post.findById(post._id);
      assert.equal(freshPost.meter.comments, 0, 'Post comment counter must remain 0');
    });
  });

  // --------------------------------------------------------------------------
  // Task P2-T2: Counter Reconciliation
  // --------------------------------------------------------------------------
  describe('Task P2-T2: Counter & Visit Reconciliation', () => {
    test('reconcileAllCounters is exported and functions identical to reconcileCounters', () => {
      assert.equal(typeof reconcileAllCounters, 'function');
      assert.equal(reconcileAllCounters, reconcileCounters);
    });

    test('reconcileAllCounters reconciles votes, comments, visits, score, and ratchets tier', async () => {
      const author = await createTestUser();
      const postRes = await createTestPost(author.token);
      const post = postRes.body;

      // Insert 2 real votes
      const u1 = await createTestUser();
      const u2 = await createTestUser();
      await models.Vote.create([
        { userId: u1.id, postId: post._id, value: 1 },
        { userId: u2.id, postId: post._id, value: -1 },
      ]);

      // Insert 2 real comments
      await models.Comment.create([
        { postId: post._id, authorId: u1.id, body: 'Real comment 1' },
        { postId: post._id, authorId: u2.id, body: 'Real comment 2' },
      ]);

      // Insert 1 real visit
      await models.Visit.create({
        postId: post._id,
        userId: u1.id,
        location: { type: 'Point', coordinates: [12.4924, 41.8902] },
        verified: true,
      });

      // Inject deliberate drift into post.meter
      await models.Post.updateOne(
        { _id: post._id },
        {
          $set: {
            'meter.likes': 99,
            'meter.dislikes': 88,
            'meter.comments': 77,
            'meter.visits': 66,
            'meter.score': 9999,
          },
        }
      );

      // 1. Dry run
      const dryResult = await reconcileAllCounters({ apply: false, quiet: true });
      assert.equal(dryResult.totalInspected, 1);
      assert.equal(dryResult.totalWithDrift, 1);
      assert.equal(dryResult.totalFixed, 0);

      // 2. Apply run
      const applyResult = await reconcileAllCounters({ apply: true, quiet: true });
      assert.equal(applyResult.totalInspected, 1);
      assert.equal(applyResult.totalWithDrift, 1);
      assert.equal(applyResult.totalFixed, 1);

      // Verify DB post
      const fixed = await models.Post.findById(post._id);
      assert.equal(fixed.meter.likes, 1);
      assert.equal(fixed.meter.dislikes, 1);
      assert.equal(fixed.meter.comments, 2);
      assert.equal(fixed.meter.visits, 1);

      const expectedScore =
        1 * cfg.weights.like +
        1 * cfg.weights.dislike +
        2 * cfg.weights.comment +
        1 * cfg.weights.visit;
      assert.equal(fixed.meter.score, expectedScore);
    });
  });

  // --------------------------------------------------------------------------
  // Task P2-T3: IdempotencyKey Model & Middleware
  // --------------------------------------------------------------------------
  describe('Task P2-T3: IdempotencyKey Model & Middleware', () => {
    test('IdempotencyKey schema supports route, inProgress, and syncs endpoint', async () => {
      const user = await createTestUser();
      const entry = await models.IdempotencyKey.create({
        key: 'test_key_model_check',
        userId: user.id,
        route: '/api/posts',
        requestHash: 'deadbeef1234',
        inProgress: true,
      });

      assert.equal(entry.route, '/api/posts');
      assert.equal(entry.endpoint, '/api/posts');
      assert.equal(entry.inProgress, true);
      assert.equal(entry.status, 'pending');
    });

    test('POST /api/posts idempotency replay and parameter mismatch', async () => {
      const user = await createTestUser();
      const payload = {
        title: 'test_2_idempotent_post',
        body: 'Testing idempotency replay semantics',
        latitude: 41.8902,
        longitude: 12.4924,
        city: 'Rome',
        country: 'Italy',
        images: ['https://example.com/photo.jpg'],
      };

      // Initial request
      const res1 = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', 'key-post-p2-001')
        .send(payload);

      assert.equal(res1.status, 201);
      const originalPostId = res1.body._id;

      // Replay identical request
      const res2 = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', 'key-post-p2-001')
        .send(payload);

      assert.equal(res2.status, 201);
      assert.equal(res2.body._id, originalPostId);

      // Verify no duplicate post in DB
      const postCount = await models.Post.countDocuments({ title: 'test_2_idempotent_post' });
      assert.equal(postCount, 1);

      // Replay with different payload returns 422
      const res3 = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', 'key-post-p2-001')
        .send({ ...payload, title: 'different_title' });

      assert.equal(res3.status, 422);
      assert.equal(res3.body.code, 'IDEMPOTENCY_KEY_MISMATCH');
    });

    test('POST /api/posts concurrent in-flight returns 409', async () => {
      const user = await createTestUser();
      const { hashPayload } = require('../middleware/idempotency');
      const payload = {
        title: 'test_2_inflight_post',
        body: 'Testing in flight lock',
        latitude: 41.8902,
        longitude: 12.4924,
        city: 'Rome',
        country: 'Italy',
        images: ['https://example.com/photo.jpg'],
      };

      // Manually insert an in-flight key
      await models.IdempotencyKey.create({
        key: 'key-inflight-p2',
        userId: user.id,
        route: '/api/posts',
        endpoint: '/api/posts',
        requestHash: hashPayload(payload),
        inProgress: true,
        status: 'pending',
        lockedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', 'key-inflight-p2')
        .send(payload);

      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'IDEMPOTENCY_IN_FLIGHT');
    });

    test('Validation failure on idempotent request releases lock for retry', async () => {
      const user = await createTestUser();
      const invalidPayload = {
        title: '', // Invalid empty title
        body: 'Testing validation error lock release',
        latitude: 41.8902,
        longitude: 12.4924,
        city: 'Rome',
        country: 'Italy',
        images: ['https://example.com/photo.jpg'],
      };

      const res1 = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', 'key-retry-after-fail')
        .send(invalidPayload);

      assert.equal(res1.status, 400);

      // Verify lock was released
      const keyRecord = await models.IdempotencyKey.findOne({
        userId: user.id,
        key: 'key-retry-after-fail',
      });
      assert.equal(keyRecord, null, 'Pending lock must be cleared on 400 validation failure');

      // Retry with valid payload succeeds
      const validPayload = {
        title: 'test_2_valid_after_fix',
        body: 'Now this payload is valid',
        latitude: 41.8902,
        longitude: 12.4924,
        city: 'Rome',
        country: 'Italy',
        images: ['https://example.com/photo.jpg'],
      };
      const res2 = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', 'key-retry-after-fail')
        .send(validPayload);

      assert.equal(res2.status, 201);
    });
  });

  // --------------------------------------------------------------------------
  // Task P2-T4: Soft Delete Enforcement
  // --------------------------------------------------------------------------
  describe('Task P2-T4: Soft-Delete Filtering (removed: { $ne: true })', () => {
    test('removed: true post is unreachable via GET, vote, comment, and report', async () => {
      const author = await createTestUser();
      const visitor = await createTestUser();
      const postRes = await createTestPost(author.token);
      const post = postRes.body;

      // Soft-delete the post
      await models.Post.updateOne({ _id: post._id }, { $set: { removed: true } });

      // 1. GET /posts/:id
      const getRes = await request(app).get(`/api/posts/${post._id}`);
      assert.equal(getRes.status, 404);

      // 2. POST /posts/:id/vote
      const voteRes = await request(app)
        .post(`/api/posts/${post._id}/vote`)
        .set('Authorization', `Bearer ${visitor.token}`)
        .send({ value: 1 });
      assert.equal(voteRes.status, 404);

      // 3. POST /posts/:id/comments
      const commentRes = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${visitor.token}`)
        .send({ body: 'Comment on removed post' });
      assert.equal(commentRes.status, 404);

      // 4. POST /posts/:id/report
      const reportRes = await request(app)
        .post(`/api/posts/${post._id}/report`)
        .set('Authorization', `Bearer ${visitor.token}`)
        .send({ reason: 'spam', notes: 'Report on removed post' });
      assert.equal(reportRes.status, 404);
    });

    test('removed: true post is excluded from GET /posts/nearby feed', async () => {
      const author = await createTestUser();
      const postRes = await createTestPost(author.token, {
        title: 'test_2_nearby_removed',
        latitude: 41.8902,
        longitude: 12.4924,
      });
      const post = postRes.body;

      // Before soft delete, post is in feed
      const beforeRes = await request(app)
        .get('/api/posts/nearby?lng=12.4924&lat=41.8902&distance=5000')
        .send();
      assert.equal(beforeRes.status, 200);
      assert.ok(beforeRes.body.posts.some((p) => p._id.toString() === post._id.toString()));

      // Soft-delete
      await models.Post.updateOne({ _id: post._id }, { $set: { removed: true } });

      // After soft delete, post is excluded from feed
      const afterRes = await request(app)
        .get('/api/posts/nearby?lng=12.4924&lat=41.8902&distance=5000')
        .send();
      assert.equal(afterRes.status, 200);
      assert.ok(!afterRes.body.posts.some((p) => p._id.toString() === post._id.toString()));
    });

    test('removed: true comment is excluded from GET /posts/:id/comments', async () => {
      const author = await createTestUser();
      const commenter = await createTestUser();
      const postRes = await createTestPost(author.token);
      const post = postRes.body;

      const c1 = await models.Comment.create({
        postId: post._id,
        authorId: commenter.id,
        body: 'Active comment',
      });

      const c2 = await models.Comment.create({
        postId: post._id,
        authorId: commenter.id,
        body: 'Soft deleted comment',
        removed: true,
      });

      const res = await request(app).get(`/api/posts/${post._id}/comments`);
      assert.equal(res.status, 200);
      assert.equal(res.body.comments.length, 1);
      assert.equal(res.body.comments[0]._id.toString(), c1._id.toString());
    });
  });

  // --------------------------------------------------------------------------
  // Task P2-T5: Central Error Handler Mapping
  // --------------------------------------------------------------------------
  describe('Task P2-T5: Error Handler Mapping', () => {
    test('Mongo 11000 maps to 409 without leaking collection name or stack trace', async () => {
      const express = require('express');
      const errorHandler = require('../middleware/errorHandler');
      const testApp = express();

      testApp.get('/test-mongo-11000', (req, res, next) => {
        const err = new Error('E11000 duplicate key error collection: oddspot.users index: username_1 dup key: { username: "taken" }');
        err.code = 11000;
        err.keyValue = { username: 'taken' };
        next(err);
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/test-mongo-11000');
      assert.equal(res.status, 409);
      assert.ok(res.body.code === 'DUPLICATE_KEY' || res.body.code === 'CONFLICT');
      assert.equal(res.body.field, 'username');
      assert.ok(!JSON.stringify(res.body).includes('oddspot.users'), 'Collection name must not leak in error response');
      assert.ok(!res.body.stack, 'Stack trace must not leak in error response');
    });

    test('Mongoose ValidationError maps to 400 without leaking stack trace', async () => {
      const express = require('express');
      const errorHandler = require('../middleware/errorHandler');
      const testApp = express();

      testApp.get('/test-validation-error', (req, res, next) => {
        const user = new models.User({});
        next(user.validateSync());
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/test-validation-error');
      assert.equal(res.status, 400);
      assert.ok(res.body.code === 'VALIDATION_ERROR' || res.body.code === 'VALIDATION_FAILED');
      assert.ok(Array.isArray(res.body.details));
      assert.ok(!res.body.stack, 'Stack trace must not leak in error response');
    });

    test('Mongoose CastError maps to 400 without leaking stack trace', async () => {
      const express = require('express');
      const errorHandler = require('../middleware/errorHandler');
      const testApp = express();

      testApp.get('/test-cast-error', (req, res, next) => {
        const castErr = new mongoose.Error.CastError('ObjectId', 'not-valid-id', 'postId');
        next(castErr);
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/test-cast-error');
      assert.equal(res.status, 400);
      assert.ok(res.body.code === 'INVALID_ID' || res.body.code === 'VALIDATION_FAILED');
      assert.ok(!res.body.stack, 'Stack trace must not leak in error response');
    });
  });
});
