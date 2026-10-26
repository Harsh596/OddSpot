// backend/test/phase1.test.js
// Regression test suite for Phase 1 (Prompt 01): Immediate Fixes Without Schema Changes
// Backlog bugs: K2, K3, K4, K5, K6, K8, K9, K12, K13, K14, K16

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
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
const meterService = require('../services/meter');
const { normalizeText } = require('../utils/normalize');
const { parseStrictCoordinate, parseLngLat } = require('../utils/coordinates');

describe('Phase 1 Immediate Fixes Regression Tests (P1: K2-K6, K8, K9, K12-K14, K16)', () => {
  let user1;
  let user2;
  let post;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    user1 = await createTestUser();
    user2 = await createTestUser();
    const postRes = await createTestPost(user1.token);
    post = postRes.body;
  });

  // ============================================================================
  // Task P1-T1 (K13): Text normalization & sanitization
  // ============================================================================
  describe('Task P1-T1 (K13): Text normalization & input sanitization', () => {
    it('normalizes NFKC, strips zero-width chars, control chars, and trims whitespace', () => {
      const input = '  \u200B\u200CHello\uFEFF  World\x07\x1B   ';
      const result = normalizeText(input, { maxLength: 140, fieldName: 'Title' });
      assert.equal(result, 'Hello World');
    });

    it('rejects input containing NUL bytes (\0 / \\u0000) with 400', () => {
      assert.throws(
        () => normalizeText('Bad\0Title', { maxLength: 140, fieldName: 'Title' }),
        (err) => err.statusCode === 400 && /null/i.test(err.message)
      );
    });

    it('enforces maxLength when specified', () => {
      assert.throws(
        () => normalizeText('A'.repeat(141), { maxLength: 140, fieldName: 'Title' }),
        (err) => err.statusCode === 400 && /exceed 140/i.test(err.message)
      );
    });

    it('POST /api/posts rejects title containing only zero-width or control characters with 400', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: '\u200B\u200C\u200D \uFEFF',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /empty|whitespace|characters/i);
    });

    it('POST /api/posts rejects NUL byte in title with 400', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_post\0evil',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /null/i);
    });

    it('POST /api/posts strips zero-width and control characters from title while preserving valid text', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Clean\u200B \u200CPost\x07 Title',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Clean Post Title');
    });
  });

  // ============================================================================
  // Task P1-T2 (K2): Coordinates validation, Null Island rejection, 6-decimal rounding
  // ============================================================================
  describe('Task P1-T2 (K2): Coordinates validation and precision', () => {
    it('parseStrictCoordinate and parseLngLat reject out of bounds and non-numeric coordinates', () => {
      assert.throws(() => parseStrictCoordinate(95, { min: -90, max: 90, name: 'Latitude' }), /between -90 and 90/);
      assert.throws(() => parseStrictCoordinate(-185, { min: -180, max: 180, name: 'Longitude' }), /between -180 and 180/);
      assert.throws(() => parseStrictCoordinate('abc', { min: -90, max: 90, name: 'Latitude' }), /finite number/);
    });

    it('parseLngLat rejects (0, 0) Null Island with 400', () => {
      assert.throws(
        () => parseLngLat([0, 0]),
        (err) => err.statusCode === 400 && /Null Island/i.test(err.message)
      );
    });

    it('parseLngLat rounds coordinates to 6 decimal places', () => {
      const [lng, lat] = parseLngLat([77.594567891, 12.971598765]);
      assert.equal(lng, 77.594568);
      assert.equal(lat, 12.971599);
    });

    it('POST /api/posts rejects Null Island (0, 0) with 400', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_null_island',
          latitude: 0,
          longitude: 0,
          city: 'Null',
          country: 'Ocean',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /Null Island/i);
    });

    it('POST /api/posts stores coordinates rounded to 6 decimal places', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_precision_post',
          latitude: 12.123456789,
          longitude: 77.987654321,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(res.status, 201);
      const coords = res.body.location.coordinates;
      assert.equal(coords[0], 77.987654);
      assert.equal(coords[1], 12.123457);

      // Verify at most 6 decimal places
      coords.forEach((coord) => {
        const decimals = (String(coord).split('.')[1] || '').length;
        assert.ok(decimals <= 6, `Expected <= 6 decimal places, got ${decimals}`);
      });
    });

    it('GET /api/posts/nearby rejects (0, 0) Null Island with 400', async () => {
      const res = await request(app).get('/api/posts/nearby?lat=0&lng=0');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /Null Island/i);
    });
  });

  // ============================================================================
  // Task P1-T3 (K3 Part 1): Enforce max 100 char limit on place fields
  // ============================================================================
  describe('Task P1-T3 (K3 Part 1): Place field length caps (100 chars)', () => {
    it('POST /api/posts rejects city exceeding 100 characters with 400', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_long_city',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'A'.repeat(101),
          country: 'India',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /100 characters/i);
    });

    it('POST /api/posts rejects place.country exceeding 100 characters with 400', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_long_country',
          latitude: 12.9716,
          longitude: 77.5946,
          place: {
            city: 'Bengaluru',
            country: 'B'.repeat(101),
          },
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /100 characters/i);
    });

    it('POST /api/posts accepts place fields with 100 characters exactly', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_max_chars_city',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'C'.repeat(100),
          country: 'India',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.place.city, 'C'.repeat(100));
    });
  });

  // ============================================================================
  // Task P1-T4 (K5): Strict boolean hideExact and strict warnings enum
  // ============================================================================
  describe('Task P1-T4 (K5): Strict hideExact and warnings array validation', () => {
    it('rejects non-boolean hideExact (string or number) with 400', async () => {
      const res1 = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_hide_string',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          hideExact: 'true',
        });
      assert.equal(res1.status, 400);
      assert.match(res1.body.error, /boolean/i);

      const res2 = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_hide_num',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          hideExact: 1,
        });
      assert.equal(res2.status, 400);
      assert.match(res2.body.error, /boolean/i);
    });

    it('rejects invalid warnings values with 400', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_invalid_warning',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          warnings: ['private_property', 'unrecognized_danger'],
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /warning/i);
    });

    it('accepts valid warnings array and boolean hideExact', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_valid_warnings',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          hideExact: true,
          warnings: ['private_property', 'walking_required'],
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.hideExact, true);
      assert.deepEqual(res.body.warnings, ['private_property', 'walking_required']);
    });
  });

  // ============================================================================
  // Task P1-T5 (K9): Image constraints
  // ============================================================================
  describe('Task P1-T5 (K9): Strict image constraints', () => {
    it('rejects post creation with more than 6 images with 400', async () => {
      const images = Array.from({ length: 7 }, (_, i) => `https://example.com/img_${i}.jpg`);
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_too_many_images',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          images,
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /Maximum of 6 images allowed/i);
    });

    it('rejects non-HTTPS image URLs with 400', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_http_image',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          images: ['http://insecure.example.com/pic.jpg'],
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /HTTPS/i);
    });

    it('rejects image URLs exceeding 500 characters with 400', async () => {
      const longUrl = `https://example.com/${'a'.repeat(500)}.jpg`;
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_long_image_url',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          images: [longUrl],
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /500 characters/i);
    });

    it('rejects non-integer, zero, negative, or >10000 width/height with 400', async () => {
      const resNegative = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_negative_dim',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          images: [{ url: 'https://example.com/a.jpg', width: -10 }],
        });
      assert.equal(resNegative.status, 400);

      const resFloat = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_float_dim',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          images: [{ url: 'https://example.com/a.jpg', width: 12.5 }],
        });
      assert.equal(resFloat.status, 400);

      const resTooLarge = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'test_huge_dim',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          images: [{ url: 'https://example.com/a.jpg', width: 15000 }],
        });
      assert.equal(resTooLarge.status, 400);
    });
  });

  // ============================================================================
  // Task P1-T6 (K4, K14): Comment parentId validation & query pagination bounds
  // ============================================================================
  describe('Task P1-T6 (K4, K14): Comment parentId and comments query page validation', () => {
    it('rejects invalid ObjectId parentId with 400', async () => {
      const res = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({
          body: 'Invalid parent ID',
          parentId: 'not-a-valid-hex-id',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /parent/i);
    });

    it('rejects parentId belonging to a different post with 400', async () => {
      const otherPostRes = await createTestPost(user1.token, { title: 'other_post_for_parent' });
      const parentOnOtherPost = await request(app)
        .post(`/api/posts/${otherPostRes.body._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ body: 'Parent on other post' });

      assert.equal(parentOnOtherPost.status, 201);

      const res = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({
          body: 'Reply pointing to different post parent',
          parentId: parentOnOtherPost.body.comment._id,
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /parent comment not found on this post/i);
    });

    it('rejects parentId that is soft-deleted (removed: true) with 400', async () => {
      const parentRes = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ body: 'Parent to be soft-deleted' });

      assert.equal(parentRes.status, 201);
      const parentId = parentRes.body.comment._id;

      // Soft-delete parent
      await models.Comment.findByIdAndUpdate(parentId, { removed: true });

      const res = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({
          body: 'Replying to removed parent',
          parentId,
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /parent comment not found/i);
    });

    it('enforces maximum comment nesting depth of 3 (depth 4 rejected with 400)', async () => {
      // Depth 1: Root comment
      const c1 = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ body: 'Depth 1 Root' });
      assert.equal(c1.status, 201);

      // Depth 2: Reply to root
      const c2 = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ body: 'Depth 2 Reply', parentId: c1.body.comment._id });
      assert.equal(c2.status, 201);

      // Depth 3: Reply to reply
      const c3 = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ body: 'Depth 3 Sub-reply', parentId: c2.body.comment._id });
      assert.equal(c3.status, 201);

      // Depth 4: Reply to depth 3 -> MUST BE REJECTED with 400
      const c4 = await request(app)
        .post(`/api/posts/${post._id}/comments`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ body: 'Depth 4 Forbidden', parentId: c3.body.comment._id });

      assert.equal(c4.status, 400);
      assert.match(c4.body.error, /depth/i);
    });

    it('validates comments query page and limit parameters (integers between 1 and 100)', async () => {
      const resPage0 = await request(app).get(`/api/posts/${post._id}/comments?page=0`);
      assert.equal(resPage0.status, 400);

      const resPage101 = await request(app).get(`/api/posts/${post._id}/comments?page=101`);
      assert.equal(resPage101.status, 400);

      const resPageValid = await request(app).get(`/api/posts/${post._id}/comments?page=1&limit=50`);
      assert.equal(resPageValid.status, 200);
    });
  });

  // ============================================================================
  // Task P1-T7 (K6): Forbid self-voting
  // ============================================================================
  describe('Task P1-T7 (K6): Self-voting prohibition', () => {
    it('returns 403 when post author attempts to vote on their own post', async () => {
      const res = await request(app)
        .post(`/api/posts/${post._id}/vote`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ value: 1 });

      assert.equal(res.status, 403);
      assert.match(res.body.error, /Authors cannot vote on their own post/i);
    });

    it('allows another authenticated user to vote on the post', async () => {
      const res = await request(app)
        .post(`/api/posts/${post._id}/vote`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ value: 1 });

      assert.equal(res.status, 200);
      assert.equal(res.body.changed, true);
    });
  });

  // ============================================================================
  // Task P1-T8 (K8): Atomic single tieredUp trigger in applyDelta
  // ============================================================================
  describe('Task P1-T8 (K8): Atomic tier ratcheting and tieredUp single fire', () => {
    it('fires tieredUp: true exactly once when threshold is crossed', async () => {
      const countryThreshold = 25;
      process.env.METER_COUNTRY_THRESHOLD = String(countryThreshold);

      // Create a fresh post in city tier (6 comments * 3 = 18 score)
      const p = await models.Post.create({
        authorId: user1.id,
        title: 'test_meter_post',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        place: { city: 'Bengaluru', country: 'India' },
        tier: 'city',
        meter: { score: 18, comments: 6 },
      });

      // 1. Delta that does not cross threshold (score becomes 18 + 3 = 21 < 25)
      const res1 = await meterService.applyDelta(p._id, { comments: 1 });
      assert.equal(res1.score, 21);
      assert.equal(res1.tieredUp, false);
      assert.equal(res1.tier, 'city');

      // 2. Delta that crosses threshold (score becomes 21 + 6 = 27 >= 25)
      const res2 = await meterService.applyDelta(p._id, { comments: 2 });
      assert.equal(res2.score, 27);
      assert.equal(res2.tieredUp, true, 'tieredUp must fire when crossing threshold');
      assert.equal(res2.tier, 'country');

      // 3. Subsequent delta while already in country tier (score becomes 30)
      const res3 = await meterService.applyDelta(p._id, { comments: 1 });
      assert.equal(res3.score, 30);
      assert.equal(res3.tieredUp, false, 'tieredUp must NOT fire again once already country tier');
      assert.equal(res3.tier, 'country');
    });

    it('concurrent applyDelta updates crossing threshold trigger tieredUp exactly once', async () => {
      const countryThreshold = 50;
      process.env.METER_COUNTRY_THRESHOLD = String(countryThreshold);

      // 15 comments * 3 = 45 score (< 50 threshold)
      const p = await models.Post.create({
        authorId: user1.id,
        title: 'test_concurrency_tier_post',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        place: { city: 'Bengaluru', country: 'India' },
        tier: 'city',
        meter: { score: 45, comments: 15 },
      });

      // Launch 5 concurrent deltas of 1 comment (+3 points each).
      // Total score will reach 45 + 15 = 60 >= 50.
      const promises = Array.from({ length: 5 }, () =>
        meterService.applyDelta(p._id, { comments: 1 })
      );
      const results = await Promise.all(promises);

      const tieredUpCount = results.filter((r) => r && r.tieredUp).length;
      assert.equal(tieredUpCount, 1, `Expected tieredUp to fire exactly once, but fired ${tieredUpCount} times`);
    });
  });

  // ============================================================================
  // Task P1-T9 (K12): Cache-Control headers
  // ============================================================================
  describe('Task P1-T9 (K12): Cache-Control headers on auth and authenticated requests', () => {
    it('sets Cache-Control: no-store, no-cache, must-revalidate on /api/auth/me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${user1.token}`);

      assert.equal(res.status, 200);
      assert.match(res.headers['cache-control'], /no-store/i);
      assert.match(res.headers['cache-control'], /no-cache/i);
      assert.equal(res.headers['pragma'], 'no-cache');
    });

    it('sets Cache-Control: no-store on any request with an Authorization header', async () => {
      const res = await request(app)
        .get(`/api/posts/${post._id}`)
        .set('Authorization', `Bearer ${user1.token}`);

      assert.equal(res.status, 200);
      assert.match(res.headers['cache-control'], /no-store/i);
      assert.equal(res.headers['pragma'], 'no-cache');
    });
  });

  // ============================================================================
  // Task P1-T10 (K16): Verification of WORKLOG.md accuracy
  // ============================================================================
  describe('Task P1-T10 (K16): WORKLOG documentation accuracy', () => {
    it('WORKLOG.md specifies bcrypt is Blowfish-derived / Eksblowfish, not SHA-512', () => {
      const worklogPath = path.resolve(__dirname, '../../WORKLOG.md');
      const content = fs.readFileSync(worklogPath, 'utf8');

      assert.ok(
        content.includes('Blowfish-derived/Eksblowfish'),
        'WORKLOG.md must specify Blowfish-derived/Eksblowfish'
      );
      assert.ok(
        !content.includes('salted SHA-512 based'),
        'WORKLOG.md must not state bcrypt is SHA-512 based'
      );
    });

    it('WORKLOG.md documents smoke test suite evolution from 23 to 32 checks', () => {
      const worklogPath = path.resolve(__dirname, '../../WORKLOG.md');
      const content = fs.readFileSync(worklogPath, 'utf8');

      assert.ok(
        content.includes('evolved to 32 checks') || content.includes('expanded to 32'),
        'WORKLOG.md must document smoke test evolution from 23 to 32 checks'
      );
    });
  });
});
