// backend/test/phase19.test.js
// Tests for Phase 19: Animated Reactions (weight: 5) and Admin Analytics & Config Endpoints.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupTestDb, teardownTestDb, createTestUser } = require('./setup');
const { AuditLog, Post } = require('../models');

describe('Phase 19: Animated Reactions & Admin Dashboard API', () => {
  let userA, userB, moderatorUser, adminUser;
  let testPostId;

  before(async () => {
    await setupTestDb();

    userA = await createTestUser({ username: 'test_p19_author', email: 'author_p19@oddspot.test' });
    userB = await createTestUser({ username: 'test_p19_reactor', email: 'reactor_p19@oddspot.test' });
    moderatorUser = await createTestUser({ username: 'test_p19_mod', email: 'mod_p19@oddspot.test', role: 'moderator' });
    adminUser = await createTestUser({ username: 'test_p19_admin', email: 'admin_p19@oddspot.test', role: 'admin' });

    // Create a test post by User A
    const postRes = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        title: 'Bizarre Rotating Neon Sign',
        body: 'A kinetic neon artifact in an alleyway.',
        latitude: 47.6062,
        longitude: -122.3321,
        city: 'Seattle',
        country: 'United States',
        tags: ['neon', 'kinetic'],
      });

    assert.equal(postRes.status, 201);
    testPostId = postRes.body._id || postRes.body.id;
    assert.ok(testPostId);
  });

  after(async () => {
    await teardownTestDb();
  });

  it('1. POST /posts/:id/react adds +5 to Oddometer score once per user, switches reaction type without double-counting, removes +5 when type is null, and blocks self-reactions (403)', async () => {
    // 1a. User A attempts to self-react on own post -> 403 Forbidden
    const selfReactRes = await request(app)
      .post(`/api/v1/posts/${testPostId}/react`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ type: 'mind_blown' });

    assert.equal(selfReactRes.status, 403);
    assert.match(
      selfReactRes.body.error?.message || selfReactRes.body.message || '',
      /authors cannot react to their own post/i
    );

    // 1b. User B adds initial reaction ('mind_blown') -> meter.reactions = 1, meter.score = 5
    const react1 = await request(app)
      .post(`/api/v1/posts/${testPostId}/react`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ type: 'mind_blown' });

    assert.equal(react1.status, 200);
    assert.equal(react1.body.meter.reactions, 1);
    assert.equal(react1.body.meter.score, 5);
    assert.equal(react1.body.score, 5);

    // Verify DB state
    const postAfterReact1 = await Post.findById(testPostId);
    assert.equal(postAfterReact1.meter.reactions, 1);
    assert.equal(postAfterReact1.meter.score, 5);

    // 1c. User B switches reaction type to 'cursed' -> meter.reactions remains 1, score remains 5
    const reactSwitch = await request(app)
      .post(`/api/v1/posts/${testPostId}/react`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ type: 'cursed' });

    assert.equal(reactSwitch.status, 200);
    assert.equal(reactSwitch.body.meter.reactions, 1);
    assert.equal(reactSwitch.body.meter.score, 5);
    assert.equal(reactSwitch.body.type, 'cursed');

    const postAfterSwitch = await Post.findById(testPostId);
    assert.equal(postAfterSwitch.meter.reactions, 1);
    assert.equal(postAfterSwitch.meter.score, 5);

    // 1d. User B removes reaction (type: null) -> meter.reactions = 0, score = 0
    const reactRemove = await request(app)
      .post(`/api/v1/posts/${testPostId}/react`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ type: null });

    assert.equal(reactRemove.status, 200);
    assert.equal(reactRemove.body.meter.reactions, 0);
    assert.equal(reactRemove.body.meter.score, 0);

    const postAfterRemove = await Post.findById(testPostId);
    assert.equal(postAfterRemove.meter.reactions, 0);
    assert.equal(postAfterRemove.meter.score, 0);
  });

  it('2. GET /admin/analytics and PATCH /admin/config/meter require admin role (403 for member and moderator) and write AuditLog on config update', async () => {
    // 2a. Regular member calling GET /api/v1/admin/analytics -> 403
    const memberAnalytics = await request(app)
      .get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${userA.token}`);

    assert.equal(memberAnalytics.status, 403);

    // 2b. Regular member calling PATCH /api/v1/admin/config/meter -> 403
    const memberConfig = await request(app)
      .patch('/api/v1/admin/config/meter')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ countryThreshold: 75 });

    assert.equal(memberConfig.status, 403);

    // 2c. Moderator calling GET /api/v1/admin/analytics -> 403 (Admin only)
    const modAnalytics = await request(app)
      .get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${moderatorUser.token}`);

    assert.equal(modAnalytics.status, 403);

    // 2d. Moderator calling PATCH /api/v1/admin/config/meter -> 403 (Admin only)
    const modConfig = await request(app)
      .patch('/api/v1/admin/config/meter')
      .set('Authorization', `Bearer ${moderatorUser.token}`)
      .send({ countryThreshold: 75 });

    assert.equal(modConfig.status, 403);

    // 2e. Admin calling GET /api/v1/admin/analytics -> 200 with complete analytics structure
    const adminAnalytics = await request(app)
      .get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${adminUser.token}`);

    assert.equal(adminAnalytics.status, 200);
    assert.ok(Array.isArray(adminAnalytics.body.postsPerCity));
    assert.ok(typeof adminAnalytics.body.totalUsers === 'number');
    assert.ok(typeof adminAnalytics.body.activeUsers7d === 'number');
    assert.ok(typeof adminAnalytics.body.openReportsCount === 'number');
    assert.ok(typeof adminAnalytics.body.postsUnderReviewCount === 'number');
    assert.ok(adminAnalytics.body.tierBreakdown);
    assert.ok(adminAnalytics.body.storageSummary);

    // 2f. Admin calling PATCH /api/v1/admin/config/meter -> 200 and logs AuditLog
    const adminConfigRes = await request(app)
      .patch('/api/v1/admin/config/meter')
      .set('Authorization', `Bearer ${adminUser.token}`)
      .send({
        countryThreshold: 80,
        reason: 'Adjusting country threshold for Phase 19 audit test',
      });

    assert.equal(adminConfigRes.status, 200);
    assert.equal(adminConfigRes.body.config.thresholds.country, 80);

    // Verify AuditLog written
    const auditRecord = await AuditLog.findOne({
      action: 'admin.config.update',
      targetType: 'config',
    }).sort({ createdAt: -1 });

    assert.ok(auditRecord);
    assert.equal(auditRecord.actorId.toString(), adminUser.id.toString());
    assert.equal(auditRecord.reason, 'Adjusting country threshold for Phase 19 audit test');
    assert.equal(auditRecord.meta?.updatedConfig?.thresholds?.country, 80);
  });
});
