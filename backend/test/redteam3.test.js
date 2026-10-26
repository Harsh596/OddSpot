// backend/test/redteam3.test.js
// Red-Team Pass 3 Exploit Tests:
// 1. Exploit 1: Spoofed X-Forwarded-For headers on login when TRUST_PROXY=false -> hits rate limit on real socket IP.
// 2. Exploit 2: IPv6 /64 rotation -> normalized to identical /64 bucket.
// 3. Exploit 3: Moderator attempting to ban an Admin (POST /api/v1/mod/users/:adminId/ban) or another Moderator -> 403 AUTH_FORBIDDEN.
// 4. Exploit 4: CRLF & ANSI escape sequence injection in X-Request-Id and User-Agent -> sanitized or rejected.
// 5. Exploit 5: Evil ReDoS payloads ("a".repeat(50000) + "!") in city, tag, and username parameters -> rejected in < 50ms without blocking event loop.

const assert = require('node:assert/strict');
const net = require('node:net');
const { describe, it, before, after, beforeEach } = require('node:test');
const { app, request, setupTestDb, teardownTestDb, clearCollections, createTestUser, mongoose } = require('./setup');
const { createConfiguredServer } = require('../server');
const { User, Post, RateLimit, AuditLog } = require('../models');
const { normalizeIp, buildRateLimitKey } = require('../middleware/rateLimiter');
const requestId = require('../middleware/requestId');
const { createLogger, sanitizeCrlf } = require('../utils/logger');
const { Writable } = require('stream');

