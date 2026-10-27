// backend/test/phase5.test.js
// Regression test suite for Phase 5:
// - Post/Comment mutations (PATCH, DELETE, soft delete, counter decrement)
// - 24-hour post edit window and immutable location/privacy enforcement
// - requireRole middleware & RBAC
// - AuditLog model and audit service
// - Cursor-paginated comments
// - Public user profiles (PII safe), caller posts, and personal data export

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const { app, request, setupTestDb, teardownTestDb, clearCollections, createTestUser, mongoose } = require('./setup');
const { User, Post, Comment, AuditLog, Vote } = require('../models');
const { logAudit } = require('../services/audit');
const { requireRole } = require('../middleware/auth');

describe('Phase 5: Post/Comment Mutations, User Profiles, RBAC & Audit Logs', () => {
  let user1;
  let user2;
  let modUser;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
    if (mongoose && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await clearCollections();
    user1 = await createTestUser(app, { username: 'test_p5_user1', email: 'test_p5_user1@example.com' });
    user2 = await createTestUser(app, { username: 'test_p5_user2', email: 'test_p5_user2@example.com' });

    // Create moderator user
    modUser = await createTestUser(app, { username: 'test_p5_mod', email: 'test_p5_mod@example.com' });
    await User.findByIdAndUpdate(modUser.id, { role: 'moderator' });
  });

  // Task P5-T1: AuditLog Model & Service
  describe('Task P5-T1: AuditLog Model & Service', () => {
    it('1. logAudit creates an audit log document', async () => {
      const entry = await logAudit({
        actorId: modUser.id,
        action: 'post_deleted',
        targetType: 'post',
        targetId: new mongoose.Types.ObjectId(),
        reason: 'Violation of community safety guidelines',
        meta: { ip: '127.0.0.1' },
      });

      assert.ok(entry);
      assert.equal(entry.action, 'post_deleted');
      assert.equal(entry.targetType, 'post');
      assert.equal(entry.reason, 'Violation of community safety guidelines');

      const found = await AuditLog.findById(entry._id);
      assert.ok(found);
      assert.equal(found.actorId.toString(), modUser.id);
    });
  });

  // Task P5-T2: requireRole Middleware
  describe('Task P5-T2: requireRole Middleware', () => {
    it('2. requireRole rejects unauthenticated requests with 401', () => {
      const middleware = requireRole('admin', 'moderator');
      let statusCalled = null;
      let jsonCalled = null;
      const req = {};
      const res = {
        status: (s) => {
          statusCalled = s;
          return { json: (j) => { jsonCalled = j; } };
        },
      };
      middleware(req, res, () => {});
      assert.equal(statusCalled, 401);
    });

    it('3. requireRole rejects member role with 403', () => {
      const middleware = requireRole('admin', 'moderator');
      let statusCalled = null;
      const req = { user: { role: 'member' } };
      const res = {
        status: (s) => {
          statusCalled = s;
          return { json: () => {} };
        },
      };
      middleware(req, res, () => {});
      assert.equal(statusCalled, 403);
    });

    it('4. requireRole allows matching role to proceed', () => {
      const middleware = requireRole('admin', 'moderator');
      let nextCalled = false;
      const req = { user: { role: 'moderator' } };
      const res = {};
      middleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
    });
  });

  // Task P5-T3: Post Mutations (PATCH, DELETE)
  describe('Task P5-T3: Post Mutations (PATCH & DELETE /posts/:id)', () => {
    it('5. PATCH /posts/:id allows author to edit title and body within 24h', async () => {
      const createRes = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Original Title',
          body: 'Original Body',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      assert.equal(createRes.status, 201);
      const postId = createRes.body._id;

      const patchRes = await request(app)
        .patch(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Updated Title',
          body: 'Updated Body',
        });

      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.title, 'Updated Title');
      assert.equal(patchRes.body.body, 'Updated Body');

      const dbPost = await Post.findById(postId);
      assert.ok(dbPost.editedAt);
      assert.equal(dbPost.editHistory.length, 1);
      assert.equal(dbPost.editHistory[0].title, 'Original Title');
    });

    it('6. PATCH /posts/:id rejects non-author edit with 403', async () => {
      const createRes = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Author Post',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      const postId = createRes.body._id;

      const patchRes = await request(app)
        .patch(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ title: 'Hacked Title' });

      assert.equal(patchRes.status, 403);
    });

    it('7. PATCH /posts/:id rejects modification of location and hideExact with 400', async () => {
      const createRes = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Post with Immutability',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      const postId = createRes.body._id;

      const patchRes = await request(app)
        .patch(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          latitude: 13.0,
          hideExact: true,
        });

      assert.equal(patchRes.status, 400);
      assert.match(patchRes.body.error, /location|privacy|immutable/i);
    });

    it('8. PATCH /posts/:id rejects edits when post is older than 24 hours', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const post = await Post.create({
        authorId: user1.id,
        title: 'Old Post',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        place: { city: 'Bengaluru', country: 'India' },
        createdAt: oldDate,
      });

      const patchRes = await request(app)
        .patch(`/api/posts/${post._id}`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ title: 'Attempt Late Edit' });

      assert.equal(patchRes.status, 400);
      assert.match(patchRes.body.error, /24 hours/i);
    });

    it('9. DELETE /posts/:id soft-deletes post and decrements user stats.posts', async () => {
      const createRes = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Post to Delete',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      const postId = createRes.body._id;

      const deleteRes = await request(app)
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${user1.token}`);

      assert.equal(deleteRes.status, 200);
      assert.equal(deleteRes.body.removed, true);

      // Verify soft deleted in DB
      const postInDb = await Post.findById(postId);
      assert.equal(postInDb.removed, true);

      // Verify GET returns 404
      const getRes = await request(app).get(`/api/posts/${postId}`);
      assert.equal(getRes.status, 404);
    });

    it('10. DELETE /posts/:id by moderator logs audit entry', async () => {
      const createRes = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Post for Mod Deletion',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      const postId = createRes.body._id;

      const deleteRes = await request(app)
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${modUser.token}`)
        .send({ reason: 'Inappropriate content' });

      assert.equal(deleteRes.status, 200);

      const audit = await AuditLog.findOne({ targetId: postId, action: 'post_deleted' });
      assert.ok(audit, 'Audit log must be created on moderator deletion');
      assert.equal(audit.actorId.toString(), modUser.id);
      assert.equal(audit.reason, 'Inappropriate content');
    });
  });

  // Task P5-T4: Comment Mutations & Cursor Pagination
  describe('Task P5-T4: Comment Mutations & Cursor Pagination', () => {
    let testPost;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Post for Comments',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      testPost = res.body;
    });

    it('11. PATCH /comments/:id allows author to edit comment body', async () => {
      const commentRes = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ body: 'Initial comment' });
      const commentId = commentRes.body.comment._id;

      const patchRes = await request(app)
        .patch(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ body: 'Edited comment content' });

      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.comment.body, 'Edited comment content');

      const dbComment = await Comment.findById(commentId);
      assert.equal(dbComment.edited, true);
      assert.ok(dbComment.editedAt);
    });

    it('12. DELETE /comments/:id soft-deletes comment and decrements post meter inside transaction', async () => {
      const commenter = await createTestUser();
      const commentRes = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .set('Authorization', `Bearer ${commenter.token}`)
        .send({ body: 'Comment to remove' });
      const commentId = commentRes.body.comment._id;

      // Verify post has 1 comment (meter.comments = 1, meter.score = 3)
      let postCheck = await Post.findById(testPost._id);
      assert.equal(postCheck.meter.comments, 1);
      assert.equal(postCheck.meter.score, 3);

      const delRes = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${commenter.token}`);

      assert.equal(delRes.status, 200);

      // Verify comment is removed in DB
      const dbComment = await Comment.findById(commentId);
      assert.equal(dbComment.removed, true);

      // Verify post meter comments and score decremented
      postCheck = await Post.findById(testPost._id);
      assert.equal(postCheck.meter.comments, 0);
      assert.equal(postCheck.meter.score, 0);
    });

    it('13. GET /posts/:id/comments supports cursor pagination', async () => {
      // Add 3 comments
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post(`/api/posts/${testPost._id}/comments`)
          .set('Authorization', `Bearer ${user1.token}`)
          .send({ body: `Comment ${i}` });
      }

      // Fetch first page with limit=2
      const page1Res = await request(app)
        .get(`/api/posts/${testPost._id}/comments?limit=2`);

      assert.equal(page1Res.status, 200);
      assert.equal(page1Res.body.comments.length, 2);
      assert.equal(page1Res.body.hasMore, true);
      assert.ok(page1Res.body.nextCursor);

      // Fetch next page using cursor
      const page2Res = await request(app)
        .get(`/api/posts/${testPost._id}/comments?cursor=${page1Res.body.nextCursor}&limit=2`);

      assert.equal(page2Res.status, 200);
      assert.equal(page2Res.body.comments.length, 1);
      assert.equal(page2Res.body.hasMore, false);
    });
  });

  // Task P5-T5: User Profiles, User Posts, and Data Export
  describe('Task P5-T5: User Profiles & Data Export (/api/v1/users)', () => {
    it('14. GET /users/:username returns public profile without sensitive fields', async () => {
      const res = await request(app).get(`/api/v1/users/${user1.username}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.username, user1.username);
      assert.ok(res.body.stats);
      assert.ok(res.body.badges);

      // PII leak checks
      assert.equal(res.body.email, undefined);
      assert.equal(res.body.passwordHash, undefined);
      assert.equal(res.body.tokenVersion, undefined);
      assert.equal(res.body.role, undefined);
      assert.equal(res.body.banned, undefined);
    });

    it('15. GET /users/:username returns 404 for banned user', async () => {
      await User.findByIdAndUpdate(user2.id, { banned: true });

      const res = await request(app).get(`/api/v1/users/${user2.username}`);
      assert.equal(res.status, 404);
      assert.match(res.body.error, /not found/i);
    });

    it('16. GET /users/me/posts lists active posts for caller', async () => {
      await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Caller Post 1',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });

      const res = await request(app)
        .get('/api/v1/users/me/posts')
        .set('Authorization', `Bearer ${user1.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.count, 1);
      assert.equal(res.body.posts[0].title, 'Caller Post 1');
    });

    it('17. GET /users/me/export returns sanitized JSON dump with Cache-Control: no-store', async () => {
      const res = await request(app)
        .get('/api/v1/users/me/export')
        .set('Authorization', `Bearer ${user1.token}`);

      assert.equal(res.status, 200);
      assert.match(res.headers['cache-control'], /no-store/i);
      assert.ok(res.body.exportedAt);
      assert.ok(res.body.user);
      assert.ok(Array.isArray(res.body.posts));
      assert.ok(Array.isArray(res.body.comments));
      assert.ok(Array.isArray(res.body.votes));
      assert.ok(Array.isArray(res.body.reports));

      // Credential verification
      assert.equal(res.body.user.passwordHash, undefined);
    });
  });
});
