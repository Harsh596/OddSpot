// backend/test/phase9.test.js
// Regression test suite for Phase 9:
// - Moderation Queue (GET /api/v1/mod/reports, RBAC 403 for member, AuditLog on every action)
// - Report Actions (remove_content, dismiss, ban_reporter) with trust score recomputation
// - User Ban and Shadow-Ban (POST /api/v1/mod/users/:id/ban, :id/unban, hierarchy checks)
// - Shadow-ban mechanics: author sees own posts/comments/votes, others receive 404/filtered, meter counters stay 0
// - Weighted reports: new low-trust vs mature high-trust account weight and auto-fuzz threshold

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const { app, request, setupTestDb, teardownTestDb, clearCollections, createTestUser, mongoose } = require('./setup');
const { User, Post, Comment, Report, AuditLog, Vote } = require('../models');
const { recomputeUserTrust, getReporterWeight } = require('../services/trust');
const { clearUserCache } = require('../middleware/auth');

describe('Phase 9: Moderation Queue, Weighted Reports, Trust Score & Shadow-Banning', () => {
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
    clearUserCache();
  });

  it('1. Moderation queue lists open reports, enforces moderator/admin role (403 for member), and writes AuditLog on every action', async () => {
    // Member U1 creates post P
    const u1 = await createTestUser({ username: 'test_p9_author', email: 'test_p9_author@example.com' });
    const postRes = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${u1.token}`)
      .send({
        title: 'test_p9 Target Spot with Private Info',
        latitude: 48.8566,
        longitude: 2.3522,
        city: 'Paris',
        country: 'France',
      });
    assert.equal(postRes.status, 201);
    const postId = postRes.body.id || postRes.body._id;

    // Member U2 reports post P
    const u2 = await createTestUser({ username: 'test_p9_reporter', email: 'test_p9_reporter@example.com' });
    const reportRes = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${u2.token}`)
      .send({
        reason: 'doxxing',
        details: 'Confirmed doxxing of private residence',
      });
    assert.equal(reportRes.status, 201);
    const reportId = reportRes.body.reportId;

    // Member U3 attempts GET /api/v1/mod/reports -> 403 Forbidden
    const u3 = await createTestUser({ username: 'test_p9_member', email: 'test_p9_member@example.com' });
    const memberModRes = await request(app)
      .get('/api/v1/mod/reports')
      .set('Authorization', `Bearer ${u3.token}`);
    assert.equal(memberModRes.status, 403);

    // Moderator M calls GET /api/v1/mod/reports -> 200 OK
    const mod = await createTestUser({ username: 'test_p9_mod', email: 'test_p9_mod@example.com', role: 'moderator' });
    const modGetRes = await request(app)
      .get('/api/v1/mod/reports')
      .set('Authorization', `Bearer ${mod.token}`);
    assert.equal(modGetRes.status, 200);
    assert.ok(Array.isArray(modGetRes.body.reports));
    assert.ok(modGetRes.body.reports.some((r) => r.id.toString() === reportId.toString()));

    // Initial trust score snapshots
    const u1InitialUser = await User.findById(u1.id);
    const u2InitialUser = await User.findById(u2.id);
    const u1InitialTrust = typeof u1InitialUser.trust === 'object' ? u1InitialUser.trust.score : 1.0;
    const u2InitialTrust = typeof u2InitialUser.trust === 'object' ? u2InitialUser.trust.score : 1.0;

    // Moderator M applies action: remove_content
    const actionRes = await request(app)
      .post(`/api/v1/mod/reports/${reportId}/action`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({
        action: 'remove_content',
        reason: 'Confirmed doxxing and violation of privacy policy',
      });
    assert.equal(actionRes.status, 200);

    // Assert: Post P is removed: true
    const updatedPost = await Post.findById(postId);
    assert.equal(updatedPost.removed, true);

    // Assert: Report is status: 'resolved'
    const updatedReport = await Report.findById(reportId);
    assert.equal(updatedReport.status, 'resolved');
    assert.equal(updatedReport.resolvedBy.toString(), mod.id.toString());
    assert.ok(updatedReport.resolvedAt);

    // Assert: U2's trust score increases (upheld report), U1's trust score decreases (removed post)
    const u1Final = await User.findById(u1.id);
    const u2Final = await User.findById(u2.id);
    const u1FinalScore = typeof u1Final.trust === 'object' ? u1Final.trust.score : u1Final.trust;
    const u2FinalScore = typeof u2Final.trust === 'object' ? u2Final.trust.score : u2Final.trust;
    assert.ok(u1FinalScore < u1InitialTrust, 'Author penalized for removed content');
    assert.ok(u2FinalScore > u2InitialTrust, 'Reporter rewarded for upheld report');

    // Assert: AuditLog has action: 'mod.report.remove_content'
    const audit = await AuditLog.findOne({
      action: 'mod.report.remove_content',
      targetId: postId,
    });
    assert.ok(audit, 'Audit log entry must be recorded');
    assert.equal(audit.actorId.toString(), mod.id.toString());
    assert.equal(audit.targetType, 'post');
  });

  it('2. Shadow-banned user sees their own posts, comments, and votes, while other users see none of them and post counters do not change', async () => {
    const mod = await createTestUser({ username: 'test_p9_mod2', email: 'test_p9_mod2@example.com', role: 'moderator' });
    const userS = await createTestUser({ username: 'test_p9_spammer', email: 'test_p9_spammer@example.com' });
    const userNormal = await createTestUser({ username: 'test_p9_normal', email: 'test_p9_normal@example.com' });

    // Moderator shadow-bans User S
    const banRes = await request(app)
      .post(`/api/v1/mod/users/${userS.id}/ban`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({
        reason: 'Spam bot',
        shadow: true,
      });
    assert.equal(banRes.status, 200);
    assert.equal(banRes.body.shadowBanned, true);

    // Verify User S in DB is shadow-banned
    const sDoc = await User.findById(userS.id);
    assert.equal(sDoc.shadowBanned, true);

    // Normal user creates public post P1
    const p1Res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${userNormal.token}`)
      .send({
        title: 'test_p9 Public Post One',
        latitude: 51.5074,
        longitude: -0.1278,
        city: 'London',
        country: 'United Kingdom',
      });
    assert.equal(p1Res.status, 201);
    const p1Id = p1Res.body.id || p1Res.body._id;

    // User S creates post SP -> returns 201 with post
    const spRes = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${userS.token}`)
      .send({
        title: 'test_p9 Shadow Post by Spammer',
        latitude: 51.5075,
        longitude: -0.1279,
        city: 'London',
        country: 'United Kingdom',
      });
    assert.equal(spRes.status, 201);
    const spId = spRes.body.id || spRes.body._id;

    // User S sees SP on GET /api/v1/posts/${spId} -> 200 OK
    const getSpAsS = await request(app)
      .get(`/api/v1/posts/${spId}`)
      .set('Authorization', `Bearer ${userS.token}`);
    assert.equal(getSpAsS.status, 200);

    // User Normal receives 404 on GET /api/v1/posts/${spId}
    const getSpAsNormal = await request(app)
      .get(`/api/v1/posts/${spId}`)
      .set('Authorization', `Bearer ${userNormal.token}`);
    assert.equal(getSpAsNormal.status, 404);

    // Anonymous receives 404 on GET /api/v1/posts/${spId}
    const getSpAnon = await request(app).get(`/api/v1/posts/${spId}`);
    assert.equal(getSpAnon.status, 404);

    // User Normal does NOT see SP in /nearby
    const nearbyRes = await request(app)
      .get('/api/v1/posts/nearby?lat=51.5074&lng=-0.1278&maxDistance=5000')
      .set('Authorization', `Bearer ${userNormal.token}`);
    assert.equal(nearbyRes.status, 200);
    const nearbySpots = nearbyRes.body.data || [];
    assert.ok(!nearbySpots.some((p) => p.id === spId || p._id === spId));

    // User Normal does NOT see SP in /feed/city
    const cityRes = await request(app)
      .get('/api/v1/feed/city?cityKey=london&countryCode=GB')
      .set('Authorization', `Bearer ${userNormal.token}`);
    assert.equal(cityRes.status, 200);
    const cityPosts = cityRes.body.posts || [];
    assert.ok(!cityPosts.some((p) => p.id === spId || p._id === spId));

    // User S votes on public post P1
    const voteRes = await request(app)
      .post(`/api/v1/posts/${p1Id}/vote`)
      .set('Authorization', `Bearer ${userS.token}`)
      .send({ value: 1 });
    assert.equal(voteRes.status, 200);

    // User S comments on public post P1
    const commentRes = await request(app)
      .post(`/api/v1/posts/${p1Id}/comments`)
      .set('Authorization', `Bearer ${userS.token}`)
      .send({ body: 'test_p9 Shadow Comment Body' });
    assert.equal(commentRes.status, 201);
    const commentId = commentRes.body.comment?.id || commentRes.body.comment?._id;

    // Assert P1's meter.likes, meter.comments, and meter.score remain 0
    const p1Doc = await Post.findById(p1Id);
    assert.equal(p1Doc.meter.likes, 0, 'Shadow-banned vote must add 0 to likes');
    assert.equal(p1Doc.meter.comments, 0, 'Shadow-banned comment must add 0 to comments');
    assert.equal(p1Doc.meter.score, 0, 'Post score must remain 0');

    // User Normal does NOT see User S's comment on GET /api/v1/posts/${p1Id}/comments
    const normalCommentsRes = await request(app)
      .get(`/api/v1/posts/${p1Id}/comments`)
      .set('Authorization', `Bearer ${userNormal.token}`);
    assert.equal(normalCommentsRes.status, 200);
    assert.ok(!normalCommentsRes.body.comments.some((c) => (c.id || c._id).toString() === commentId.toString()));

    // User S DOES see their own comment on GET /api/v1/posts/${p1Id}/comments
    const sCommentsRes = await request(app)
      .get(`/api/v1/posts/${p1Id}/comments`)
      .set('Authorization', `Bearer ${userS.token}`);
    assert.equal(sCommentsRes.status, 200);
    assert.ok(sCommentsRes.body.comments.some((c) => (c.id || c._id).toString() === commentId.toString()));
  });

  it('3. Weighted reports: low-trust new accounts require more reports to trigger auto-hide than high-trust mature accounts', async () => {
    const author = await createTestUser({ username: 'test_p9_p_author', email: 'test_p9_p_author@example.com' });

    // Create target post with hideExact: false
    const postRes = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        title: 'test_p9 Sensitive Spot Location',
        latitude: 35.6762,
        longitude: 139.6503,
        city: 'Tokyo',
        country: 'Japan',
        hideExact: false,
      });
    assert.equal(postRes.status, 201);
    const postId = postRes.body.id || postRes.body._id;

    // Arrange: 2 new accounts with trust.score = 0.4 (each report weight = 0.5 * 0.4 = 0.2)
    const new1 = await createTestUser({ username: 'test_p9_new1', email: 'test_p9_new1@example.com' });
    const new2 = await createTestUser({ username: 'test_p9_new2', email: 'test_p9_new2@example.com' });
    await User.findByIdAndUpdate(new1.id, {
      trust: { score: 0.4, updatedAt: new Date() },
      createdAt: new Date(),
    });
    await User.findByIdAndUpdate(new2.id, {
      trust: { score: 0.4, updatedAt: new Date() },
      createdAt: new Date(),
    });
    clearUserCache();

    // Act: 2 low-trust reports submitted (weight 0.2 + 0.2 = 0.4 < 3.0)
    const r1 = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${new1.token}`)
      .send({ reason: 'unsafe_or_private', details: 'Private property' });
    assert.equal(r1.status, 201);
    assert.equal(r1.body.weight, 0.2);
    assert.equal(r1.body.autoFuzzed, false);

    const r2 = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${new2.token}`)
      .send({ reason: 'unsafe_or_private', details: 'Private residence' });
    assert.equal(r2.status, 201);
    assert.equal(r2.body.weight, 0.2);
    assert.equal(r2.body.autoFuzzed, false);

    // Assert: hideExact remains false
    const postMid = await Post.findById(postId);
    assert.equal(postMid.hideExact, false);

    // Arrange: 3 mature accounts with trust.score = 1.2 (each report weight = 1.0 * 1.2 = 1.2)
    const matureTenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const m1 = await createTestUser({ username: 'test_p9_m1', email: 'test_p9_m1@example.com' });
    const m2 = await createTestUser({ username: 'test_p9_m2', email: 'test_p9_m2@example.com' });
    const m3 = await createTestUser({ username: 'test_p9_m3', email: 'test_p9_m3@example.com' });

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(m1.id) },
      { $set: { createdAt: matureTenDaysAgo, trust: { score: 1.2, updatedAt: new Date() } } }
    );
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(m2.id) },
      { $set: { createdAt: matureTenDaysAgo, trust: { score: 1.2, updatedAt: new Date() } } }
    );
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(m3.id) },
      { $set: { createdAt: matureTenDaysAgo, trust: { score: 1.2, updatedAt: new Date() } } }
    );
    clearUserCache();

    // Act: 3 mature accounts report. 0.4 + 1.2 + 1.2 + 1.2 = 4.0 >= 3.0
    const mr1 = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${m1.token}`)
      .send({ reason: 'unsafe_or_private', details: 'Private property confirmation 1' });
    assert.equal(mr1.status, 201);
    assert.equal(mr1.body.weight, 1.2);

    const mr2 = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${m2.token}`)
      .send({ reason: 'unsafe_or_private', details: 'Private property confirmation 2' });
    assert.equal(mr2.status, 201);
    assert.equal(mr2.body.weight, 1.2);

    const mr3 = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${m3.token}`)
      .send({ reason: 'unsafe_or_private', details: 'Private property confirmation 3' });
    assert.equal(mr3.status, 201);
    assert.equal(mr3.body.weight, 1.2);

    // Assert: hideExact is now true and feedLocation is fuzzed
    const postFinal = await Post.findById(postId);
    assert.equal(postFinal.hideExact, true);
    assert.ok(postFinal.feedLocation);
    assert.ok(Array.isArray(postFinal.feedLocation.coordinates));
    // True coordinates [139.6503, 35.6762] must NOT equal fuzzed coordinates
    assert.notDeepEqual(postFinal.feedLocation.coordinates, postFinal.location.coordinates);
  });

  it('4. Moderator hierarchy enforcement: moderator cannot ban admin or another moderator', async () => {
    const mod1 = await createTestUser({ username: 'test_p9_mod_actor', email: 'test_p9_mod_actor@example.com', role: 'moderator' });
    const mod2 = await createTestUser({ username: 'test_p9_mod_target', email: 'test_p9_mod_target@example.com', role: 'moderator' });
    const admin = await createTestUser({ username: 'test_p9_admin_target', email: 'test_p9_admin_target@example.com', role: 'admin' });

    // Mod1 attempts to ban Mod2 -> 403 Forbidden
    const res1 = await request(app)
      .post(`/api/v1/mod/users/${mod2.id}/ban`)
      .set('Authorization', `Bearer ${mod1.token}`)
      .send({ reason: 'Attempted ban of peer' });
    assert.equal(res1.status, 403);

    // Mod1 attempts to ban Admin -> 403 Forbidden
    const res2 = await request(app)
      .post(`/api/v1/mod/users/${admin.id}/ban`)
      .set('Authorization', `Bearer ${mod1.token}`)
      .send({ reason: 'Attempted ban of admin' });
    assert.equal(res2.status, 403);
  });

  it('5. Report dismiss action clears underReview and ban_reporter bans false reporter', async () => {
    const mod = await createTestUser({ username: 'test_p9_mod_actions', email: 'test_p9_mod_actions@example.com', role: 'moderator' });
    const author = await createTestUser({ username: 'test_p9_auth_actions', email: 'test_p9_auth_actions@example.com' });
    const reporter = await createTestUser({ username: 'test_p9_false_rep', email: 'test_p9_false_rep@example.com' });

    // Author creates post
    const postRes = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        title: 'test_p9 Post Under Escalation Review',
        latitude: 40.7128,
        longitude: -74.006,
        city: 'New York',
        country: 'United States',
      });
    const postId = postRes.body.id || postRes.body._id;

    // Set post underReview: true
    await Post.findByIdAndUpdate(postId, { underReview: true });

    // Reporter files report
    const repRes = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ reason: 'spam', details: 'Malicious false spam report' });
    const reportId = repRes.body.reportId;

    // Moderator dismisses report
    const dismissRes = await request(app)
      .post(`/api/v1/mod/reports/${reportId}/action`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ action: 'dismiss', reason: 'False spam claim, spot is legitimate' });
    assert.equal(dismissRes.status, 200);

    const postAfterDismiss = await Post.findById(postId);
    assert.equal(postAfterDismiss.underReview, false, 'underReview cleared after all reports dismissed');

    // Author creates second post, reporter files another report, moderator bans false reporter
    const post2Res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        title: 'test_p9 Post Two for Ban Action',
        latitude: 40.7138,
        longitude: -74.007,
        city: 'New York',
        country: 'United States',
      });
    const post2Id = post2Res.body.id || post2Res.body._id;

    const rep2 = await Report.create({
      targetType: 'post',
      targetId: post2Id,
      reporterId: reporter.id,
      reason: 'spam',
      details: 'Repeated harassment report',
      weight: 1.0,
    });

    const banRepRes = await request(app)
      .post(`/api/v1/mod/reports/${rep2._id}/action`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ action: 'ban_reporter', reason: 'Bad faith reporting and harassment' });
    assert.equal(banRepRes.status, 200);

    const reporterDoc = await User.findById(reporter.id);
    assert.equal(reporterDoc.banned, true);
    assert.ok(reporterDoc.tokenVersion > 0);
  });
});
