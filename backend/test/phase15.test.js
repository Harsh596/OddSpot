const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { app, request, setupTestDb, teardownTestDb, createTestUser } = require('./setup');
const { validateImageUrl, isSecureImageUrl } = require('../utils/imageUrlValidator');

describe('Phase 15: Signed Image Upload Provider Interface & Host Allowlist SSRF Enforcement', () => {
  let user;
  let userToken;

  before(async () => {
    await setupTestDb();
    user = await createTestUser({
      username: 'test_p15_scout',
      email: 'p15_scout@oddspot.test',
    });
    userToken = user.token;
  });

  after(async () => {
    await teardownTestDb();
  });

  describe('1. MIME Type & File Size Validation on POST /api/v1/uploads/sign', () => {
    it('POST /uploads/sign rejects unsupported MIME types (image/svg+xml, text/html) with 400 and files > 5MB with 413', async () => {
      // 1a. Unsupported MIME: image/svg+xml -> 400
      const resSvg = await request(app)
        .post('/api/v1/uploads/sign')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          mimeType: 'image/svg+xml',
          sizeBytes: 1024,
        });

      assert.equal(resSvg.status, 400);
      assert.match(
        resSvg.body.error?.message || resSvg.body.message,
        /unsupported mime type/i
      );

      // 1b. Unsupported MIME: text/html -> 400
      const resHtml = await request(app)
        .post('/api/v1/uploads/sign')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          mimeType: 'text/html',
          sizeBytes: 1024,
        });

      assert.equal(resHtml.status, 400);

      // 1c. File size exceeds 5MB (5242880 bytes) -> 413
      const sixMbBytes = 6 * 1024 * 1024; // 6,291,456 bytes
      const resTooLarge = await request(app)
        .post('/api/v1/uploads/sign')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          mimeType: 'image/jpeg',
          sizeBytes: sixMbBytes,
        });

      assert.equal(resTooLarge.status, 413);
      assert.equal(resTooLarge.body.code, 'PAYLOAD_TOO_LARGE');
    });

    it('requires authentication on POST /api/v1/uploads/sign', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/sign')
        .send({
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        });

      assert.equal(res.status, 401);
    });
  });

  describe('2. Upload Provider Modes (Allowlist Default 501 vs Cloudinary Signature 200)', () => {
    const origEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...origEnv };
    });

    it('POST /uploads/sign returns 501 when provider is disabled and returns signed payload with fl_strip_profile EXIF stripping when Cloudinary env vars are provided in test', async () => {
      // 2a. Default allowlist mode (no provider keys set) -> 501 UPLOAD_PROVIDER_DISABLED
      delete process.env.UPLOAD_PROVIDER;
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;

      const resDisabled = await request(app)
        .post('/api/v1/uploads/sign')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          mimeType: 'image/jpeg',
          sizeBytes: 1024 * 1024, // 1 MB
        });

      assert.equal(resDisabled.status, 501);
      assert.equal(resDisabled.body.code, 'UPLOAD_PROVIDER_DISABLED');
      assert.equal(resDisabled.body.error?.code, 'UPLOAD_PROVIDER_DISABLED');
      assert.match(
        resDisabled.body.error?.message || resDisabled.body.message,
        /direct upload signing is disabled until an image host is configured/i
      );

      // 2b. Explicit allowlist mode -> 501
      process.env.UPLOAD_PROVIDER = 'allowlist';
      const resAllowlistMode = await request(app)
        .post('/api/v1/uploads/sign')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          mimeType: 'image/png',
          sizeBytes: 500 * 1024,
        });

      assert.equal(resAllowlistMode.status, 501);
      assert.equal(resAllowlistMode.body.code, 'UPLOAD_PROVIDER_DISABLED');

      // 2c. Cloudinary mode with mock credentials -> 200 with signature and fl_strip_profile
      process.env.UPLOAD_PROVIDER = 'cloudinary';
      process.env.CLOUDINARY_CLOUD_NAME = 'oddspot-cloud';
      process.env.CLOUDINARY_API_KEY = 'mock-api-key-12345';
      process.env.CLOUDINARY_API_SECRET = 'mock-api-secret-67890';

      const resCloudinary = await request(app)
        .post('/api/v1/uploads/sign')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          mimeType: 'image/webp',
          sizeBytes: 2 * 1024 * 1024, // 2 MB
          purpose: 'post_image',
        });

      assert.equal(resCloudinary.status, 200);
      assert.equal(resCloudinary.body.provider, 'cloudinary');
      assert.equal(
        resCloudinary.body.uploadUrl,
        'https://api.cloudinary.com/v1_1/oddspot-cloud/image/upload'
      );
      assert.equal(resCloudinary.body.apiKey, 'mock-api-key-12345');
      assert.equal(resCloudinary.body.folder, 'oddspot');
      assert.equal(resCloudinary.body.transformation, 'fl_strip_profile');
      assert.ok(typeof resCloudinary.body.timestamp === 'number');

      // Verify HMAC-SHA1 signature matches Cloudinary specification
      const expectedStringToSign = `folder=oddspot&timestamp=${resCloudinary.body.timestamp}&transformation=fl_strip_profilemock-api-secret-67890`;
      const expectedSignature = crypto
        .createHash('sha1')
        .update(expectedStringToSign)
        .digest('hex');

      assert.equal(resCloudinary.body.signature, expectedSignature);
    });
  });

  describe('3. Strict Image URL SSRF Protection & Host Allowlist Enforcement', () => {
    const origEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...origEnv };
    });

    it('Image URL validator blocks SSRF targets (localhost, 127.0.0.1, 169.254.169.254, credentials in URL) and enforces IMAGE_HOST_ALLOWLIST when set', async () => {
      // 3a. Test validator unit function against SSRF targets
      assert.equal(validateImageUrl('https://localhost/pic.jpg').valid, false);
      assert.equal(validateImageUrl('https://127.0.0.1/pic.jpg').valid, false);
      assert.equal(validateImageUrl('https://169.254.169.254/latest/meta-data').valid, false);
      assert.equal(validateImageUrl('https://[::1]/pic.jpg').valid, false);
      assert.equal(validateImageUrl('https://scout:secret@example.com/pic.jpg').valid, false);
      assert.equal(validateImageUrl('https://10.0.0.1/internal.jpg').valid, false);
      assert.equal(validateImageUrl('https://192.168.1.1/router.jpg').valid, false);
      assert.equal(validateImageUrl('http://example.com/insecure.jpg').valid, false);

      // 3b. Verify POST /api/posts rejects SSRF target images with 400 VALIDATION_FAILED
      const ssrfUrls = [
        'https://localhost/exploit.jpg',
        'https://127.0.0.1/exploit.jpg',
        'https://169.254.169.254/latest/meta-data',
        'https://[::1]/exploit.jpg',
        'https://admin:password@res.cloudinary.com/exploit.jpg',
      ];

      for (const ssrfUrl of ssrfUrls) {
        const res = await request(app)
          .post('/api/posts')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            title: `SSRF Probe ${Date.now()}`,
            latitude: 12.9716,
            longitude: 77.5946,
            city: 'Bengaluru',
            country: 'India',
            images: [ssrfUrl],
          });

        assert.equal(
          res.status,
          400,
          `Expected 400 for SSRF target URL: ${ssrfUrl}, got ${res.status}`
        );
        assert.equal(res.body.code, 'VALIDATION_FAILED');
      }

      // 3c. Verify host allowlist enforcement when IMAGE_HOST_ALLOWLIST is configured
      process.env.IMAGE_HOST_ALLOWLIST = 'res.cloudinary.com,images.unsplash.com';

      // Disallowed external domain should be rejected with 400
      const resBlockedDomain = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: `Unapproved Host Test ${Date.now()}`,
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          images: ['https://unapproved-image-host.com/photo.jpg'],
        });

      assert.equal(resBlockedDomain.status, 400);
      assert.equal(resBlockedDomain.body.code, 'VALIDATION_FAILED');
      assert.match(
        resBlockedDomain.body.error?.message || resBlockedDomain.body.message,
        /allowed host list/i
      );

      // Allowed domain (res.cloudinary.com) should be accepted with 201
      const resAllowedDomain = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: `Allowlisted Host Spot ${Date.now()}`,
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          images: ['https://res.cloudinary.com/oddspot/sample-spot.jpg'],
        });

      assert.equal(resAllowedDomain.status, 201);
      assert.ok(resAllowedDomain.body._id || resAllowedDomain.body.id);
    });
  });
});