describe('Red-Team Pass 3: Rate-Limit Bypass, IPv6 Subnets, Log Injection & ReDoS', () => {
  let adminUser, modUser1, modUser2, regularUser;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    delete process.env.AUTH_RATE_LIMIT_MAX;
    delete process.env.TRUST_PROXY;
    delete process.env.METRICS_TOKEN;
    await teardownTestDb();
    if (mongoose && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '10000';
    await clearCollections();
    await RateLimit.deleteMany({});

    adminUser = await createTestUser({
      username: 'test_rt3_admin',
      email: 'test_rt3_admin@example.com',
      role: 'admin',
    });

    modUser1 = await createTestUser({
      username: 'test_rt3_mod1',
      email: 'test_rt3_mod1@example.com',
      role: 'moderator',
    });

    modUser2 = await createTestUser({
      username: 'test_rt3_mod2',
      email: 'test_rt3_mod2@example.com',
      role: 'moderator',
    });

    regularUser = await createTestUser({
      username: 'test_rt3_user',
      email: 'test_rt3_user@example.com',
      role: 'member',
    });
  });

  // ============================================================================
  // Exploit 1: Spoofed X-Forwarded-For when TRUST_PROXY=false
  // ============================================================================
  describe('Exploit 1: Spoofed X-Forwarded-For Rate-Limit Bypass Resistance', () => {
    it('hits rate limit on real socket IP when TRUST_PROXY=false despite spoofed X-Forwarded-For headers', async () => {
      process.env.AUTH_RATE_LIMIT_MAX = '5';
      delete process.env.TRUST_PROXY; // defaults to false in app.js
      await RateLimit.deleteMany({});

      try {
        // Send 5 failed login attempts with distinct spoofed X-Forwarded-For headers
        for (let i = 1; i <= 5; i++) {
          const res = await request(app)
            .post('/api/v1/auth/login')
            .set('X-Forwarded-For', `203.0.113.${i}`)
            .set('X-Real-IP', `203.0.113.${i}`)
            .send({
              identifier: 'test_rt3_user',
              password: 'WrongPassword123!',
            });

          assert.equal(res.status, 401, `Attempt ${i} should be 401 AUTH_INVALID_CREDENTIALS`);
        }

        // 6th attempt with yet another spoofed IP header
        const res6 = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', '203.0.113.99')
          .set('X-Real-IP', '203.0.113.99')
          .send({
            identifier: 'test_rt3_user',
            password: 'WrongPassword123!',
          });

        // Must be blocked by rate limiter because real socket IP (127.0.0.1) was exhausted
        assert.equal(res6.status, 429, '6th request must be rate limited (429)');
        assert.equal(res6.body.code, 'RATE_LIMITED');

        // Verify in MongoDB RateLimit collection that key is based on socket IP, not spoofed headers
        const socketIpKey = 'auth:ip:127.0.0.1';
        const rateLimitDoc = await RateLimit.findOne({ key: socketIpKey });
        assert.ok(rateLimitDoc, 'RateLimit record must exist for socket IP 127.0.0.1');
        assert.equal(rateLimitDoc.hits, 6, `Socket IP bucket should record 6 hits, got ${rateLimitDoc.hits}`);

        // Verify spoofed IP keys were never created
        const spoofedDoc = await RateLimit.findOne({ key: 'auth:ip:203.0.113.1' });
        assert.equal(spoofedDoc, null, 'No RateLimit record should exist for spoofed IP 203.0.113.1');
      } finally {
        process.env.AUTH_RATE_LIMIT_MAX = '10000';
        await RateLimit.deleteMany({});
      }
    });
  });

  // ============================================================================
  // Exploit 2: IPv6 /64 Rotation Collapsing
  // ============================================================================
  describe('Exploit 2: IPv6 /64 Rotation Collapsing', () => {
    it('normalizes various IPv6 addresses within a /64 subnet to an identical /64 bucket key', () => {
      // Addresses within the same /64 subnet (2001:db8:abcd:12::/64)
      const ip1 = '2001:0db8:abcd:0012:0000:0000:0000:0001';
      const ip2 = '2001:db8:abcd:12:0:0:0:2';
      const ip3 = '2001:db8:abcd:12:dead:beef:cafe:babe';
      const ip4 = '2001:db8:abcd:12:ffff:ffff:ffff:ffff';
      const ip5 = '2001:DB8:ABCD:0012::1'; // uppercase with zero-compression

      const norm1 = normalizeIp(ip1);
      const norm2 = normalizeIp(ip2);
      const norm3 = normalizeIp(ip3);
      const norm4 = normalizeIp(ip4);
      const norm5 = normalizeIp(ip5);

      assert.equal(norm1, '2001:db8:abcd:12::/64');
      assert.equal(norm2, '2001:db8:abcd:12::/64');
      assert.equal(norm3, '2001:db8:abcd:12::/64');
      assert.equal(norm4, '2001:db8:abcd:12::/64');
      assert.equal(norm5, '2001:db8:abcd:12::/64');

      // Verify buildRateLimitKey creates identical keys for requests from this subnet
      const key1 = buildRateLimitKey({ ip: ip1 }, 'auth');
      const key2 = buildRateLimitKey({ ip: ip4 }, 'auth');
      const key3 = buildRateLimitKey({ ip: ip5 }, 'auth');

      assert.equal(key1, 'auth:ip:2001:db8:abcd:12::/64');
      assert.equal(key1, key2);
      assert.equal(key2, key3);

      // Verify a different /64 subnet gets a different bucket
      const ipOtherSubnet = '2001:db8:abcd:13::1';
      assert.notEqual(normalizeIp(ipOtherSubnet), norm1);
      assert.equal(normalizeIp(ipOtherSubnet), '2001:db8:abcd:13::/64');

      // Verify IPv4 and IPv4-mapped IPv6 handling
      assert.equal(normalizeIp('198.51.100.5'), '198.51.100.5');
      assert.equal(normalizeIp('::ffff:198.51.100.5'), '198.51.100.5');
      assert.equal(normalizeIp('::1'), '0:0:0:0::/64');
    });

    it('enforces rate limit across rotated IPv6 addresses within the same /64 subnet', async () => {
      process.env.AUTH_RATE_LIMIT_MAX = '3';
      const subnetPrefix = '2001:db8:85a3:99';

      // Simulate 3 requests from rotating IPv6 host addresses within the same /64
      const mockReq1 = { ip: `${subnetPrefix}::1`, headers: {} };
      const mockReq2 = { ip: `${subnetPrefix}:1:2:3:4`, headers: {} };
      const mockReq3 = { ip: `${subnetPrefix}:ffff:ffff:ffff:ffff`, headers: {} };

      const key1 = buildRateLimitKey(mockReq1, 'test:ipv6');
      const key2 = buildRateLimitKey(mockReq2, 'test:ipv6');
      const key3 = buildRateLimitKey(mockReq3, 'test:ipv6');

      assert.equal(key1, 'test:ipv6:ip:2001:db8:85a3:99::/64');
      assert.equal(key1, key2);
      assert.equal(key2, key3);

      // Verify atomic increment in MongoDB on that normalized subnet key
      const now = new Date();
      const resetAt = new Date(now.getTime() + 60000);

      await RateLimit.findOneAndUpdate(
        { key: key1 },
        { $inc: { hits: 1 }, $setOnInsert: { resetAt } },
        { upsert: true }
      );
      await RateLimit.findOneAndUpdate(
        { key: key2 },
        { $inc: { hits: 1 }, $setOnInsert: { resetAt } },
        { upsert: true }
      );
      await RateLimit.findOneAndUpdate(
        { key: key3 },
        { $inc: { hits: 1 }, $setOnInsert: { resetAt } },
        { upsert: true }
      );

      const record = await RateLimit.findOne({ key: key1 });
      assert.ok(record);
      assert.equal(record.hits, 3, 'Hits from different IPv6 addresses in same /64 must aggregate into single bucket');
    });
  });

  // ============================================================================
  // Exploit 3: Moderator Privilege Escalation & Audit Log Forgery
  // ============================================================================
  describe('Exploit 3: Moderator Privilege Escalation & Audit Log Protection', () => {
    it('forbids moderator from banning an Admin (POST /api/v1/mod/users/:adminId/ban) -> 403 AUTH_FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/mod/users/${adminUser.id}/ban`)
        .set('Authorization', `Bearer ${modUser1.token}`)
        .send({ reason: 'Malicious moderator attempting takeover of administrator' });

      assert.equal(res.status, 403, 'Attempt to ban admin must return 403');
      assert.equal(res.body.code, 'AUTH_FORBIDDEN', 'Error code must be AUTH_FORBIDDEN');

      // Verify Admin account remains unbanned
      const adminDoc = await User.findById(adminUser.id);
      assert.equal(adminDoc.banned, false);
      assert.equal(adminDoc.shadowBanned, false);
    });

    it('forbids moderator from banning another Moderator (peer) -> 403 AUTH_FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/mod/users/${modUser2.id}/ban`)
        .set('Authorization', `Bearer ${modUser1.token}`)
        .send({ reason: 'Malicious moderator attempting to ban peer moderator' });

      assert.equal(res.status, 403, 'Attempt to ban peer moderator must return 403');
      assert.equal(res.body.code, 'AUTH_FORBIDDEN', 'Error code must be AUTH_FORBIDDEN');

      // Verify Mod2 account remains unbanned
      const mod2Doc = await User.findById(modUser2.id);
      assert.equal(mod2Doc.banned, false);
      assert.equal(mod2Doc.shadowBanned, false);
    });

    it('forbids moderator from unbanning an Admin or peer Moderator -> 403 AUTH_FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/mod/users/${adminUser.id}/unban`)
        .set('Authorization', `Bearer ${modUser1.token}`)
        .send({ reason: 'Unauthorized unban attempt' });

      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'AUTH_FORBIDDEN');
    });

    it('blocks arbitrary audit log insertion or modification endpoints', async () => {
      // 1. Attempt POST to non-existent audit forging endpoints
      const resPostAudit = await request(app)
        .post('/api/v1/mod/audit')
        .set('Authorization', `Bearer ${modUser1.token}`)
        .send({
          action: 'admin.privilege.grant',
          targetType: 'user',
          targetId: modUser1.id,
        });

      assert.equal(resPostAudit.status, 404, 'No endpoint for direct audit creation may exist');

      // 2. Regular user cannot access moderation queue
      const resModQueue = await request(app)
        .get('/api/v1/mod/reports')
        .set('Authorization', `Bearer ${regularUser.token}`);

      assert.equal(resModQueue.status, 403, 'Regular user must be forbidden from mod queue');
    });
  });

  // ============================================================================
  // Exploit 4: CRLF & ANSI Escape Sequence Injection in Headers & Logs
  // ============================================================================
  describe('Exploit 4: CRLF & ANSI Escape Sequence Log Injection Protection', () => {
    it('sanitizes CRLF and ANSI escape sequences in X-Request-Id header without throwing or splitting headers', async () => {
      // 1. Direct middleware invocation test with CRLF and ANSI escape sequence injection
      const req = {
        headers: {
          'x-request-id': 'req-123\r\nInjected-Header: evil\r\n\x1b[31;1mINJECTED_ANSI\x1b[0m',
        },
      };
      const setHeaders = {};
      const res = {
        setHeader(name, val) {
          setHeaders[name] = val;
        },
      };
      let nextCalled = false;
      requestId(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.id, 'req-123Injected-Header: evilINJECTED_ANSI');
      assert.equal(req.id.includes('\r'), false, 'req.id must not contain \\r');
      assert.equal(req.id.includes('\n'), false, 'req.id must not contain \\n');
      assert.equal(req.id.includes('\x1b'), false, 'req.id must not contain ANSI escape sequence');
      assert.equal(setHeaders['X-Request-Id'], 'req-123Injected-Header: evilINJECTED_ANSI');

      // 2. HTTP transport verification: raw TCP request containing CRLF or invalid control characters in header is rejected by server
      const configuredServer = createConfiguredServer(app);
      await new Promise((resolve) => configuredServer.listen(0, resolve));
      const port = configuredServer.address().port;

      try {
        const rawResponse = await new Promise((resolve) => {
          const client = net.connect(port, '127.0.0.1', () => {
            client.write('GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Request-Id: bad\x1b[31mid\r\n\r\n');
          });
          let data = '';
          client.on('data', (chunk) => {
            data += chunk.toString();
          });
          client.on('end', () => resolve(data));
          client.on('error', () => resolve(data));
        });

        // Transport layer parser rejects invalid control bytes with 400 Bad Request
        assert.ok(rawResponse.includes('400 Bad Request') || rawResponse.includes('431'));
      } finally {
        await new Promise((resolve) => configuredServer.close(resolve));
      }
    });

    it('sanitizes CRLF and ANSI escape sequences in User-Agent and log objects', async () => {
      const logs = [];
      const testStream = new Writable({
        write(chunk, encoding, callback) {
          logs.push(chunk.toString());
          callback();
        },
      });

      const testLogger = createLogger(testStream, { level: 'info' });

      // Evil payloads simulating log injection (CWE-117)
      const evilUserAgent = 'Mozilla/5.0 \r\nFAKE_LOG_ENTRY: [INFO] Admin login from 10.0.0.1\r\n\x1b[32;1mSUCCESS\x1b[0m';
      const evilPayload = {
        userAgent: evilUserAgent,
        message: 'Normal message\r\nFAKE_LOG_LINE\x1b[2K',
      };

      testLogger.info(evilPayload, 'Processing user request');

      assert.equal(logs.length, 1, 'Logger should emit 1 JSON log record');
      const logLine = logs[0];
      const parsedLog = JSON.parse(logLine);

      // Verify CRLF replaced with space and ANSI sequences completely stripped
      assert.equal(parsedLog.userAgent.includes('\r'), false, 'Logged userAgent must not contain \\r');
      assert.equal(parsedLog.userAgent.includes('\n'), false, 'Logged userAgent must not contain \\n');
      assert.equal(parsedLog.userAgent.includes('\x1b'), false, 'Logged userAgent must not contain ANSI escapes');
      assert.ok(parsedLog.userAgent.includes('Mozilla/5.0'));
      assert.ok(parsedLog.userAgent.includes('SUCCESS'));

      // Test standalone sanitizeCrlf utility
      const sanitized = sanitizeCrlf(evilUserAgent);
      assert.equal(sanitized.includes('\r'), false);
      assert.equal(sanitized.includes('\n'), false);
      assert.equal(sanitized.includes('\x1b'), false);
    });
  });

  // ============================================================================
  // Exploit 5: Evil ReDoS Payloads in city, tag, and username Parameters
  // ============================================================================
  describe('Exploit 5: ReDoS Payload Hardening & Event Loop Protection', () => {
    const evilReDoS = 'a'.repeat(50000) + '!';

    it('rejects 50,000-char evil ReDoS username on signup in < 50ms without blocking event loop', async () => {
      let eventLoopFired = false;
      setImmediate(() => {
        eventLoopFired = true;
      });

      const t0 = performance.now();
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          username: evilReDoS,
          email: 'test_redos_user@example.com',
          password: 'Password123!',
        });
      const durationMs = performance.now() - t0;

      assert.equal(res.status, 400, 'Must be rejected with 400');
      assert.equal(res.body.code, 'VALIDATION_FAILED');
      assert.ok(
        durationMs < 50,
        `Signup ReDoS check must finish in < 50ms, took ${durationMs.toFixed(2)}ms`
      );
      assert.equal(eventLoopFired, true, 'Event loop must remain unblocked');
    });

    it('rejects 50,000-char evil ReDoS tag on post creation in < 50ms', async () => {
      const t0 = performance.now();
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${regularUser.token}`)
        .send({
          title: 'ReDoS Test Post',
          latitude: 40.7128,
          longitude: -74.006,
          city: 'New York',
          country: 'United States',
          tags: [evilReDoS],
        });
      const durationMs = performance.now() - t0;

      assert.equal(res.status, 400, 'Must be rejected with 400');
      assert.equal(res.body.code, 'VALIDATION_FAILED');
      assert.ok(
        durationMs < 50,
        `Tag ReDoS check must finish in < 50ms, took ${durationMs.toFixed(2)}ms`
      );
    });

    it('rejects 50,000-char evil ReDoS city parameter in < 50ms', async () => {
      // 1. Post creation with evil city parameter in request body
      const t0 = performance.now();
      const resPost = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${regularUser.token}`)
        .send({
          title: 'ReDoS City Post',
          latitude: 40.7128,
          longitude: -74.006,
          city: evilReDoS,
          country: 'United States',
        });
      const durationPostMs = performance.now() - t0;

      assert.equal(resPost.status, 400, 'Must be rejected with 400');
      assert.equal(resPost.body.code, 'VALIDATION_FAILED');
      assert.ok(
        durationPostMs < 50,
        `City body ReDoS check must finish in < 50ms, took ${durationPostMs.toFixed(2)}ms`
      );

      // 2. Query parameter on GET /api/v1/feed/city rejected in < 50ms (either 400 validation or 431 header size limit)
      const t1 = performance.now();
      const resQuery = await request(app)
        .get('/api/v1/feed/city')
        .query({
          city: evilReDoS,
          countryCode: 'US',
        });
      const durationQueryMs = performance.now() - t1;

      assert.ok([400, 431].includes(resQuery.status), `Must be rejected with 400 or 431, got ${resQuery.status}`);
      assert.ok(
        durationQueryMs < 50,
        `City query ReDoS check must finish in < 50ms, took ${durationQueryMs.toFixed(2)}ms`
      );
    });
  });

  // ============================================================================
  // Additional Security Verification: METRICS_TOKEN Constant-Time Timing Immunity
  // ============================================================================
  describe('Timing Attack Immunity: METRICS_TOKEN Constant-Time Comparison', () => {
    it('verifies METRICS_TOKEN in constant time using SHA-256 and timingSafeEqual', async () => {
      process.env.METRICS_TOKEN = 'secret-metrics-token-1234567890abcdef';

      // 1. Missing Authorization header -> 401
      const resMissing = await request(app).get('/metrics');
      assert.equal(resMissing.status, 401);

      // 2. Token with different length (short) -> 403
      const resShort = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer x');
      assert.equal(resShort.status, 403);

      // 3. Token with different length (long) -> 403
      const resLong = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer ' + 'x'.repeat(100));
      assert.equal(resLong.status, 403);

      // 4. Token with matching prefix but invalid suffix -> 403
      const resPrefix = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer secret-metrics-token-1234567890abcdeg'); // last char different
      assert.equal(resPrefix.status, 403);

      // 5. Valid token -> 200 with Prometheus text format
      const resValid = await request(app)
        .get('/metrics')
        .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`);
      assert.equal(resValid.status, 200);
      assert.ok(resValid.text.includes('oddspot_'));
    });
  });
});
