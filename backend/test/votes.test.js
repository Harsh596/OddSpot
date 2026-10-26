// backend/tests/votes.test.js
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

describe('Votes Integration Tests', () => {
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
    user = await createTestUser();
    voter = await createTestUser();
    const postRes = await createTestPost(user.token);
    post = postRes.body;
  });

  it('1. Vote without token returns 401', async () => {
    const res = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .send({ value: 1 });

    assert.equal(res.status, 401);
  });

  it('2. Vote with invalid value returns 400', async () => {
    const res1 = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ value: 5 });
    assert.equal(res1.status, 400);

    const res2 = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ value: 0 });
    assert.equal(res2.status, 400);

    const res3 = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ value: 'up' });
    assert.equal(res3.status, 400);
  });

  it('3. Vote on non-existent post returns 404', async () => {
    const fakeId = '660000000000000000000000';
    const res = await request(app)
      .post(`/api/posts/${fakeId}/vote`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ value: 1 });

    assert.equal(res.status, 404);
  });

  it('4. First like increments meter and calculates score', async () => {
    const res = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${voter.token}`)
      .send({ value: 1 });

    assert.equal(res.status, 200);
    assert.equal(res.body.changed, true);
    assert.equal(res.body.meter.likes, 1);
    assert.equal(res.body.meter.dislikes, 0);
    assert.ok(res.body.score > 0);
  });

  it('5. Like twice returns changed: false (idempotent)', async () => {
    await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${voter.token}`)
      .send({ value: 1 });

    const secondRes = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${voter.token}`)
      .send({ value: 1 });

    assert.equal(secondRes.status, 200);
    assert.equal(secondRes.body.changed, false);
    assert.equal(secondRes.body.meter.likes, 1);
  });

  it('6. Like -> dislike switch moves counters correctly', async () => {
    const firstLike = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${voter.token}`)
      .send({ value: 1 });

    const dislikeRes = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${voter.token}`)
      .send({ value: -1 });

    assert.equal(dislikeRes.status, 200);
    assert.equal(dislikeRes.body.changed, true);
    assert.equal(dislikeRes.body.meter.likes, 0);
    assert.equal(dislikeRes.body.meter.dislikes, 1);
    assert.ok(dislikeRes.body.score < firstLike.body.score);
  });

  it('7. Dislike twice returns changed: false', async () => {
    await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${voter.token}`)
      .send({ value: -1 });

    const secondRes = await request(app)
      .post(`/api/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${voter.token}`)
      .send({ value: -1 });

    assert.equal(secondRes.status, 200);
    assert.equal(secondRes.body.changed, false);
    assert.equal(secondRes.body.meter.dislikes, 1);
  });
});
