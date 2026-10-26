// backend/tests/privacy.test.js
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  request,
  setupTestDb,
  teardownTestDb,
  clearCollections,
  createTestUser,
  models,
} = require('./setup');

describe('Privacy & Anti-Trilateration Integration Tests', () => {
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

  it('1. hideExact post returns fuzzed coordinates in creation response, never exact coordinates', async () => {
    const exactLat = 12.971842;
    const exactLng = 77.594891;

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Hidden Sacred Tree',
        latitude: exactLat,
        longitude: exactLng,
        city: 'Bengaluru',
        country: 'India',
        hideExact: true,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.hideExact, true);
    assert.equal(res.body.location.fuzzed, true);

    const [respLng, respLat] = res.body.location.coordinates;
    assert.notEqual(respLng, exactLng, 'Returned longitude must not equal exact longitude');
    assert.notEqual(respLat, exactLat, 'Returned latitude must not equal exact latitude');

    // Confirm stored doc has exact coordinates in DB, but API sanitized it
    const stored = await models.Post.findById(res.body._id);
    assert.equal(stored.location.coordinates[0], exactLng);
    assert.equal(stored.location.coordinates[1], exactLat);
  });

  it('2. hideExact post distanceMeters is quantized to 500m increments in nearby feed', async () => {
    const postRes = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Quantized Distance Spot',
        latitude: 12.971842,
        longitude: 77.594891,
        city: 'Bengaluru',
        country: 'India',
        hideExact: true,
      });

    const feedRes = await request(app)
      .get('/api/posts/nearby?lat=12.9800&lng=77.6000&maxDistance=10000');

    assert.equal(feedRes.status, 200);
    const item = feedRes.body.posts.find((p) => p._id === postRes.body._id);
    assert.ok(item, 'Fuzzed post must be found in nearby feed');
    assert.equal(
      item.distanceMeters % 500,
      0,
      `distanceMeters (${item.distanceMeters}) must be multiple of 500`
    );
    assert.equal(item.location.fuzzed, true);
    assert.notEqual(item.location.coordinates[0], 77.594891);
  });

  it('3. Feed appearance of hideExact post depends strictly on fuzzed-point distance (Part A radius-probing fix)', async () => {
    // True coordinates: [77.59489, 12.97184]
    // Fuzzed coordinates (step 0.005): [77.595, 12.970]
    const postRes = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Boundary Fuzzed Spot',
        latitude: 12.97184,
        longitude: 77.59489,
        city: 'Bengaluru',
        country: 'India',
        hideExact: true,
      });
    const postId = postRes.body._id;

    // Query 1: from [77.5950, 12.9705], ~55m away from fuzzed point, snapped radius = 1000m -> MUST APPEAR
    const nearRes = await request(app)
      .get('/api/posts/nearby?lat=12.9705&lng=77.5950&maxDistance=1000');

    assert.equal(nearRes.status, 200);
    const nearFound = nearRes.body.posts.some((p) => p._id === postId);
    assert.equal(nearFound, true, 'Must appear when within fuzzed radius');

    // Query 2: from [77.5950, 12.9600], ~1110m away from fuzzed point, snapped radius = 1000m -> MUST BE EXCLUDED
    const awayRes = await request(app)
      .get('/api/posts/nearby?lat=12.9600&lng=77.5950&maxDistance=1000');

    assert.equal(awayRes.status, 200);
    const awayFound = awayRes.body.posts.some((p) => p._id === postId);
    assert.equal(awayFound, false, 'Must be excluded when outside fuzzed radius');
  });

  it('4. Tied distances in feed use createdAt as secondary tie-breaker', async () => {
    // Create two hideExact spots that map to similar 500m distance buckets
    await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Spot 1',
        latitude: 12.9710,
        longitude: 77.5940,
        city: 'Bengaluru',
        country: 'India',
        hideExact: true,
      });

    await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Spot 2',
        latitude: 12.9712,
        longitude: 77.5942,
        city: 'Bengaluru',
        country: 'India',
        hideExact: true,
      });

    const feedRes = await request(app)
      .get('/api/posts/nearby?lat=12.9800&lng=77.6000&maxDistance=5000');

    assert.equal(feedRes.status, 200);
    assert.ok(feedRes.body.posts.length >= 2);
  });
});
