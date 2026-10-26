// backend/tests/feed.test.js
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

describe('Nearby Feed Integration Tests', () => {
  let user;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    user = await createTestUser();
  });

  it('1. Nearby feed returns posts sorted by distance', async () => {
    // Spot A: close (~500m away)
    await createTestPost(user.token, {
      title: 'Spot Near',
      latitude: 12.9750,
      longitude: 77.5950,
    });

    // Spot B: further (~2km away)
    await createTestPost(user.token, {
      title: 'Spot Far',
      latitude: 12.9900,
      longitude: 77.5950,
    });

    const res = await request(app)
      .get('/api/posts/nearby?lat=12.9716&lng=77.5946&maxDistance=10000');

    assert.equal(res.status, 200);
    assert.ok(res.body.posts);
    assert.ok(res.body.posts.length >= 2);

    for (let i = 0; i < res.body.posts.length - 1; i++) {
      assert.ok(
        res.body.posts[i].distanceMeters <= res.body.posts[i + 1].distanceMeters,
        `Expected ${res.body.posts[i].distanceMeters} <= ${res.body.posts[i + 1].distanceMeters}`
      );
    }
  });

  it('2. Snapped distance steps used for query radius', async () => {
    // Request with maxDistance=1500 snaps to closest step (e.g. 1000 or 2000)
    const res = await request(app)
      .get('/api/posts/nearby?lat=12.9716&lng=77.5946&maxDistance=1500');

    assert.equal(res.status, 200);
    assert.ok(res.body.radiusMeters === 1000 || res.body.radiusMeters === 2000);
  });

  it('3. Missing or invalid coordinates return 400', async () => {
    // Missing lat
    const res1 = await request(app).get('/api/posts/nearby?lng=77.5946');
    assert.equal(res1.status, 400);

    // Lat > 90
    const res2 = await request(app).get('/api/posts/nearby?lat=95.0&lng=77.5946');
    assert.equal(res2.status, 400);

    // Non-numeric lat
    const res3 = await request(app).get('/api/posts/nearby?lat=abc&lng=77.5946');
    assert.equal(res3.status, 400);
  });

  it('4. NoSQL injection in query parameters returns 400', async () => {
    const res = await request(app).get('/api/posts/nearby?lat[$gt]=0&lng=77.5946');
    assert.equal(res.status, 400);
  });

  it('5. Excludes posts marked as removed', async () => {
    const postRes = await createTestPost(user.token, {
      title: 'Removed Spot',
      latitude: 12.9720,
      longitude: 77.5946,
    });
    const postId = postRes.body._id;

    // Mark post as removed
    await models.Post.findByIdAndUpdate(postId, { removed: true });

    const feedRes = await request(app)
      .get('/api/posts/nearby?lat=12.9716&lng=77.5946&maxDistance=5000');

    assert.equal(feedRes.status, 200);
    const found = feedRes.body.posts.some((p) => p._id === postId);
    assert.equal(found, false, 'Removed post must not appear in nearby feed');
  });

  it('6. Limit param is bounded (default 20, max 50)', async () => {
    const res = await request(app)
      .get('/api/posts/nearby?lat=12.9716&lng=77.5946&limit=100');

    assert.equal(res.status, 200);
    assert.ok(res.body.posts.length <= 50);
  });
});
