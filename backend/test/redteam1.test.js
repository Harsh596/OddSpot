// backend/test/redteam1.test.js
// Red-Team Pass 1 Exploit Tests:
// 1. Exploit Test 1: BOLA/IDOR attempt across all :id routes returning 403
// 2. Exploit Test 2: Mass assignment and prototype pollution payloads rejected or sanitized
// 3. Exploit Test 3: Concurrent refresh token race: only one succeeds, second triggers family revocation
// 4. Exploit Test 4: Alg 'none' and forged kid JWTs rejected with 401
// 5. Exploit Test 5: Rapid mixed vote toggle race leaves counter and reconcile script with 0 drift

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const jwt = require('jsonwebtoken');
const { app, request, setupTestDb, teardownTestDb, clearCollections, createTestUser, mongoose } = require('./setup');
const { User, Post, Comment, Vote, RefreshToken } = require('../models');
const { reconcileCounters } = require('../scripts/reconcileCounters');

describe('Red-Team Pass 1: Auth, IDOR, Mass Assignment & Concurrency', () => {
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
    user1 = await createTestUser(app, { username: 'test_rt_user1', email: 'test_rt_user1@example.com' });
    user2 = await createTestUser(app, { username: 'test_rt_user2', email: 'test_rt_user2@example.com' });
  });

  // ============================================================================
  // Exploit Test 1: BOLA/IDOR attempt across all :id routes returning 403
  // ============================================================================
  describe('Exploit Test 1: BOLA / IDOR Across All :id Routes', () => {
    it('rejects cross-user mutation and deletion attempts with 403', async () => {
      // 1. User 1 creates Post
      const postRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'User1 Original Post',
          body: 'This is User1 private post content',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      assert.equal(postRes.status, 201);
      const postId = postRes.body._id;

      // 2. User 1 creates Comment
      const commentRes = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ body: 'User1 Original Comment' });
      assert.equal(commentRes.status, 201);
      const commentId = commentRes.body.comment._id;

      // --- BOLA Attack 1: User 2 attempts to edit User 1 post via PATCH /api/v1/posts/:id
      const editPostRes = await request(app)
        .patch(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ title: 'Hacked by User 2' });
      assert.equal(editPostRes.status, 403, 'Cross-user post edit must return 403');
      assert.equal(editPostRes.body.code, 'FORBIDDEN');

      // --- BOLA Attack 2: User 2 attempts to delete User 1 post via DELETE /api/v1/posts/:id
      const deletePostRes = await request(app)
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${user2.token}`);
      assert.equal(deletePostRes.status, 403, 'Cross-user post deletion must return 403');
      assert.equal(deletePostRes.body.code, 'FORBIDDEN');

      // --- BOLA Attack 3: User 2 attempts to edit User 1 comment via PATCH /api/v1/comments/:id
      const editCommentRes = await request(app)
        .patch(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ body: 'Hacked comment by User 2' });
      assert.equal(editCommentRes.status, 403, 'Cross-user comment edit must return 403');
      assert.equal(editCommentRes.body.code, 'FORBIDDEN');

      // --- BOLA Attack 4: User 2 attempts to delete User 1 comment via DELETE /api/v1/comments/:id
      const deleteCommentRes = await request(app)
        .delete(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${user2.token}`);
      assert.equal(deleteCommentRes.status, 403, 'Cross-user comment deletion must return 403');
      assert.equal(deleteCommentRes.body.code, 'FORBIDDEN');

      // --- BOLA Attack 5: User 2 attempts to edit nested comment via PATCH /api/v1/posts/:id/comments/:commentId
      const editNestedRes = await request(app)
        .patch(`/api/v1/posts/${postId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ body: 'Hacked nested comment by User 2' });
      assert.equal(editNestedRes.status, 403, 'Cross-user nested comment edit must return 403');
      assert.equal(editNestedRes.body.code, 'FORBIDDEN');

      // --- BOLA Attack 6: User 2 attempts to delete nested comment via DELETE /api/v1/posts/:id/comments/:commentId
      const deleteNestedRes = await request(app)
        .delete(`/api/v1/posts/${postId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${user2.token}`);
      assert.equal(deleteNestedRes.status, 403, 'Cross-user nested comment deletion must return 403');
      assert.equal(deleteNestedRes.body.code, 'FORBIDDEN');

      // --- BOLA Attack 7: Self-voting IDOR prevention: User 1 attempts to vote on their own post
      const selfVoteRes = await request(app)
        .post(`/api/v1/posts/${postId}/vote`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ value: 1 });
      assert.equal(selfVoteRes.status, 403, 'Author self-voting must return 403');
      assert.equal(selfVoteRes.body.code, 'FORBIDDEN');

      // Verify DB state: original post and comment intact, un-tampered, and not removed
      const postInDb = await Post.findById(postId);
      assert.equal(postInDb.title, 'User1 Original Post');
      assert.equal(postInDb.removed, false);

      const commentInDb = await Comment.findById(commentId);
      assert.equal(commentInDb.body, 'User1 Original Comment');
      assert.equal(commentInDb.removed, false);
    });
  });

  // ============================================================================
  // Exploit Test 2: Mass assignment and prototype pollution payloads rejected or sanitized
  // ============================================================================
  describe('Exploit Test 2: Mass Assignment & Prototype Pollution', () => {
    it('sanitizes signup payload and prevents mass assignment of privileged fields', async () => {
      const maliciousSignup = await request(app)
        .post('/api/auth/signup')
        .send({
          username: 'test_rt_attacker',
          email: 'test_rt_attacker@example.com',
          password: 'Password123!',
          role: 'admin',
          banned: false,
          isVerified: true,
          trust: 999,
          tokenVersion: 50,
          stats: { posts: 100 },
        });

      assert.equal(maliciousSignup.status, 201);
      const createdUser = await User.findOne({ username: 'test_rt_attacker' });
      assert.ok(createdUser);
      assert.equal(createdUser.role, 'member', 'Role mass-assignment must be ignored, defaulting to member');
      assert.equal(createdUser.trust, 0, 'Trust score mass-assignment must be ignored');
      assert.equal(createdUser.tokenVersion, 0, 'tokenVersion mass-assignment must be ignored');
      assert.equal(createdUser.stats.posts, 0, 'stats mass-assignment must be ignored');
    });

    it('sanitizes post creation mass assignment payloads containing internal/system fields', async () => {
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Attempt Mass Assignment',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          authorId: '000000000000000000000000',
          removed: true,
          tier: 'country',
          meter: { score: 9999, likes: 999 },
          solved: true,
        });

      assert.equal(res.status, 201);
      const postInDb = await Post.findById(res.body._id);
      assert.ok(postInDb);
      assert.equal(postInDb.authorId.toString(), user1.id, 'authorId must come from token, not body');
      assert.equal(postInDb.removed, false, 'removed must not be settable by client');
      assert.equal(postInDb.tier, 'city', 'tier must not be settable by client');
      assert.equal(postInDb.meter.score, 0, 'meter.score must not be settable by client');
      assert.equal(postInDb.meter.likes, 0, 'meter.likes must not be settable by client');
    });

    it('rejects post update mass assignment modifying immutable coordinates or privacy fields', async () => {
      const createRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Legitimate Post',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      assert.equal(createRes.status, 201);
      const postId = createRes.body._id;

      const patchRes = await request(app)
        .patch(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          latitude: 13.0,
          longitude: 78.0,
          hideExact: true,
          tier: 'country',
          removed: true,
        });

      assert.equal(patchRes.status, 400, 'PATCH modifying coordinates or privacy must return 400');
    });

    it('prevents prototype pollution via __proto__ or constructor payloads', async () => {
      const protoPayload = JSON.stringify({
        title: 'Prototype Pollution Test Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        __proto__: { pollutedProperty: 'pwned', admin: true },
        constructor: { prototype: { rootAdmin: true } },
      });

      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .set('Content-Type', 'application/json')
        .send(protoPayload);

      // Either accepted without pollution or rejected by validator
      assert.ok([201, 400].includes(res.status));

      // Verify Object prototype in Node runtime is NOT polluted
      const testObj = {};
      assert.equal(testObj.pollutedProperty, undefined, 'Prototype must not be polluted with pollutedProperty');
      assert.equal(testObj.admin, undefined, 'Prototype must not be polluted with admin');
      assert.equal(testObj.rootAdmin, undefined, 'Prototype must not be polluted with rootAdmin');
      assert.equal(Object.prototype.pollutedProperty, undefined);
      assert.equal(Object.prototype.admin, undefined);
    });
  });

  // ============================================================================
  // Exploit Test 3: Concurrent refresh token race: only one succeeds, second triggers family revocation
  // ============================================================================
  describe('Exploit Test 3: Concurrent Refresh Token Race & Family Revocation', () => {
    it('allows only one concurrent refresh to succeed and revokes family upon reuse', async () => {
      // 1. Log in to get initial refresh token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user1.username, password: user1.password });
      assert.equal(loginRes.status, 200);
      const initialRefresh = loginRes.body.refreshToken;
      assert.ok(initialRefresh);

      // 2. Fire 2 concurrent refresh requests with the EXACT same refresh token
      const [resA, resB] = await Promise.all([
        request(app).post('/api/auth/refresh').send({ refreshToken: initialRefresh }),
        request(app).post('/api/auth/refresh').send({ refreshToken: initialRefresh }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      // Exactly one succeeds (200) and the second is rejected (401)
      assert.deepEqual(statuses, [200, 401], 'Exactly one concurrent refresh must succeed with 200, one must fail with 401');

      const winningRes = resA.status === 200 ? resA : resB;
      const failingRes = resA.status === 401 ? resA : resB;

      assert.ok(winningRes.body.refreshToken);
      assert.match(failingRes.body.error, /revoked|reuse|invalid/i);

      // 3. Yield execution tick for background revocation to complete
      await new Promise((r) => setImmediate(r));

      // 4. Token family revocation check:
      // Because reuse of initialRefresh was detected by the losing request, the whole family is revoked
      // and user's tokenVersion was incremented
      const dbUser = await User.findById(user1.id);
      assert.ok(dbUser.tokenVersion >= 1, 'tokenVersion must be incremented upon reuse detection');

      // Subsequent attempt with the winning token must fail because family was revoked
      const nextRefreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: winningRes.body.refreshToken });

      assert.equal(nextRefreshRes.status, 401, 'Subsequent use of token from compromised family must be rejected with 401');
    });
  });

  // ============================================================================
  // Exploit Test 4: Alg 'none' and forged kid JWTs rejected with 401
  // ============================================================================
  describe('Exploit Test 4: Alg "none" and Forged "kid" JWT Rejection', () => {
    it('rejects JWT signed with alg "none" with 401', async () => {
      // Craft an alg: "none" JWT
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          id: user1.id,
          username: user1.username,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        })
      ).toString('base64url');
      const algNoneToken = `${header}.${payload}.`;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${algNoneToken}`);

      assert.equal(res.status, 401, 'alg: "none" token must be rejected with 401');
      assert.equal(res.body.code, 'AUTH_INVALID_TOKEN');
    });

    it('rejects JWT specifying an unknown or forged key ID (kid) with 401', async () => {
      // Sign with an untrusted secret and a forged kid header
      const forgedKidToken = jwt.sign(
        {
          id: user1.id,
          username: user1.username,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        },
        'attacker-untrusted-secret-at-least-32-characters-long!',
        {
          algorithm: 'HS256',
          header: { kid: 'forged_malicious_key_identifier_9999' },
        }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forgedKidToken}`);

      assert.equal(res.status, 401, 'JWT with forged kid must be rejected with 401');
      assert.equal(res.body.code, 'AUTH_INVALID_TOKEN');
    });

    it('rejects tampered JWT signature with 401', async () => {
      // Take legitimate token and tamper with the signature
      const legitimateToken = user1.token;
      const parts = legitimateToken.split('.');
      // Alter the signature characters
      parts[2] = parts[2].slice(0, -4) + 'xxxx';
      const tamperedToken = parts.join('.');

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`);

      assert.equal(res.status, 401, 'Tampered token signature must be rejected with 401');
      assert.equal(res.body.code, 'AUTH_INVALID_TOKEN');
    });
  });

  // ============================================================================
  // Exploit Test 5: Rapid mixed vote toggle race leaves counter and reconcile script with 0 drift
  // ============================================================================
  describe('Exploit Test 5: Rapid Mixed Vote Toggle Race & Drift-Free Reconciliation', () => {
    it('executes rapid concurrent like/dislike flips with 0 drift in meter and reconcileCounters', async () => {
      // 1. Author creates post
      const postRes = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1.token}`)
        .send({
          title: 'Concurrency Test Post for Voting Race',
          body: 'Testing counter integrity under rapid vote transitions',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });
      assert.equal(postRes.status, 201);
      const postId = postRes.body._id;

      // 2. Create 5 separate test voters
      const voters = [];
      for (let i = 1; i <= 5; i++) {
        const voter = await createTestUser(app, {
          username: `test_rt_voter_${i}`,
          email: `test_rt_voter_${i}@example.com`,
        });
        voters.push(voter);
      }

      // 3. Prepare rapid mixed vote flip sequences
      // Each voter will rapidly fire sequential/interleaved votes
      const votePromises = [];

      // Voter 0: 1 -> -1 -> 1 -> -1
      votePromises.push(
        (async () => {
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[0].token}`).send({ value: 1 });
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[0].token}`).send({ value: -1 });
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[0].token}`).send({ value: 1 });
          return request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[0].token}`).send({ value: -1 });
        })()
      );

      // Voter 1: -1 -> 1 -> 1 (idempotent)
      votePromises.push(
        (async () => {
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[1].token}`).send({ value: -1 });
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[1].token}`).send({ value: 1 });
          return request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[1].token}`).send({ value: 1 });
        })()
      );

      // Voter 2: 1 -> -1 -> 1
      votePromises.push(
        (async () => {
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[2].token}`).send({ value: 1 });
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[2].token}`).send({ value: -1 });
          return request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[2].token}`).send({ value: 1 });
        })()
      );

      // Voter 3: 1 (single like)
      votePromises.push(
        request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[3].token}`).send({ value: 1 })
      );

      // Voter 4: -1 -> 1 -> -1
      votePromises.push(
        (async () => {
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[4].token}`).send({ value: -1 });
          await request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[4].token}`).send({ value: 1 });
          return request(app).post(`/api/v1/posts/${postId}/vote`).set('Authorization', `Bearer ${voters[4].token}`).send({ value: -1 });
        })()
      );

      // Run all voter workflows concurrently
      const results = await Promise.allSettled(votePromises);
      for (const res of results) {
        assert.equal(res.status, 'fulfilled');
      }

      // 4. Verify Database Source Truth vs Post Meter
      const [actualLikes, actualDislikes] = await Promise.all([
        Vote.countDocuments({ postId, value: 1 }),
        Vote.countDocuments({ postId, value: -1 }),
      ]);

      const cfg = require('../config/meter');
      const expectedScore =
        actualLikes * cfg.weights.like +
        actualDislikes * cfg.weights.dislike;

      const postInDb = await Post.findById(postId);
      assert.equal(
        postInDb.meter.likes,
        actualLikes,
        `post.meter.likes (${postInDb.meter.likes}) must match Vote collection truth (${actualLikes})`
      );
      assert.equal(
        postInDb.meter.dislikes,
        actualDislikes,
        `post.meter.dislikes (${postInDb.meter.dislikes}) must match Vote collection truth (${actualDislikes})`
      );
      assert.equal(
        postInDb.meter.score,
        expectedScore,
        `post.meter.score (${postInDb.meter.score}) must match expected score (${expectedScore})`
      );

      // 5. Run counter reconciliation script in dry-run mode
      const reconcileResult = await reconcileCounters({ apply: false, quiet: true });
      assert.equal(
        reconcileResult.totalWithDrift,
        0,
        `reconcileCounters must detect exactly 0 posts with drift after concurrent race`
      );
    });
  });
});
