// backend/test/redteam4.test.js
// Red-Team Pass 4 Exploit Tests:
// Exploit 1: Markdown & Spoiler mXSS polyglot corpus -> 0 executable tags or event handlers survive renderSafeMarkdown.
// Exploit 2: SSRF bypass corpus (https://[::1]/a.jpg, https://[::ffff:169.254.169.254]/a.jpg, https://127.0.0.1/a.jpg, https://0x7f000001/a.jpg) across post images, visit photoUrl, user avatarUrl, and community iconUrl -> 100% rejected with 400.
// Exploit 3: Feed rule interpreter fuzzing (__proto__, constructor, $where, $function, negative distance, multiplier: 1e308, NaN) -> 100% rejected by schema validation before reaching MongoDB.
// Exploit 4: Cross-community privilege escalation (normal member attempting to edit community rules or delete another user's community post without moderator role) -> 403.
// Exploit 5: Replay of expired or used email verification / password reset token -> 400/401 on second use.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { describe, it, before, after, beforeEach } = require('node:test');
const { JSDOM } = require('../../frontend/node_modules/jsdom');
const {
  app,
  request,
  setupTestDb,
  teardownTestDb,
  clearCollections,
  createTestUser,
  mongoose,
} = require('./setup');
const { User, Post, Community, Membership, EmailToken, Notification } = require('../models');
const {
  validateSafeImageUrl,
  validateImageUrl,
  isSecureImageUrl,
} = require('../utils/imageUrlValidator');
const { validateFeedRules } = require('../services/feedRuleInterpreter');

