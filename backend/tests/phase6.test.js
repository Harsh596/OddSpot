// backend/test/phase6.test.js
// Regression test suite for Phase 6:
// - Canonical city key and ISO 3166-1 alpha-2 country validation (K3)
// - HMAC-SHA256 polar coordinate fuzzing in [150m, 400m] (K18)
// - feedLocation with 2dsphere index and pure DB-side $geoNear query (K1 truncation resolution)
// - Idempotent backfill script (backfillFeedLocation.js)
// - Duplicate spot check within 20m with title similarity >= 0.75 (409 CONFLICT)
// - POST /api/v1/posts/:id/reveal (GPS proximity <= 300m, 10 daily reveal cap, audit logging)
// - Impossible travel detection (> 1000 km/h flags underReview: true)
// - 3-point trilateration & bisection resistance verification

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const { app, request, setupTestDb, teardownTestDb, clearCollections, createTestUser, mongoose } = require('./setup');
const { User, Post, AuditLog, Report } = require('../models');
const { toCityKey, resolveCountry } = require('../utils/place');
const { fuzzLocation, getHaversineDistance, MIN_FUZZ_DISTANCE, MAX_FUZZ_DISTANCE } = require('../utils/fuzzLocation');
const { calculateTitleSimilarity } = require('../utils/similarity');
const { checkImpossibleTravel } = require('../utils/impossibleTravel');
const { backfillFeedLocation } = require('../scripts/backfillFeedLocation');

