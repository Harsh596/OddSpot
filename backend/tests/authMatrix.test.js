// backend/tests/authMatrix.test.js
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
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

describe('Authorization Matrix Tests', () => {
  let ownerUser;
  let nonOwnerUser;
  let bannedUser;
  let samplePost;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    ownerUser = await createTestUser({ username: 'test_matrix_owner' });
    nonOwnerUser = await createTestUser({ username: 'test_matrix_nonowner' });
    bannedUser = await createTestUser({ username: 'test_matrix_banned', banned: true });

    const postRes = await createTestPost(ownerUser.token, { title: 'Owner Spot' });
    samplePost = postRes.body;
  });

  const protectedEndpoints = [
    {
      name: 'GET /api/auth/me',
      method: 'get',
      getPath: () => '/api/auth/me',
      getBody: () => undefined,
    },
    {
      name: 'POST /api/posts',
      method: 'post',
      getPath: () => '/api/posts',
      getBody: () => ({
        title: 'Matrix Created Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      }),
    },
    {
      name: 'POST /api/posts/:id/vote',
      method: 'post',
      getPath: (postId) => `/api/posts/${postId}/vote`,
      getBody: () => ({ value: 1 }),
    },
    {
      name: 'POST /api/posts/:id/comments',
      method: 'post',
      getPath: (postId) => `/api/posts/${postId}/comments`,
      getBody: () => ({ body: 'Matrix comment body' }),
    },
    {
      name: 'POST /api/posts/:id/report',
      method: 'post',
      getPath: (postId) => `/api/posts/${postId}/report`,
      getBody: () => ({ reason: 'unsafe_or_private' }),
    },
  ];

  describe('1. No Token (Missing Authorization Header)', () => {
    for (const ep of protectedEndpoints) {
      it(`${ep.name} returns 401 with no token`, async () => {
        const req = request(app)[ep.method](ep.getPath(samplePost._id));
        const body = ep.getBody();
        if (body) req.send(body);

        const res = await req;
        assert.equal(res.status, 401);
        assert.match(res.body.error, /token is required/i);
      });
    }
  });

  describe('2. Bad Token (Malformed or Tampered)', () => {
    const badTokens = [
      'Bearer invalid.jwt.string',
      'Bearer not-even-a-jwt',
      // Valid JWT format but signed with wrong secret
      `Bearer ${jwt.sign({ id: '660000000000000000000000' }, 'wrong-secret-key-123456789')}`,
    ];

    for (const ep of protectedEndpoints) {
      it(`${ep.name} returns 401 with bad/tampered token`, async () => {
        for (const token of badTokens) {
          const req = request(app)[ep.method](ep.getPath(samplePost._id))
            .set('Authorization', token);
          const body = ep.getBody();
          if (body) req.send(body);

          const res = await req;
          assert.equal(res.status, 401);
          assert.match(res.body.error, /invalid or expired/i);
        }
      });
    }
  });

  describe('3. Banned User Token', () => {
    for (const ep of protectedEndpoints) {
      it(`${ep.name} returns 403 for suspended/banned user`, async () => {
        const req = request(app)[ep.method](ep.getPath(samplePost._id))
          .set('Authorization', `Bearer ${bannedUser.token}`);
        const body = ep.getBody();
        if (body) req.send(body);

        const res = await req;
        assert.equal(res.status, 403);
        assert.match(res.body.error, /suspended/i);
      });
    }
  });

  describe('4. Non-Owner and Identity Boundary Controls', () => {
    it('POST /api/posts/:id/report - owner is blocked (400), non-owner is permitted (201)', async () => {
      // Owner tries to report own post
      const ownerReport = await request(app)
        .post(`/api/posts/${samplePost._id}/report`)
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({ reason: 'unsafe_or_private' });

      assert.equal(ownerReport.status, 400);
      assert.match(ownerReport.body.error, /cannot report your own post/i);

      // Non-owner reports post
      const nonOwnerReport = await request(app)
        .post(`/api/posts/${samplePost._id}/report`)
        .set('Authorization', `Bearer ${nonOwnerUser.token}`)
        .send({ reason: 'unsafe_or_private' });

      assert.equal(nonOwnerReport.status, 201);
      assert.ok(nonOwnerReport.body.reportId);
    });

    it('GET /api/auth/me returns strictly the authenticated user identity', async () => {
      const resOwner = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ownerUser.token}`);
      assert.equal(resOwner.status, 200);
      assert.equal(resOwner.body.user.username, ownerUser.username);

      const resNonOwner = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${nonOwnerUser.token}`);
      assert.equal(resNonOwner.status, 200);
      assert.equal(resNonOwner.body.user.username, nonOwnerUser.username);
    });

    it('POST /api/posts ignores spoofed authorId in payload and binds to caller token', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${nonOwnerUser.token}`)
        .send({
          title: 'Attempted Spoofed Post',
          authorId: ownerUser.id, // Attempt to spoof owner
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(res.status, 201);
      assert.equal(
        res.body.authorId,
        nonOwnerUser.id,
        'authorId must match token identity, never request body'
      );
    });

    it('POST /api/posts/:id/comments records commenter as author, not post owner', async () => {
      const res = await request(app)
        .post(`/api/posts/${samplePost._id}/comments`)
        .set('Authorization', `Bearer ${nonOwnerUser.token}`)
        .send({ body: 'Non-owner comment' });

      assert.equal(res.status, 201);
      assert.equal(res.body.comment.authorId.username, nonOwnerUser.username);
    });

    it('POST /api/posts/:id/vote records vote under voting user id', async () => {
      const res = await request(app)
        .post(`/api/posts/${samplePost._id}/vote`)
        .set('Authorization', `Bearer ${nonOwnerUser.token}`)
        .send({ value: 1 });

      assert.equal(res.status, 200);
      const voteInDb = await models.Vote.findOne({
        userId: nonOwnerUser.id,
        postId: samplePost._id,
      });
      assert.ok(voteInDb);
      assert.equal(voteInDb.value, 1);
    });
  });
});
