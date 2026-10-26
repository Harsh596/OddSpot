// backend/tests/contract.test.js
// Contract and API specification test suite for Wave 3:
// Verifies route registration, OpenAPI 3.1.0 document integrity,
// X-Request-Id preservation/generation, error envelope structure,
// and text normalization/scalar validation.

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const { app, request, setupTestDb, teardownTestDb, clearCollections, createTestUser, mongoose } = require('./setup');
const { ErrorCodes } = require('../validators');

describe('Wave 3 API Contract & Validation Tests', () => {
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
  });

  // 1. Request ID Header (X-Request-Id)
  describe('Request ID Header (X-Request-Id)', () => {
    it('1. Generates unique X-Request-Id header when none is provided in request', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      const reqId = res.headers['x-request-id'];
      assert.ok(reqId, 'X-Request-Id response header must be present');
      // UUIDv4 format check
      assert.match(
        reqId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'Generated X-Request-Id must be a valid UUID'
      );
    });

    it('2. Preserves incoming client X-Request-Id header in response', async () => {
      const clientReqId = 'custom-client-trace-123456';
      const res = await request(app)
        .get('/api/health')
        .set('X-Request-Id', clientReqId);

      assert.equal(res.status, 200);
      assert.equal(res.headers['x-request-id'], clientReqId, 'Server must preserve client X-Request-Id');
    });
  });

  // 2. Routing: /api/v1 mounted and /api aliased
  describe('Routing Architecture (/api/v1 and /api alias)', () => {
    it('3. Health check accessible at both /api/v1/health and /api/health', async () => {
      const v1Res = await request(app).get('/api/v1/health');
      assert.equal(v1Res.status, 200);
      assert.equal(v1Res.body.status, 'ok');

      const legacyRes = await request(app).get('/api/health');
      assert.equal(legacyRes.status, 200);
      assert.equal(legacyRes.body.status, 'ok');
    });

    it('4. OpenAPI specification accessible at both /api/v1/openapi.json and /api/openapi.json', async () => {
      const v1Res = await request(app).get('/api/v1/openapi.json');
      assert.equal(v1Res.status, 200);
      assert.equal(v1Res.body.openapi, '3.1.0');
      assert.equal(v1Res.body.info.title, 'OddSpot API');

      const legacyRes = await request(app).get('/api/openapi.json');
      assert.equal(legacyRes.status, 200);
      assert.equal(legacyRes.body.openapi, '3.1.0');
      assert.equal(legacyRes.body.info.title, 'OddSpot API');
    });

    it('5. Unmatched route returns 404 with standardized error envelope', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
      assert.equal(res.body.code, ErrorCodes.NOT_FOUND);
      assert.ok(typeof res.body.message === 'string');
      assert.equal(res.body.error, res.body.message);
    });
  });

  // 3. Standard Error Envelope Structure
  describe('Standard Error Envelope Structure', () => {
    it('6. Validation error returns envelope with code, message, and details list', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          username: 'ab', // too short (<3)
          email: 'invalid-email',
          password: 'short',
        });

      assert.equal(res.status, 400);
      assert.ok(res.body.error, 'error property must exist');
      assert.equal(res.body.code, ErrorCodes.VALIDATION_FAILED);
      assert.ok(typeof res.body.message === 'string');
      assert.ok(Array.isArray(res.body.details), 'details must be an array');
      assert.ok(res.body.details.length > 0, 'details must explain field errors');
      assert.equal(res.body.error, res.body.message, 'error must match message');
    });

    it('7. Malformed JSON returns 400 with INVALID_JSON error code and no parser internals', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');

      assert.equal(res.status, 400);
      assert.equal(res.body.code, ErrorCodes.INVALID_JSON);
      assert.equal(res.body.error, 'Invalid JSON body');
      assert.equal(res.body.message, 'Invalid JSON body');
      const rawBody = JSON.stringify(res.body);
      assert.ok(!rawBody.includes('SyntaxError'));
      assert.ok(!rawBody.includes('at '));
    });
  });

  // 4. Text Normalization Pipeline & Scalar Enforcement
  describe('Text Normalization & Scalar Checks', () => {
    it('8. NUL byte in request body string is rejected with 400', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          title: 'Illegal\0NUL title',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /null/i);
    });

    it('9. Zero-width and control characters are stripped from post title during creation', async () => {
      const user = await createTestUser();
      const titleWithZeroWidth = 'Clean\u200B \u200CTitle\u200D';
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          title: titleWithZeroWidth,
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Clean Title', 'Zero-width characters must be stripped');
    });

    it('10. String containing only zero-width or control characters is rejected with 400', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          title: '\u200B\u200C\u200D   \uFEFF', // Only zero-width characters and spaces
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /empty|whitespace|characters/i);
    });

    it('11. Scalar check: NoSQL operator injection object rejected where scalar expected', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: { $ne: null },
          password: { $gt: '' },
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.code, ErrorCodes.VALIDATION_FAILED);
    });
  });

  // 5. Per-Route Payload Limits
  describe('Per-Route Payload Size Limits', () => {
    it('12. Login route rejects payloads exceeding 2 KB with 413', async () => {
      const largeIdentifier = 'a'.repeat(3000); // 3 KB payload
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: largeIdentifier,
          password: 'somepassword123',
        });

      assert.equal(res.status, 413);
      assert.equal(res.body.code, ErrorCodes.PAYLOAD_TOO_LARGE);
    });
  });
});
