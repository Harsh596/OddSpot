// backend/test/redteam2.test.js
// Red-Team Pass 2 Exploit Tests:
// 1. Exploit 1: Hidden location recovery across all endpoints fails to recover true coordinates within 150m.
// 2. Exploit 2: 10 Sybil accounts spamming votes/comments trigger velocity freeze and unique commenter caps.
// 3. Exploit 3: Downvote brigade cannot reduce country tier back to city.
// 4. Exploit 4: Malformed cursor and 25-level deep JSON rejected with 400.
// 5. Exploit 5: Reveal-on-arrival grid probing blocked by 10/day rate limit.

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const { app, request, setupTestDb, teardownTestDb, clearCollections, createTestUser, mongoose } = require('./setup');
const { User, Post, Comment, Vote, AuditLog } = require('../models');
const { getHaversineDistance } = require('../utils/fuzzLocation');
const { resetVelocityTracking } = require('../services/meter');

describe('Red-Team Pass 2: Location Privacy, Meter Brigading & Query Exhaustion', () => {
  let author;

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
    resetVelocityTracking();
    author = await createTestUser({ username: 'test_rt2_author', email: 'test_rt2_author@example.com' });
  });

  // ============================================================================
  // Exploit 1: Hidden location recovery across all endpoints fails within 150m
  // ============================================================================
  describe('Exploit 1: Hidden Location Anti-Trilateration & Sanitization', () => {
    it('fails to recover true coordinates within 150m across all feeds, details, comments, and ETags', async () => {
      const trueLng = 77.5946;
      const trueLat = 12.9716;

      // 1. Author creates a post with hideExact: true
      const postRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${author.token}`)
        .send({
          title: 'Secret Spot',
          body: 'A truly hidden landmark in Bengaluru.',
          latitude: trueLat,
          longitude: trueLng,
          hideExact: true,
          city: 'Bengaluru',
          country: 'India',
        });
      assert.equal(postRes.status, 201);
      const postId = postRes.body._id;

      // Also create a comment on the post
      const commentRes = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${author.token}`)
        .send({ body: 'Public comment on the hidden spot' });
      assert.equal(commentRes.status, 201);

      // --- Endpoint A: GET /api/v1/posts/:id (Single post view)
      const detailRes = await request(app).get(`/api/v1/posts/${postId}`);
      assert.equal(detailRes.status, 200);
      assert.equal(detailRes.body.location.fuzzed, true, 'Location must be flagged fuzzed: true');
      const [fuzzedLng, fuzzedLat] = detailRes.body.location.coordinates;
      const distFromTrueA = getHaversineDistance([trueLng, trueLat], [fuzzedLng, fuzzedLat]);
      assert.ok(
        distFromTrueA >= 150,
        `Single post fuzzed distance must be >= 150m from true coords (got ${distFromTrueA}m)`
      );
      assert.ok(
        !JSON.stringify(detailRes.body).includes('77.5946') &&
          !JSON.stringify(detailRes.body).includes('12.9716'),
        'Single post endpoint must not leak true coordinate strings'
      );

      // --- Endpoint B: GET /api/v1/posts/nearby (Nearby feed)
      const nearbyRes = await request(app).get('/api/v1/posts/nearby?lat=12.9716&lng=77.5946');
      assert.equal(nearbyRes.status, 200);
      assert.ok(nearbyRes.body.posts.length > 0);
      const nearbyPost = nearbyRes.body.posts.find((p) => p._id.toString() === postId.toString());
      assert.ok(nearbyPost, 'Post must appear in nearby feed');
      const distFromTrueB = getHaversineDistance([trueLng, trueLat], nearbyPost.location.coordinates);
      assert.ok(
        distFromTrueB >= 150,
        `Nearby feed fuzzed distance must be >= 150m from true coords (got ${distFromTrueB}m)`
      );
      assert.equal(nearbyPost.distanceMeters % 500, 0, 'Distance must be quantized to 500m multiples');
      assert.equal(nearbyPost.feedLocation, undefined, 'Internal feedLocation must be stripped');

      // --- Endpoint C: GET /api/v1/feed/city (Regional city feed)
      const cityRes = await request(app).get('/api/v1/feed/city?cityKey=bengaluru&countryCode=IN');
      assert.equal(cityRes.status, 200);
      const cityPost = cityRes.body.posts.find((p) => p._id.toString() === postId.toString());
      assert.ok(cityPost, 'Post must appear in city feed');
      const distFromTrueC = getHaversineDistance([trueLng, trueLat], cityPost.location.coordinates);
      assert.ok(distFromTrueC >= 150, 'City feed coordinates must be >= 150m from true coordinates');
      assert.ok(
        !JSON.stringify(cityRes.body).includes('77.5946') &&
          !JSON.stringify(cityRes.body).includes('12.9716'),
        'City feed must not leak true coordinate strings'
      );

      // --- Endpoint D: GET /api/v1/posts/:id/comments (Comments view)
      const commentsRes = await request(app).get(`/api/v1/posts/${postId}/comments`);
      assert.equal(commentsRes.status, 200);
      const rawCommentsText = JSON.stringify(commentsRes.body);
      assert.ok(!rawCommentsText.includes('coordinates'), 'Comments endpoint must not contain coordinate objects');
      assert.ok(!rawCommentsText.includes('77.5946') && !rawCommentsText.includes('12.9716'));

      // --- Endpoint E: GET /api/v1/users/:username (Public profile view)
      const profileRes = await request(app).get(`/api/v1/users/${author.username}`);
      assert.equal(profileRes.status, 200);
      const rawProfileText = JSON.stringify(profileRes.body);
      assert.ok(!rawProfileText.includes('location'), 'Public profile must not leak location fields');

      // --- Endpoint F: Weak ETag Hash Integrity
      const etag = cityRes.headers['etag'];
      assert.ok(etag, 'ETag must be returned for anonymous feed callers');
      assert.match(etag, /^W\/"[0-9a-fA-F]+"/, 'ETag must be weak ETag format');
    });
  });

  // ============================================================================
  // Exploit 2: 10 Sybil accounts spamming votes/comments trigger velocity freeze and unique commenter caps
  // ============================================================================
  describe('Exploit 2: Sybil Meter Brigading & Velocity Freeze', () => {
    it('caps individual commenter score contribution and triggers velocity freeze on 10 Sybil surge', async () => {
      // 1. Author creates a victim post
      const postRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${author.token}`)
        .send({
          title: 'Victim Post',
          body: 'Target of Sybil brigading',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      assert.equal(postRes.status, 201);
      const postId = postRes.body._id;

      // 2. Create 10 distinct Sybil accounts
      const sybils = [];
      for (let i = 1; i <= 10; i++) {
        const sybil = await createTestUser({
          username: `test_rt2_sybil_${i}`,
          email: `sybil_${i}@example.com`,
        });
        sybils.push(sybil);
      }

      // 3. Test unique commenter cap: Sybil 1 attempts to spam 8 comments
      for (let c = 1; c <= 8; c++) {
        const res = await request(app)
          .post(`/api/v1/posts/${postId}/comments`)
          .set('Authorization', `Bearer ${sybils[0].token}`)
          .send({ body: `Spam comment ${c}` });
        assert.equal(res.status, 201);
      }

      // Check victim post meter: comments from Sybil 1 are capped at 1 unique commenter (3 pts max)
      const postAfterSingleSybil = await Post.findById(postId);
      assert.equal(postAfterSingleSybil.meter.comments, 8, 'Stored raw comments count is preserved');
      assert.equal(postAfterSingleSybil.meter.commenters, 1, 'Only 1 unique commenter counted');
      assert.equal(
        postAfterSingleSybil.meter.score,
        3,
        `One user's 8 comments must add only 3 meter points (got ${postAfterSingleSybil.meter.score})`
      );

      // 4. Sybils 2 through 10 spam interactions in rapid succession (triggering >= 10 interactions surge)
      for (let s = 1; s < sybils.length; s++) {
        await request(app)
          .post(`/api/v1/posts/${postId}/vote`)
          .set('Authorization', `Bearer ${sybils[s].token}`)
          .send({ value: 1 });
      }

      // 5. Verify post is automatically velocityFrozen and placed underReview
      const frozenPost = await Post.findById(postId);
      assert.equal(frozenPost.velocityFrozen, true, 'Post must be velocityFrozen following 10 Sybil surge');
      assert.equal(frozenPost.underReview, true, 'Post must be underReview following 10 Sybil surge');

      const frozenScore = frozenPost.meter.score;

      // 6. Any further interaction cannot inflate score while frozen
      const extraSybil = await createTestUser({
        username: 'test_rt2_sybil_11',
        email: 'sybil_11@example.com',
      });
      await request(app)
        .post(`/api/v1/posts/${postId}/vote`)
        .set('Authorization', `Bearer ${extraSybil.token}`)
        .send({ value: 1 });

      const postAfterExtra = await Post.findById(postId);
      assert.equal(
        postAfterExtra.meter.score,
        frozenScore,
        'Meter score must remain frozen while velocityFrozen is active'
      );
    });
  });

  // ============================================================================
  // Exploit 3: Downvote brigade cannot reduce country tier back to city
  // ============================================================================
  describe('Exploit 3: Tier Ratchet Immutability Against Downvote Brigade', () => {
    it('prevents a downvote brigade from reducing country tier back to city', async () => {
      // 1. Create a post elevated to tier='country'
      const post = await Post.create({
        authorId: author.id,
        title: 'Country Tier Monument',
        body: 'Celebrated national landmark',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
        tier: 'country',
        meter: {
          score: 51,
          likes: 51,
          dislikes: 0,
          comments: 0,
          visits: 0,
          reactions: 0,
        },
      });

      assert.equal(post.tier, 'country');

      // 2. 15 brigader accounts downvote the post
      for (let b = 1; b <= 15; b++) {
        const brigader = await createTestUser({
          username: `test_rt2_brigader_${b}`,
          email: `brigader_${b}@example.com`,
        });

        const downvoteRes = await request(app)
          .post(`/api/v1/posts/${post._id}/vote`)
          .set('Authorization', `Bearer ${brigader.token}`)
          .send({ value: -1 });

        assert.equal(downvoteRes.status, 200);
      }

      // 3. Verify post meter score dropped below 50, but tier strictly remains 'country'
      const brigadedPost = await Post.findById(post._id);
      assert.ok(
        brigadedPost.meter.score < 50,
        `Score should have dropped below 50 (got ${brigadedPost.meter.score})`
      );
      assert.equal(
        brigadedPost.tier,
        'country',
        'Tier ratchet guarantee: country tier must never be demoted back to city'
      );
    });
  });

  // ============================================================================
  // Exploit 4: Malformed cursor and 25-level deep JSON rejected with 400
  // ============================================================================
  describe('Exploit 4: Query Exhaustion, Deep Nesting & Malformed Cursors', () => {
    it('rejects malformed base64 cursors with 400 on feed endpoints', async () => {
      // 1. Invalid characters in cursor
      const resBadChars = await request(app).get(
        '/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&cursor=not_a_valid_base64_cursor!!@@##'
      );
      assert.equal(resBadChars.status, 400, 'Malformed cursor encoding must return 400');
      assert.equal(resBadChars.body.code, 'VALIDATION_FAILED');

      // 2. Base64 encoded broken JSON
      const brokenJsonB64 = Buffer.from('{ broken json: ').toString('base64url');
      const resBrokenJson = await request(app).get(
        `/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&cursor=${brokenJsonB64}`
      );
      assert.equal(resBrokenJson.status, 400, 'Broken JSON cursor must return 400');

      // 3. Base64 encoded missing fields
      const missingFieldsB64 = Buffer.from(JSON.stringify({ notAValidStructure: true })).toString('base64url');
      const resMissingFields = await request(app).get(
        `/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&cursor=${missingFieldsB64}`
      );
      assert.equal(resMissingFields.status, 400, 'Invalid payload structure must return 400');

      // 4. Invalid ObjectId in cursor
      const badIdB64 = Buffer.from(JSON.stringify({ v: 10, id: 'bad_id' })).toString('base64url');
      const resBadId = await request(app).get(
        `/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&cursor=${badIdB64}`
      );
      assert.equal(resBadId.status, 400, 'Invalid ObjectId in cursor must return 400');

      // 5. Malformed cursor on comments route
      const post = await Post.create({
        authorId: author.id,
        title: 'Cursor Test Post',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
      });
      const resBadCommentsCursor = await request(app).get(
        `/api/v1/posts/${post._id}/comments?cursor=not-an-id-or-date`
      );
      assert.equal(resBadCommentsCursor.status, 400, 'Malformed comments cursor must return 400');
    });

    it('rejects 25-level deeply nested JSON payloads with 400', async () => {
      // Build 25-level nested object: { level25: { level24: ... { level1: 'data' } } }
      let deepPayload = { leaf: 'exploit_value' };
      for (let i = 24; i >= 1; i--) {
        deepPayload = { nested: deepPayload };
      }

      // Attempt to send deep JSON payload to post creation
      const resDeep = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${author.token}`)
        .send({
          title: 'Deep Nested Attack',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          metadata: deepPayload,
        });

      assert.equal(resDeep.status, 400, '25-level nested payload must return 400');
      assert.equal(resDeep.body.code, 'VALIDATION_FAILED');
      assert.match(resDeep.body.error, /nesting depth/i);
    });
  });

  // ============================================================================
  // Exploit 5: Reveal-on-arrival grid probing blocked by 10/day rate limit
  // ============================================================================
  describe('Exploit 5: GPS Probing & Reveal Rate Limiting', () => {
    it('blocks reveal-on-arrival grid probing attempts at exactly 10 per day', async () => {
      const prober = await createTestUser({
        username: 'test_rt2_prober',
        email: 'prober@example.com',
      });

      // 1. Create 12 hidden spots
      const hiddenPosts = [];
      for (let i = 1; i <= 12; i++) {
        const p = await Post.create({
          authorId: author.id,
          title: `Hidden Spot ${i}`,
          body: `Private coordinates ${i}`,
          location: { type: 'Point', coordinates: [77.5946 + i * 0.001, 12.9716 + i * 0.001] },
          hideExact: true,
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
        });
        hiddenPosts.push(p);
      }

      // 2. Prober reveals spots 1 through 10 with matching proximity (within 300m)
      for (let i = 0; i < 10; i++) {
        const p = hiddenPosts[i];
        const res = await request(app)
          .post(`/api/v1/posts/${p._id}/reveal`)
          .set('Authorization', `Bearer ${prober.token}`)
          .send({
            latitude: p.location.coordinates[1],
            longitude: p.location.coordinates[0],
          });
        assert.equal(res.status, 200, `Reveal ${i + 1} must succeed within daily limit`);
        assert.equal(res.body.location.exact, true);
      }

      // 3. Prober attempts reveal 11 on the same day -> Must return 429
      const p11 = hiddenPosts[10];
      const res11 = await request(app)
        .post(`/api/v1/posts/${p11._id}/reveal`)
        .set('Authorization', `Bearer ${prober.token}`)
        .send({
          latitude: p11.location.coordinates[1],
          longitude: p11.location.coordinates[0],
        });
      assert.equal(res11.status, 429, '11th reveal attempt must be blocked with 429 RATE_LIMIT_EXCEEDED');
      assert.equal(res11.body.code, 'RATE_LIMIT_EXCEEDED');
      assert.match(res11.body.error, /10 spots per day/i);

      // 4. Prober attempts reveal 12 on the same day -> Must also return 429
      const p12 = hiddenPosts[11];
      const res12 = await request(app)
        .post(`/api/v1/posts/${p12._id}/reveal`)
        .set('Authorization', `Bearer ${prober.token}`)
        .send({
          latitude: p12.location.coordinates[1],
          longitude: p12.location.coordinates[0],
        });
      assert.equal(res12.status, 429, '12th reveal attempt must also be blocked with 429');
    });
  });
});
