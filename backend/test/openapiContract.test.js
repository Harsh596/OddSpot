// backend/test/openapiContract.test.js
// Regression test suite for OpenAPI contract, /api/v1 routing, public config, and requestId tracking.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it, before, after, beforeEach } = require('node:test');
const { app, request, setupTestDb, teardownTestDb, clearCollections, mongoose } = require('./setup');
const { ErrorCodes } = require('../validators');
const { spec } = require('../openapi/spec');

describe('OpenAPI Contract, /api/v1 Routing & Config Tests', () => {
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

  // 1. OpenAPI Specification File Integrity
  describe('OpenAPI 3.1.0 File Integrity', () => {
    it('1. docs/openapi.json exists on disk and matches valid OpenAPI 3.1.0 structure', () => {
      const rootOpenApiPath = path.resolve(__dirname, '../../docs/openapi.json');
      assert.ok(fs.existsSync(rootOpenApiPath), 'docs/openapi.json must exist');

      const fileContent = JSON.parse(fs.readFileSync(rootOpenApiPath, 'utf8'));
      assert.equal(fileContent.openapi, '3.1.0');
      assert.equal(fileContent.info.title, 'OddSpot API');
      assert.equal(fileContent.info.version, '1.0.0');
      assert.ok(fileContent.paths['/auth/signup']);
      assert.ok(fileContent.paths['/posts']);
      assert.ok(fileContent.paths['/config/public']);
    });

    it('2. backend/docs/openapi.json is also synchronized', () => {
      const backendOpenApiPath = path.resolve(__dirname, '../docs/openapi.json');
      assert.ok(fs.existsSync(backendOpenApiPath), 'backend/docs/openapi.json must exist');

      const fileContent = JSON.parse(fs.readFileSync(backendOpenApiPath, 'utf8'));
      assert.equal(fileContent.openapi, '3.1.0');
      assert.equal(fileContent.info.title, 'OddSpot API');
    });
  });

  // 2. HTTP OpenAPI Endpoints
  describe('OpenAPI Specification Route Access', () => {
    it('3. GET /api/v1/openapi.json returns 200 with OpenAPI 3.1.0 spec', async () => {
      const res = await request(app).get('/api/v1/openapi.json');
      assert.equal(res.status, 200);
      assert.equal(res.body.openapi, '3.1.0');
      assert.equal(res.body.info.title, 'OddSpot API');
      assert.ok(res.body.paths['/posts/nearby']);
    });

    it('4. GET /api/openapi.json returns 200 with OpenAPI 3.1.0 spec', async () => {
      const res = await request(app).get('/api/openapi.json');
      assert.equal(res.status, 200);
      assert.equal(res.body.openapi, '3.1.0');
      assert.equal(res.body.info.title, 'OddSpot API');
    });
  });

  // 3. Public Configuration Endpoint
  describe('Public Configuration Endpoint', () => {
    it('5. GET /api/v1/config/public returns system metadata and limits', async () => {
      const res = await request(app).get('/api/v1/config/public');
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'OddSpot');
      assert.equal(res.body.version, '1.0.0');
      assert.equal(res.body.limits.postMaxImages, 6);
      assert.equal(res.body.limits.postMaxTags, 10);
      assert.equal(res.body.limits.titleMaxLength, 140);
      assert.equal(res.body.limits.payloadLimits.login, '2kb');
      assert.equal(res.body.limits.payloadLimits.post, '20kb');
      assert.equal(res.body.limits.payloadLimits.comment, '10kb');
      assert.equal(res.body.features.hideExactAllowed, true);
    });

    it('6. GET /api/config/public works identically under legacy alias', async () => {
      const res = await request(app).get('/api/config/public');
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'OddSpot');
      assert.equal(res.body.limits.postMaxImages, 6);
    });
  });

  // 4. X-Request-Id Middleware
  describe('X-Request-Id Middleware', () => {
    it('7. Assigns UUID to X-Request-Id header when omitted by client', async () => {
      const res = await request(app).get('/api/v1/health');
      assert.equal(res.status, 200);
      const reqId = res.headers['x-request-id'];
      assert.ok(reqId, 'X-Request-Id header must be present');
      assert.match(reqId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('8. Forwards and preserves client-supplied X-Request-Id', async () => {
      const clientTraceId = 'trace-id-phase4-contract-test';
      const res = await request(app)
        .get('/api/v1/health')
        .set('X-Request-Id', clientTraceId);

      assert.equal(res.status, 200);
      assert.equal(res.headers['x-request-id'], clientTraceId);
    });
  });

  // 5. Dual-Compatible Error Responses
  describe('Dual-Compatible Error Responses', () => {
    it('9. 404 returns { error, code, message, details }', async () => {
      const res = await request(app).get('/api/v1/unknown-path-for-testing');
      assert.equal(res.status, 404);
      assert.equal(res.body.code, ErrorCodes.NOT_FOUND);
      assert.ok(typeof res.body.error === 'string');
      assert.ok(typeof res.body.message === 'string');
      assert.equal(res.body.error, res.body.message);
      assert.ok(Array.isArray(res.body.details));
    });

    it('10. 413 Payload Too Large returns dual-compatible envelope', async () => {
      const hugeIdentifier = 'b'.repeat(3000); // Exceeds 2 KB
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: hugeIdentifier, password: 'password123' });

      assert.equal(res.status, 413);
      assert.equal(res.body.code, ErrorCodes.PAYLOAD_TOO_LARGE);
      assert.ok(res.body.error);
      assert.ok(res.body.message);
    });
  });
});
