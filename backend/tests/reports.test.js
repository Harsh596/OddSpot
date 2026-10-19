// backend/tests/reports.test.js
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

describe('Reports Integration Tests', () => {
  let author;
  let reporter;
  let post;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    author = await createTestUser({ username: 'test_rep_author' });
    reporter = await createTestUser({ username: 'test_rep_user1' });
    const postRes = await createTestPost(author.token);
    post = postRes.body;
  });

  it('1. Report without token returns 401', async () => {
    const res = await request(app)
      .post(`/api/posts/${post._id}/report`)
      .send({ reason: 'unsafe_or_private' });

    assert.equal(res.status, 401);
  });

  it('2. Users cannot report their own post (returns 400)', async () => {
    const res = await request(app)
      .post(`/api/posts/${post._id}/report`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ reason: 'unsafe_or_private' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /cannot report your own post/i);
  });

  it('3. Valid report returns 201', async () => {
    const res = await request(app)
      .post(`/api/posts/${post._id}/report`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({
        reason: 'unsafe_or_private',
        details: 'Private residence gate',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.reportId);
    assert.equal(res.body.autoFuzzed, false);
  });

  it('4. Duplicate report by same user returns 409', async () => {
    await request(app)
      .post(`/api/posts/${post._id}/report`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ reason: 'unsafe_or_private' });

    const dupRes = await request(app)
      .post(`/api/posts/${post._id}/report`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ reason: 'unsafe_or_private' });

    assert.equal(dupRes.status, 409);
    assert.match(dupRes.body.error, /already reported/i);
  });

  it('5. Invalid report reason returns 400', async () => {
    const res = await request(app)
      .post(`/api/posts/${post._id}/report`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ reason: 'invalid_reason_string' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /valid reason is required/i);
  });

  it('6. Post auto-fuzzed (hideExact: true) upon reaching threshold unsafe reports', async () => {
    const r2 = await createTestUser({ username: 'test_rep_user2' });
    const r3 = await createTestUser({ username: 'test_rep_user3' });

    // Report 1
    await request(app)
      .post(`/api/posts/${post._id}/report`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ reason: 'unsafe_or_private' });

    // Report 2
    await request(app)
      .post(`/api/posts/${post._id}/report`)
      .set('Authorization', `Bearer ${r2.token}`)
      .send({ reason: 'unsafe_or_private' });

    // Report 3 (hits threshold 3)
    const rep3Res = await request(app)
      .post(`/api/posts/${post._id}/report`)
      .set('Authorization', `Bearer ${r3.token}`)
      .send({ reason: 'unsafe_or_private' });

    assert.equal(rep3Res.status, 201);
    assert.equal(rep3Res.body.autoFuzzed, true);

    const updatedPost = await models.Post.findById(post._id);
    assert.equal(updatedPost.hideExact, true);
  });

  it('7. Report on non-existent post returns 404', async () => {
    const fakeId = '660000000000000000000000';
    const res = await request(app)
      .post(`/api/posts/${fakeId}/report`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ reason: 'unsafe_or_private' });

    assert.equal(res.status, 404);
  });
});