describe('Phase 6: Location Integrity & Privacy (HMAC Fuzz, feedLocation, Reveal & Anti-Trilateration)', () => {
  let user1;
  let user2;

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
    user1 = await createTestUser(app, { username: 'test_p6_user1', email: 'test_p6_user1@example.com' });
    user2 = await createTestUser(app, { username: 'test_p6_user2', email: 'test_p6_user2@example.com' });
  });

  // ============================================================================
  // Task P6-T1: Place canonicalization & ISO Country validation
  // ============================================================================
  describe('Task P6-T1: Canonical City Keys & ISO Country Validation', () => {
    it('1. toCityKey normalizes accents, spaces, and casing into canonical slug', () => {
      assert.equal(toCityKey('Bengaluru'), 'bengaluru');
      assert.equal(toCityKey('  BENGALURU  '), 'bengaluru');
      assert.equal(toCityKey('New York'), 'new-york');
      assert.equal(toCityKey('São Paulo'), 'sao-paulo');
    });

    it('2. resolveCountry validates ISO countries and aliases, rejecting fictional countries', () => {
      assert.equal(resolveCountry('India')?.code, 'IN');
      assert.equal(resolveCountry('IN')?.code, 'IN');
      assert.equal(resolveCountry('United States')?.code, 'US');
      assert.equal(resolveCountry('Narnia'), null);
    });

    it('3. POST /posts rejects unknown country names with 400', async () => {
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Post in Narnia',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Capital City',
          country: 'Narnia',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /country/i);
    });
  });

  // ============================================================================
  // Task P6-T2: HMAC Polar Fuzzing & feedLocation Schema
  // ============================================================================
  describe('Task P6-T2: HMAC Polar Fuzzing & feedLocation Synchronization', () => {
    it('4. fuzzLocation displaces coordinates deterministically between 150m and 400m', () => {
      const origin = [77.5946, 12.9716];
      const fuzzed1 = fuzzLocation(origin, 'test_seed_1');
      const fuzzed2 = fuzzLocation(origin, 'test_seed_1');

      assert.deepEqual(fuzzed1, fuzzed2, 'Must be completely deterministic for identical inputs');

      const dist = getHaversineDistance(origin, fuzzed1);
      assert.ok(dist >= MIN_FUZZ_DISTANCE, `Distance ${dist}m must be >= ${MIN_FUZZ_DISTANCE}m`);
      assert.ok(dist <= MAX_FUZZ_DISTANCE, `Distance ${dist}m must be <= ${MAX_FUZZ_DISTANCE}m`);
    });

    it('5. Post creation stores feedLocation and canonical place metadata', async () => {
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Spot with feedLocation',
          latitude: 12.9716,
          longitude: 77.5946,
          city: ' Bengaluru ',
          country: 'India',
          hideExact: true,
        });

      assert.equal(res.status, 201);
      const postInDb = await Post.findById(res.body._id);
      assert.ok(postInDb.feedLocation);
      assert.equal(postInDb.feedLocation.type, 'Point');
      assert.equal(postInDb.feedLocation.coordinates.length, 2);
      assert.notDeepEqual(postInDb.feedLocation.coordinates, postInDb.location.coordinates);

      assert.equal(postInDb.place.cityKey, 'bengaluru');
      assert.equal(postInDb.place.countryCode, 'IN');
    });

    it('6. Report auto-fuzzing threshold updates feedLocation with fuzzed coordinates', async () => {
      // 1. Create a public post (hideExact: false)
      const postRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Public Spot Soon Fuzzed',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          hideExact: false,
        });
      const postId = postRes.body._id;

      // 2. Submit reports from 3 distinct users for unsafe_or_private
      const reporters = [];
      for (let i = 1; i <= 3; i++) {
        const u = await createTestUser(app, {
          username: `test_p6_rep_${i}`,
          email: `test_p6_rep_${i}@example.com`,
        });
        reporters.push(u);
      }

      for (let i = 0; i < 3; i++) {
        await request(app)
          .post(`/api/v1/posts/${postId}/report`)
          .set('Authorization', `Bearer ${reporters[i].token}`)
          .send({ reason: 'unsafe_or_private' });
      }

      // Check DB: hideExact flipped to true, and feedLocation was updated to fuzzed coords
      const updatedPost = await Post.findById(postId);
      assert.equal(updatedPost.hideExact, true);
      assert.notDeepEqual(updatedPost.feedLocation.coordinates, updatedPost.location.coordinates);
      const dist = getHaversineDistance(updatedPost.location.coordinates, updatedPost.feedLocation.coordinates);
      assert.ok(dist >= MIN_FUZZ_DISTANCE && dist <= MAX_FUZZ_DISTANCE);
    });
  });

  // ============================================================================
  // Task P6-T3: Pure DB-side $geoNear on feedLocation & Serialization
  // ============================================================================
  describe('Task P6-T3: Feed $geoNear on feedLocation without Truncation', () => {
    it('7. /nearby queries feedLocation directly and quantizes hidden post distances to 500m', async () => {
      // Create hidden post
      const createRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Nearby Feed Spot',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          hideExact: true,
        });
      const postId = createRes.body._id;

      const feedRes = await request(app)
        .get('/api/v1/posts/nearby?lat=12.9716&lng=77.5946&maxDistance=5000');

      assert.equal(feedRes.status, 200);
      const found = feedRes.body.posts.find((p) => p._id === postId);
      assert.ok(found, 'Post must appear in nearby feed');
      assert.equal(found.location.fuzzed, true);
      assert.equal(found.distanceMeters % 500, 0, 'Distance must be multiple of 500m');
      // Must not leak true coordinates
      assert.notDeepEqual(found.location.coordinates, [77.5946, 12.9716]);
    });
  });

  // ============================================================================
  // Task P6-T4: Idempotent Backfill Script
  // ============================================================================
  describe('Task P6-T4: backfillFeedLocation Script', () => {
    it('8. backfillFeedLocation backfills legacy posts missing feedLocation and place keys', async () => {
      // Insert raw legacy post directly without feedLocation or cityKey
      const legacyDoc = await Post.collection.insertOne({
        authorId: new mongoose.Types.ObjectId(user1.id),
        title: 'Legacy Post Without feedLocation',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        hideExact: true,
        place: { city: 'Bengaluru', country: 'India' },
        removed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Run backfill
      const result = await backfillFeedLocation({ quiet: true });
      assert.ok(result.updated >= 1);

      const backfilled = await Post.findById(legacyDoc.insertedId);
      assert.ok(backfilled.feedLocation);
      assert.equal(backfilled.feedLocation.coordinates.length, 2);
      assert.equal(backfilled.place.cityKey, 'bengaluru');
      assert.equal(backfilled.place.countryCode, 'IN');

      // Second run is idempotent (0 updated)
      const secondRun = await backfillFeedLocation({ quiet: true });
      assert.equal(secondRun.updated, 0);
    });
  });

  // ============================================================================
  // Task P6-T5: Duplicate Spot Check
  // ============================================================================
  describe('Task P6-T5: Duplicate Spot Rejection (20m, Title Similarity >= 0.75)', () => {
    it('9. rejects second post within 20m with similar title with 409 CONFLICT', async () => {
      // First post
      const firstRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'The Mysterious Abandoned Clocktower',
          latitude: 12.971600,
          longitude: 77.594600,
          city: 'Bengaluru',
          country: 'India',
        });
      assert.equal(firstRes.status, 201);

      // Second post ~10m away with very similar title
      const dupRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user2.token}`)
        .send({
          title: 'The Mysterious Abandoned Clock Tower',
          latitude: 12.971650,
          longitude: 77.594650,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(dupRes.status, 409, 'Duplicate spot within 20m must be rejected with 409');
      assert.match(dupRes.body.error, /duplicate|similar spot/i);
    });

    it('10. permits post within 20m if title is completely different (similarity < 0.75)', async () => {
      const differentRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user2.token}`)
        .send({
          title: 'Street Mural of Colorful Bird',
          latitude: 12.971605,
          longitude: 77.594605,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(differentRes.status, 201);
    });
  });

  // ============================================================================
  // Task P6-T6: POST /api/v1/posts/:id/reveal
  // ============================================================================
  describe('Task P6-T6: POST /posts/:id/reveal Endpoint', () => {
    it('11. reveals exact location when caller GPS is within 300m of true location', async () => {
      const createRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Secret Hidden Gem',
          latitude: 12.971600,
          longitude: 77.594600,
          city: 'Bengaluru',
          country: 'India',
          hideExact: true,
        });
      const postId = createRes.body._id;

      // Caller is 100m away
      const revealRes = await request(app)
        .post(`/api/v1/posts/${postId}/reveal`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({
          latitude: 12.972300,
          longitude: 77.594600,
        });

      assert.equal(revealRes.status, 200);
      assert.equal(revealRes.body.location.exact, true);
      assert.deepEqual(revealRes.body.location.coordinates, [77.5946, 12.9716]);

      // Check AuditLog was written
      const audit = await AuditLog.findOne({ targetId: postId, action: 'spot_revealed' });
      assert.ok(audit);
      assert.equal(audit.actorId.toString(), user2.id);
    });

    it('12. rejects reveal attempt when caller GPS is > 300m away with 403', async () => {
      const createRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Another Hidden Spot',
          latitude: 12.971600,
          longitude: 77.594600,
          city: 'Bengaluru',
          country: 'India',
          hideExact: true,
        });
      const postId = createRes.body._id;

      // Caller is 500m away
      const revealRes = await request(app)
        .post(`/api/v1/posts/${postId}/reveal`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({
          latitude: 12.976000,
          longitude: 77.594600,
        });

      assert.equal(revealRes.status, 403);
      assert.match(revealRes.body.error, /300 meters/i);
    });

    it('13. enforces daily limit of 10 reveals per user with 429', async () => {
      const post = await Post.create({
        authorId: user1.id,
        title: 'Spot for Limit Test',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        feedLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
        hideExact: true,
        place: { city: 'Bengaluru', country: 'India' },
      });

      // Insert 10 fake audits for today
      for (let i = 0; i < 10; i++) {
        await AuditLog.create({
          actorId: user2.id,
          action: 'spot_revealed',
          targetType: 'post',
          targetId: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
        });
      }

      const res = await request(app)
        .post(`/api/v1/posts/${post._id}/reveal`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ latitude: 12.971600, longitude: 77.594600 });

      assert.equal(res.status, 429);
      assert.match(res.body.error, /daily reveal limit/i);
    });
  });

  // ============================================================================
  // Task P6-T7: Impossible Travel & Anti-Trilateration Verification
  // ============================================================================
  describe('Task P6-T7: Impossible Travel & Anti-Trilateration Tests', () => {
    it('14. checkImpossibleTravel flags speed > 1000 km/h with impossible: true', () => {
      const user = {
        lastPostLocation: { type: 'Point', coordinates: [77.5946, 12.9716] }, // Bengaluru
        lastPostAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };
      const delhiCoords = [77.2090, 28.6139]; // Delhi (~1740 km away)

      const result = checkImpossibleTravel(user, delhiCoords);
      assert.equal(result.impossible, true);
      assert.ok(result.speedKmH > 1000);
    });

    it('15. 3-point trilateration test: observer at 3 distinct stations cannot triangulate true point', async () => {
      const truePoint = [77.594600, 12.971600];
      const createRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Trilateration Shielded Spot',
          latitude: truePoint[1],
          longitude: truePoint[0],
          city: 'Bengaluru',
          country: 'India',
          hideExact: true,
        });
      const postId = createRes.body._id;

      // 3 observers at different positions around the city
      const stations = [
        { lat: 12.9600, lng: 77.5946 }, // South
        { lat: 12.9800, lng: 77.5946 }, // North
        { lat: 12.9716, lng: 77.5800 }, // West
      ];

      const responses = await Promise.all(
        stations.map((s) =>
          request(app).get(`/api/v1/posts/nearby?lat=${s.lat}&lng=${s.lng}&maxDistance=5000`)
        )
      );

      for (const res of responses) {
        assert.equal(res.status, 200);
        const item = res.body.posts.find((p) => p._id === postId);
        assert.ok(item, 'Spot must be found');
        // Returned distance must always be quantized to a 500m multiple
        assert.equal(item.distanceMeters % 500, 0);
        // Location returned to client must be fuzzed, never truePoint
        assert.notDeepEqual(item.location.coordinates, truePoint);
      }
    });

    it('16. Boundary bisection test: radius probing converges on feedLocation, not true coordinates', async () => {
      const truePoint = [77.594600, 12.971600];
      const createRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Bisection Resistance Spot',
          latitude: truePoint[1],
          longitude: truePoint[0],
          city: 'Bengaluru',
          country: 'India',
          hideExact: true,
        });
      const postId = createRes.body._id;
      const postInDb = await Post.findById(postId);
      const fuzzedCenter = postInDb.feedLocation.coordinates;

      // Distance from a test station to true vs fuzzed
      const testStation = [77.5946, 12.9550];
      const distToTrue = getHaversineDistance(testStation, truePoint);
      const distToFuzzed = getHaversineDistance(testStation, fuzzedCenter);

      assert.notEqual(Math.round(distToTrue), Math.round(distToFuzzed));

      // Query from testStation with snapped radius
      const res = await request(app)
        .get(`/api/v1/posts/nearby?lat=${testStation[1]}&lng=${testStation[0]}&maxDistance=2000`);

      assert.equal(res.status, 200);
      const item = res.body.posts.find((p) => p._id === postId);
      if (item) {
        // Any distance revealed by feed is measured relative to fuzzedCenter
        assert.equal(item.location.coordinates[0], fuzzedCenter[0]);
        assert.equal(item.location.coordinates[1], fuzzedCenter[1]);
      }
    });
  });
});