describe('Red-Team Pass 4: Full-Stack XSS, SSRF, Upload Bypass & Rule Interpreter Fuzzing', () => {
  let userA, userB, userMod, userOwner;
  let renderSafeMarkdown;
  let isValidHexColor;

  before(async () => {
    // Set up headless DOM environment for DOMPurify frontend module
    const jsdomWindow = new JSDOM('').window;
    globalThis.window = jsdomWindow;
    globalThis.document = jsdomWindow.document;
    globalThis.Node = jsdomWindow.Node;
    globalThis.Element = jsdomWindow.Element;

    const markdownMod = await import('../../frontend/src/utils/markdown.js');
    renderSafeMarkdown = markdownMod.renderSafeMarkdown;

    const themeMod = await import('../../frontend/src/utils/themeValidator.js');
    isValidHexColor = themeMod.isValidHexColor;

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

    userA = await createTestUser({
      username: 'test_rt4_user_a',
      email: 'test_rt4_a@example.com',
      role: 'member',
    });
    userA._id = userA.id;

    userB = await createTestUser({
      username: 'test_rt4_user_b',
      email: 'test_rt4_b@example.com',
      role: 'member',
    });
    userB._id = userB.id;

    userOwner = await createTestUser({
      username: 'test_rt4_owner',
      email: 'test_rt4_owner@example.com',
      role: 'member',
    });
    userOwner._id = userOwner.id;

    userMod = await createTestUser({
      username: 'test_rt4_mod',
      email: 'test_rt4_mod@example.com',
      role: 'moderator',
    });
    userMod._id = userMod.id;
  });

  // ============================================================================
  // Exploit 1: Markdown & Spoiler mXSS Polyglot Corpus
  // ============================================================================
  describe('Exploit 1: Markdown & Spoiler mXSS Polyglot Sanitization & Theme CSS Injection Prevention', () => {
    const xssPolyglots = [
      '"><script>alert(1)</script>',
      '[click](javascript:alert(1))',
      '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
      '>!<img src=x onerror=alert(1)>!<',
      '<svg><onload=alert(1)>',
      '<svg/onload=alert(document.domain)>',
      '"><img src=x onerror="alert(\'xss\')">',
      '<iframe src="javascript:alert(1)"></iframe>',
      ':::details Exploit\n<script>alert(1)</script>\n:::',
      '>!<svg><script>alert(1)</script></svg>!<',
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    ];

    it('ensures 0 executable tags, event handlers, or javascript:/data: URLs survive renderSafeMarkdown', () => {
      const forbiddenTags = ['SCRIPT', 'IFRAME', 'SVG', 'MATH', 'IMG', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'STYLE'];

      for (const payload of xssPolyglots) {
        const cleanHtml = renderSafeMarkdown(payload);

        // Verify with JSDOM that no forbidden executable nodes exist in DOM tree
        const doc = new JSDOM(cleanHtml).window.document;
        const allElements = doc.querySelectorAll('*');

        for (const el of allElements) {
          const tag = el.tagName.toUpperCase();
          assert.ok(
            !forbiddenTags.includes(tag),
            `Must not contain forbidden tag <${tag}> in rendered DOM from payload: ${payload}`
          );

          // Verify no inline event handlers (onerror, onload, onclick, etc.) exist on elements
          for (const attr of el.attributes) {
            assert.ok(
              !attr.name.toLowerCase().startsWith('on'),
              `Element <${tag}> must not have inline event handler "${attr.name}" in: ${cleanHtml}`
            );

            // Verify no javascript: or data: URIs in attributes
            const attrVal = attr.value.trim().toLowerCase();
            assert.ok(
              !attrVal.startsWith('javascript:'),
              `Attribute "${attr.name}" must not contain javascript: URL in: ${cleanHtml}`
            );
            assert.ok(
              !attrVal.startsWith('data:text/html'),
              `Attribute "${attr.name}" must not contain data:text/html URL in: ${cleanHtml}`
            );
          }
        }

        // Also assert string level safety (no unescaped <script, <iframe, <svg, <math, <img)
        assert.ok(!/<(script|iframe|svg|math|img|object|embed)\b/i.test(cleanHtml));
      }
    });

    it('ensures theme customizer prevents CSS injection by strictly enforcing 6-char hex colors', () => {
      const maliciousCssValues = [
        'red; background: url(https://evil.com/leak)',
        '#00f0ff; position: fixed; top: 0',
        'expression(alert(1))',
        'rgb(255, 0, 0)',
        'rgba(0, 240, 255, 0.5)',
        '"><script>alert(1)</script>',
        'url("javascript:alert(1)")',
        '#12345',
        '#1234567',
        '#gggggg',
      ];

      for (const val of maliciousCssValues) {
        assert.equal(isValidHexColor(val), false, `Malicious or invalid CSS value "${val}" must be rejected`);
      }

      // Valid hex colors pass
      assert.equal(isValidHexColor('#00f0ff'), true);
      assert.equal(isValidHexColor('#ff0055'), true);
      assert.equal(isValidHexColor('#121722'), true);
    });
  });

  // ============================================================================
  // Exploit 2: SSRF Bypass Corpus across 4 Upload/Image Surfaces
  // ============================================================================
  describe('Exploit 2: SSRF Bypass Corpus Rejection across Post Images, Visit Photos, User Avatar, and Community Icon', () => {
    const ssrfCorpus = [
      'https://[::1]/a.jpg',
      'https://[::ffff:169.254.169.254]/a.jpg',
      'https://[::ffff:127.0.0.1]/a.jpg',
      'https://127.0.0.1/a.jpg',
      'https://0x7f000001/a.jpg',
      'https://0177.0.0.1/a.jpg',
      'https://scout:secret@images.oddspot.test/pic.jpg',
    ];

    it('verifies validateSafeImageUrl rejects every payload in the SSRF bypass corpus', () => {
      for (const url of ssrfCorpus) {
        const res = validateSafeImageUrl(url);
        assert.equal(res.valid, false, `SSRF payload "${url}" must be rejected by validateSafeImageUrl`);
        assert.equal(isSecureImageUrl(url), false);
      }
    });

    it('rejects SSRF bypass payloads in POST /api/v1/posts with 400 VALIDATION_FAILED', async () => {
      for (const evilUrl of ssrfCorpus) {
        const res = await request(app)
          .post('/api/v1/posts')
          .set('Authorization', `Bearer ${userA.token}`)
          .send({
            title: 'SSRF Attack Post Attempt',
            type: 'find',
            location: {
              coordinates: [139.6917, 35.6895],
            },
            place: {
              city: 'Tokyo',
              country: 'Japan',
            },
            images: [{ url: evilUrl }],
          });

        assert.equal(
          res.status,
          400,
          `POST /api/v1/posts must return 400 for SSRF image "${evilUrl}", got ${res.status}`
        );
        assert.equal(res.body.code, 'VALIDATION_FAILED');
      }
    });

    it('rejects SSRF bypass payloads in POST /api/v1/posts/:id/visit with 400 VALIDATION_FAILED', async () => {
      // Create a valid post first by userB
      const post = await Post.create({
        authorId: userB._id,
        title: 'Spot for Visit Check',
        type: 'find',
        location: {
          type: 'Point',
          coordinates: [139.6917, 35.6895],
        },
        feedLocation: {
          type: 'Point',
          coordinates: [139.6917, 35.6895],
        },
        place: {
          city: 'Tokyo',
          cityKey: 'tokyo',
          country: 'Japan',
          countryCode: 'JP',
        },
      });

      for (const evilUrl of ssrfCorpus) {
        const res = await request(app)
          .post(`/api/v1/posts/${post._id}/visit`)
          .set('Authorization', `Bearer ${userA.token}`)
          .send({
            latitude: 35.6895,
            longitude: 139.6917,
            photoUrl: evilUrl,
            spotStatus: 'still_there',
          });

        assert.equal(
          res.status,
          400,
          `POST /api/v1/posts/:id/visit must return 400 for SSRF photoUrl "${evilUrl}", got ${res.status}`
        );
        assert.equal(res.body.code, 'VALIDATION_FAILED');
      }
    });

    it('rejects SSRF bypass payloads in PATCH /api/v1/users/me (avatarUrl) with 400 VALIDATION_FAILED', async () => {
      for (const evilUrl of ssrfCorpus) {
        const res = await request(app)
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${userA.token}`)
          .send({
            avatarUrl: evilUrl,
          });

        assert.equal(
          res.status,
          400,
          `PATCH /api/v1/users/me must return 400 for SSRF avatarUrl "${evilUrl}", got ${res.status}`
        );
        assert.equal(res.body.code, 'VALIDATION_FAILED');
      }
    });

    it('rejects SSRF bypass payloads in POST /api/v1/communities (iconUrl) with 400 VALIDATION_FAILED', async () => {
      for (let i = 0; i < ssrfCorpus.length; i++) {
        const evilUrl = ssrfCorpus[i];
        const res = await request(app)
          .post('/api/v1/communities')
          .set('Authorization', `Bearer ${userA.token}`)
          .send({
            name: `SSRF Community ${i}`,
            slug: `ssrf-comm-${i}`,
            iconUrl: evilUrl,
            scope: 'city',
            place: { city: 'Tokyo', country: 'Japan' },
          });

        assert.equal(
          res.status,
          400,
          `POST /api/v1/communities must return 400 for SSRF iconUrl "${evilUrl}", got ${res.status}`
        );
        assert.equal(res.body.code, 'VALIDATION_FAILED');
      }
    });
  });

  // ============================================================================
  // Exploit 3: Feed Rule Interpreter Fuzzing
  // ============================================================================
  describe('Exploit 3: Feed Rule Interpreter Fuzzing (Prototype Pollution, Operator Injection & Boundaries)', () => {
    const fuzzedRules = [
      {
        name: 'Prototype pollution via __proto__',
        rules: JSON.parse('{"version": 1, "__proto__": {"polluted": true}}'),
      },
      {
        name: 'Object constructor injection',
        rules: { version: 1, constructor: { prototype: { admin: true } } },
      },
      {
        name: 'MongoDB $where code injection',
        rules: { version: 1, $where: 'sleep(5000)' },
      },
      {
        name: 'MongoDB $function injection',
        rules: { version: 1, $function: { body: 'function() { return true; }' } },
      },
      {
        name: 'MongoDB $accumulator injection',
        rules: { version: 1, $accumulator: { init: 'function(){}' } },
      },
      {
        name: 'Negative distance limit',
        rules: { version: 1, maxDistanceKm: -10 },
      },
      {
        name: 'Extreme multiplier (1e308 float overflow)',
        rules: { version: 1, boostTags: [{ tag: 'art', multiplier: 1e308 }] },
      },
      {
        name: 'NaN multiplier',
        rules: { version: 1, boostTags: [{ tag: 'art', multiplier: NaN }] },
      },
      {
        name: 'NaN distance',
        rules: { version: 1, maxDistanceKm: NaN },
      },
      {
        name: 'Multiplier below allowed range (< 0.5)',
        rules: { version: 1, boostTags: [{ tag: 'art', multiplier: 0.1 }] },
      },
      {
        name: 'Multiplier above allowed range (> 3.0)',
        rules: { version: 1, boostTags: [{ tag: 'art', multiplier: 5.0 }] },
      },
      {
        name: 'Non-numeric distance string type confusion',
        rules: { version: 1, maxDistanceKm: '25' },
      },
      {
        name: 'Arbitrary unwhitelisted operator key',
        rules: { version: 1, executeCommand: 'cat /etc/passwd' },
      },
    ];

    it('100% of malicious and out-of-boundary rule objects are rejected before reaching MongoDB', () => {
      for (const item of fuzzedRules) {
        assert.throws(
          () => {
            validateFeedRules(item.rules);
          },
          (err) => Boolean(err),
          `Feed rule interpreter must throw on fuzzed input: ${item.name}`
        );
      }
    });

    it('valid feed rules pass interpreter schema validation cleanly', () => {
      const validRules = {
        version: 1,
        maxDistanceKm: 25,
        includeTags: ['neon', 'streetart'],
        excludeTags: ['graffiti'],
        excludeWarnings: ['unsafe_night'],
        onlyTypes: ['find'],
        onlyVerifiedVisited: true,
        minScore: 10,
        sortBy: 'hot',
        boostTags: [{ tag: 'neon', multiplier: 1.5 }],
      };

      const parsed = validateFeedRules(validRules);
      assert.equal(parsed.version, 1);
      assert.equal(parsed.maxDistanceKm, 25);
      assert.equal(parsed.boostTags[0].multiplier, 1.5);
    });
  });

  // ============================================================================
  // Exploit 4: Cross-Community Privilege Escalation
  // ============================================================================
  describe('Exploit 4: Cross-Community Privilege Escalation Resistance', () => {
    let testCommunity;
    let postInCommunity;

    beforeEach(async () => {
      // userOwner creates the community
      testCommunity = await Community.create({
        name: 'Secret Urban Explorers',
        slug: 'secret-urbex',
        description: 'Elite explorers only',
        scope: 'city',
        place: { city: 'Tokyo', country: 'Japan' },
        rules: ['Rule 1: Never disclose locations publicly', 'Rule 2: Respect property'],
        memberCount: 2,
      });

      // userOwner is owner
      await Membership.create({
        userId: userOwner._id,
        communityId: testCommunity._id,
        role: 'owner',
      });

      // userA joins as a normal member
      await Membership.create({
        userId: userA._id,
        communityId: testCommunity._id,
        role: 'member',
      });

      // userOwner authors a post inside the community
      postInCommunity = await Post.create({
        authorId: userOwner._id,
        communityId: testCommunity._id,
        title: 'Hidden Rooftop Access Point',
        type: 'find',
        location: {
          type: 'Point',
          coordinates: [139.6917, 35.6895],
        },
        feedLocation: {
          type: 'Point',
          coordinates: [139.6917, 35.6895],
        },
        place: {
          city: 'Tokyo',
          cityKey: 'tokyo',
          country: 'Japan',
          countryCode: 'JP',
        },
      });
    });

    it('rejects normal member attempting to edit community rules with 403 FORBIDDEN', async () => {
      // UserA (normal member) attempts to edit community rules via PATCH /api/v1/communities/:slug
      const patchRes = await request(app)
        .patch(`/api/v1/communities/${testCommunity.slug}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          rules: ['Hacked: Everything is allowed now!'],
        });

      assert.equal(patchRes.status, 403, 'Normal member must not be permitted to update community rules');
      assert.ok(['FORBIDDEN', 'AUTH_FORBIDDEN'].includes(patchRes.body.code));

      // UserA attempts to edit community rules via PUT /api/v1/communities/:slug/rules
      const putRes = await request(app)
        .put(`/api/v1/communities/${testCommunity.slug}/rules`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          rules: ['Hacked: Rules replaced by attacker!'],
        });

      assert.equal(putRes.status, 403, 'Normal member must not be permitted to replace community rules');
      assert.ok(['FORBIDDEN', 'AUTH_FORBIDDEN'].includes(putRes.body.code));

      // Verify rules remain intact in database
      const freshCommunity = await Community.findById(testCommunity._id).lean();
      assert.equal(freshCommunity.rules.length, 2);
      assert.equal(freshCommunity.rules[0], 'Rule 1: Never disclose locations publicly');
    });

    it('rejects non-member user attempting to edit community rules with 403 FORBIDDEN', async () => {
      // UserB (not even a member of this community) attempts to edit rules
      const res = await request(app)
        .patch(`/api/v1/communities/${testCommunity.slug}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          rules: ['Defaced by outsider!'],
        });

      assert.equal(res.status, 403);
      assert.ok(['FORBIDDEN', 'AUTH_FORBIDDEN'].includes(res.body.code));
    });

    it('allows community owner to update community rules', async () => {
      const res = await request(app)
        .patch(`/api/v1/communities/${testCommunity.slug}`)
        .set('Authorization', `Bearer ${userOwner.token}`)
        .send({
          rules: ['Updated Rule 1', 'Updated Rule 2', 'Updated Rule 3'],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);

      const fresh = await Community.findById(testCommunity._id).lean();
      assert.equal(fresh.rules.length, 3);
      assert.equal(fresh.rules[0], 'Updated Rule 1');
    });

    it('rejects normal member attempting to delete another user\'s post in community with 403 FORBIDDEN', async () => {
      // UserA (normal member) attempts to delete UserOwner's post in the community
      const res = await request(app)
        .delete(`/api/v1/posts/${postInCommunity._id}`)
        .set('Authorization', `Bearer ${userA.token}`);

      assert.equal(res.status, 403, 'Normal member must not be allowed to delete another user\'s post');
      assert.ok(['FORBIDDEN', 'AUTH_FORBIDDEN'].includes(res.body.code));

      // Verify post was NOT deleted
      const checkPost = await Post.findById(postInCommunity._id).lean();
      assert.equal(checkPost.removed, false);
    });

    it('allows community owner to delete posts within their community', async () => {
      // UserA authors a post in the community
      const memberPost = await Post.create({
        authorId: userA._id,
        communityId: testCommunity._id,
        title: 'Spam Post by Member',
        type: 'find',
        location: {
          type: 'Point',
          coordinates: [139.6917, 35.6895],
        },
        feedLocation: {
          type: 'Point',
          coordinates: [139.6917, 35.6895],
        },
        place: {
          city: 'Tokyo',
          cityKey: 'tokyo',
          country: 'Japan',
          countryCode: 'JP',
        },
      });

      // Community owner deletes it
      const res = await request(app)
        .delete(`/api/v1/posts/${memberPost._id}`)
        .set('Authorization', `Bearer ${userOwner.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.removed, true);

      const freshPost = await Post.findById(memberPost._id).lean();
      assert.equal(freshPost.removed, true);
    });

    it('prevents cross-user notification reading or spoofing', async () => {
      // Create a private notification for userA
      const notifA = await Notification.create({
        userId: userA._id,
        actorId: userOwner._id,
        type: 'mention',
        title: 'You were mentioned',
        body: 'Confidential notification for user A',
        read: false,
      });

      // UserB attempts to fetch notifications -> must NOT see UserA's notification
      const getRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userB.token}`);

      assert.equal(getRes.status, 200);
      const foundA = (getRes.body.notifications || []).some(
        (n) => n._id.toString() === notifA._id.toString()
      );
      assert.equal(foundA, false, "UserB must never receive UserA's notifications");

      // UserB attempts to mark UserA's notification as read
      const readRes = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ ids: [notifA._id.toString()] });

      assert.equal(readRes.status, 200);
      assert.equal(readRes.body.modifiedCount, 0, "UserB must not be able to modify UserA's notification");

      // Verify UserA's notification remains unread
      const freshNotif = await Notification.findById(notifA._id).lean();
      assert.equal(freshNotif.read, false);
    });
  });

  // ============================================================================
  // Exploit 5: Replay of Expired or Used Tokens (Email Verification & Password Reset)
  // ============================================================================
  describe('Exploit 5: Replay of Expired or Used Verification & Password Reset Tokens', () => {
    it('rejects replay of already used email verification token with 400 AUTH_INVALID_TOKEN', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Unverified user with valid token
      const unverifiedUser = await createTestUser({
        username: 'test_rt4_unverified',
        email: 'test_rt4_unverified@example.com',
        role: 'member',
        emailVerified: false,
      });
      unverifiedUser._id = unverifiedUser.id;

      await User.updateOne(
        { _id: unverifiedUser._id },
        {
          $set: {
            emailVerified: false,
            emailVerificationTokenHash: tokenHash,
            emailVerificationExpires: expiresAt,
          },
        }
      );

      await EmailToken.create({
        userId: unverifiedUser._id,
        tokenHash,
        type: 'verify_email',
        expiresAt,
      });

      // First use: must succeed
      const firstUseRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: rawToken });

      assert.equal(firstUseRes.status, 200, 'First email verification must succeed');
      assert.ok(firstUseRes.body.message.includes('verified successfully'));

      const verifiedUser = await User.findById(unverifiedUser._id).lean();
      assert.equal(verifiedUser.emailVerified, true);
      assert.equal(verifiedUser.emailVerificationTokenHash, undefined);

      // Second use (replay attack): must fail with 400
      const replayRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: rawToken });

      assert.equal(replayRes.status, 400, 'Replayed email verification token must be rejected with 400');
      assert.equal(replayRes.body.code, 'AUTH_INVALID_TOKEN');
    });

    it('rejects expired email verification token with 400 AUTH_INVALID_TOKEN', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiredDate = new Date(Date.now() - 60 * 1000); // Expired 1 minute ago

      const unverifiedUser = await createTestUser({
        username: 'test_rt4_expired_v',
        email: 'test_rt4_expired_v@example.com',
        role: 'member',
        emailVerified: false,
      });
      unverifiedUser._id = unverifiedUser.id;

      await User.updateOne(
        { _id: unverifiedUser._id },
        {
          $set: {
            emailVerified: false,
            emailVerificationTokenHash: tokenHash,
            emailVerificationExpires: expiredDate,
          },
        }
      );

      await EmailToken.create({
        userId: unverifiedUser._id,
        tokenHash,
        type: 'verify_email',
        expiresAt: expiredDate,
      });

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: rawToken });

      assert.equal(res.status, 400, 'Expired email verification token must be rejected with 400');
      assert.equal(res.body.code, 'AUTH_INVALID_TOKEN');
    });

    it('rejects replay of already used password reset token with 400 AUTH_INVALID_TOKEN', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await User.updateOne(
        { _id: userA._id },
        {
          $set: {
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: expiresAt,
          },
        }
      );

      await EmailToken.create({
        userId: userA._id,
        tokenHash,
        type: 'reset_password',
        expiresAt,
      });

      // First reset: must succeed
      const firstResetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'BrandNewSecurePass123!',
        });

      assert.equal(firstResetRes.status, 200, 'First password reset must succeed');
      assert.ok(firstResetRes.body.message.includes('Password reset successfully'));

      // Second reset (replay attack): must fail with 400
      const replayResetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'AttackerHijackPass123!',
        });

      assert.equal(replayResetRes.status, 400, 'Replayed password reset token must be rejected with 400');
      assert.equal(replayResetRes.body.code, 'AUTH_INVALID_TOKEN');
    });

    it('rejects expired password reset token with 400 AUTH_INVALID_TOKEN', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiredDate = new Date(Date.now() - 15 * 60 * 1000); // Expired 15 minutes ago

      await User.updateOne(
        { _id: userA._id },
        {
          $set: {
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: expiredDate,
          },
        }
      );

      await EmailToken.create({
        userId: userA._id,
        tokenHash,
        type: 'reset_password',
        expiresAt: expiredDate,
      });

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'TooLatePass123!',
        });

      assert.equal(res.status, 400, 'Expired password reset token must be rejected with 400');
      assert.equal(res.body.code, 'AUTH_INVALID_TOKEN');
    });
  });
});
