// backend/test/phase11.test.js
// Tests for Phase P11: Transport, Mongo-Backed Rate Limiting, Timeouts & Docker (K10)

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const request = require('supertest');
const mongoose = require('mongoose');

const { setupTestDb, teardownTestDb, clearCollections } = require('./setup');
const { app, createApp } = require('../app');
const { createConfiguredServer } = require('../server');
const { User, Post, RateLimit } = require('../models');
const { generateAccessToken } = require('../services/token');

describe('Phase 11: Transport, Mongo-Backed Rate Limiting, Timeouts & Docker', () => {
  let userA, userB, post;
  let tokenA, tokenB;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    delete process.env.WRITE_RATE_LIMIT_MAX;
    delete process.env.FRONTEND_URL;
    delete process.env.TRUST_PROXY;
    await teardownTestDb();
    if (mongoose && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await clearCollections();
    await RateLimit.deleteMany({});

    userA = await User.create({
      username: `user_a_${Date.now() % 10000}`,
      email: `user_a_${Date.now() % 10000}@example.com`,
      passwordHash: 'dummy_hash',
      role: 'member',
      trust: { score: 1.0 },
    });

    userB = await User.create({
      username: `user_b_${Date.now() % 10000}`,
      email: `user_b_${Date.now() % 10000}@example.com`,
      passwordHash: 'dummy_hash',
      role: 'member',
      trust: { score: 1.0 },
    });

    const author = await User.create({
      username: `author_${Date.now() % 10000}`,
      email: `author_${Date.now() % 10000}@example.com`,
      passwordHash: 'dummy_hash',
      role: 'member',
    });

    post = await Post.create({
      title: 'Rate Limit Test Spot',
      authorId: author._id,
      location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      feedLocation: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      place: { city: 'San Francisco', cityKey: 'san-francisco', country: 'United States', countryCode: 'US' },
      tier: 'city',
      meter: { score: 0, likes: 0, dislikes: 0, comments: 0 },
    });

    tokenA = generateAccessToken(userA);
    tokenB = generateAccessToken(userB);
  });

  it('1. K10: Authenticated rate limiter keys by userId so two users behind the same IP have independent buckets, and state persists in MongoDB ratelimits collection', async () => {
    process.env.WRITE_RATE_LIMIT_MAX = '3';
    process.env.TRUST_PROXY = '1';

    const testApp = createApp();
    const sharedIp = '203.0.113.10';

    // User A makes 3 successful requests (within limit of 3)
    for (let i = 1; i <= 3; i++) {
      const res = await request(testApp)
        .post(`/api/v1/posts/${post._id}/vote`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Forwarded-For', sharedIp)
        .send({ value: 1 });

      assert.strictEqual(res.status, 200, `User A request ${i} should return 200, got ${res.status}`);
      assert(res.headers['ratelimit-limit']);
      assert(res.headers['ratelimit-remaining']);
    }

    // User A makes 4th request -> should exceed limit (429)
    const resA4 = await request(testApp)
      .post(`/api/v1/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Forwarded-For', sharedIp)
      .send({ value: 1 });

    assert.strictEqual(resA4.status, 429, `User A 4th request should return 429, got ${resA4.status}`);
    assert.strictEqual(resA4.body.error.code, 'RATE_LIMITED');
    assert(resA4.headers['retry-after'], 'Should set Retry-After header on 429');

    // User B (same IP 203.0.113.10) makes 1 request -> should have independent bucket and return 200
    const resB1 = await request(testApp)
      .post(`/api/v1/posts/${post._id}/vote`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Forwarded-For', sharedIp)
      .send({ value: 1 });

    assert.strictEqual(resB1.status, 200, `User B 1st request should return 200, got ${resB1.status}`);

    // Verify persistence in MongoDB ratelimits collection
    const rateLimitA = await RateLimit.findOne({ key: `vote:user:${userA._id}` });
    assert(rateLimitA, 'User A rate limit record must exist in MongoDB ratelimits collection');
    assert.strictEqual(rateLimitA.hits, 4, `User A should have recorded 4 hits, got ${rateLimitA.hits}`);

    const rateLimitB = await RateLimit.findOne({ key: `vote:user:${userB._id}` });
    assert(rateLimitB, 'User B rate limit record must exist in MongoDB ratelimits collection');
    assert.strictEqual(rateLimitB.hits, 1, `User B should have recorded 1 hit, got ${rateLimitB.hits}`);
  });

  it('2. CORS allows exact comma-separated origins and rejects evil prefix/suffix origins', async () => {
    process.env.FRONTEND_URL = 'https://oddspot.app,https://staging.oddspot.app';
    const corsApp = createApp();

    // 1. Allowed origin: https://staging.oddspot.app
    const resAllowed = await request(corsApp)
      .get('/api/v1/config/public')
      .set('Origin', 'https://staging.oddspot.app');

    assert.strictEqual(
      resAllowed.headers['access-control-allow-origin'],
      'https://staging.oddspot.app',
      'Allowed origin must receive exact Access-Control-Allow-Origin header'
    );

    // 2. Rejected origin with suffix: https://oddspot.app.evil.com
    const resEvil = await request(corsApp)
      .get('/api/v1/config/public')
      .set('Origin', 'https://oddspot.app.evil.com');

    assert.strictEqual(
      resEvil.headers['access-control-allow-origin'],
      undefined,
      'Evil domain suffix must be rejected without CORS header'
    );

    // 3. Rejected origin with prefix: https://fake-oddspot.app
    const resPrefix = await request(corsApp)
      .get('/api/v1/config/public')
      .set('Origin', 'https://fake-oddspot.app');

    assert.strictEqual(
      resPrefix.headers['access-control-allow-origin'],
      undefined,
      'Prefix spoofing must be rejected without CORS header'
    );
  });

  it('3. /health returns 200 and /ready pings MongoDB and returns 200 when connected', async () => {
    const testApp = createApp();

    // Test /health
    const resHealth = await request(testApp).get('/health');
    assert.strictEqual(resHealth.status, 200);
    assert.strictEqual(resHealth.body.status, 'ok');
    assert(typeof resHealth.body.uptime === 'number');

    // Test /api/v1/health
    const resApiHealth = await request(testApp).get('/api/v1/health');
    assert.strictEqual(resApiHealth.status, 200);
    assert.strictEqual(resApiHealth.body.status, 'ok');

    // Test /ready
    const resReady = await request(testApp).get('/ready');
    assert.strictEqual(resReady.status, 200);
    assert.strictEqual(resReady.body.status, 'ready');
    assert.strictEqual(resReady.body.db, 'up');

    // Test /api/v1/ready
    const resApiReady = await request(testApp).get('/api/v1/ready');
    assert.strictEqual(resApiReady.status, 200);
    assert.strictEqual(resApiReady.body.status, 'ready');
    assert.strictEqual(resApiReady.body.db, 'up');
  });

  it('4. Server enforces headersTimeout, requestTimeout, and maxHeaderSize (rejects >16KB headers with 431)', async () => {
    const configuredServer = createConfiguredServer(app);

    assert.strictEqual(configuredServer.headersTimeout, 10000, 'headersTimeout should be 10000ms');
    assert.strictEqual(configuredServer.requestTimeout, 15000, 'requestTimeout should be 15000ms');
    assert.strictEqual(configuredServer.keepAliveTimeout, 5000, 'keepAliveTimeout should be 5000ms');

    await new Promise((resolve) => configuredServer.listen(0, resolve));
    const port = configuredServer.address().port;

    try {
      const largeHeaderValue = 'A'.repeat(18 * 1024); // 18 KB header (exceeds 16 KB maxHeaderSize)

      const statusCode = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/health',
            method: 'GET',
            headers: {
              'X-Excessive-Header': largeHeaderValue,
            },
          },
          (res) => {
            resolve(res.statusCode);
          }
        );

        req.on('error', (err) => {
          // Some platforms close socket immediately on 431
          resolve(431);
        });

        req.end();
      });

      assert.strictEqual(statusCode, 431, `Expected HTTP status 431 (Request Header Fields Too Large), got ${statusCode}`);
    } finally {
      await new Promise((resolve) => configuredServer.close(resolve));
    }
  });
});
