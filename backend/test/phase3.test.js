// backend/test/phase3.test.js
// Regression test suite for Phase 3:
// - Task P3-T1: User schema, RefreshToken model (replacedBy, revokedAt), EmailToken model
// - Task P3-T2: backend/config/jwt.js validation and kid rotation
// - Task P3-T3 (K11): tokenVersion & banned status checks with 30s cache and invalidateUserAuthCache
// - Task P3-T4 (K15): username regex, reserved words, 8-72 byte passwords, age confirmation
// - Task P3-T5 (K15): module-level DUMMY_HASH timing equalization & account lockout throttling
// - Task P3-T6: refresh token rotation, token reuse family revocation, and tokenVersion bump
// - Task P3-T7: mailer in-memory buffer, /verify-email/request, /verify-email/confirm, /forgot-password, /reset-password
// - Task P3-T8: change-password & DELETE /me contribution anonymization and deletion
// - Task P3-T9: docs/COOKIE_AUTH_PLAN.md verification

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');
const { setupTestDb, teardownTestDb, clearCollections, createTestUser, createTestPost } = require('./setup');
const models = require('../models');
const { validateJwtConfig, getCurrentSigningKey, getKeyring } = require('../config/jwt');
const { invalidateUserAuthCache, clearUserCache } = require('../middleware/auth');
const { __getSentMail, __clearSentMail } = require('../services/mailer');
const { TOMBSTONE_USER_ID } = require('../config/auth');

describe('Phase 3: Accounts, Sessions, Rotating Refresh Tokens & Auth Hardening', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    __clearSentMail();
    clearUserCache();
  });

  // --------------------------------------------------------------------------
  // Task P3-T1: Model & Schema Integrity
  // --------------------------------------------------------------------------
  describe('Task P3-T1: User, RefreshToken & EmailToken Schemas', () => {
    test('User model has usernameLower, emailLower, tokenVersion, ageConfirmedAt, emailVerifiedAt, shadowBanned, trust, lastPostLocation', async () => {
      const user = await models.User.create({
        username: 'test_p3_schema',
        email: 'test_p3_schema@example.com',
        passwordHash: 'dummyHash123',
        ageConfirmedAt: new Date(),
        emailVerifiedAt: new Date(),
        shadowBanned: false,
        trust: 10,
        lastPostLocation: { type: 'Point', coordinates: [12.4924, 41.8902] },
      });

      assert.equal(user.usernameLower, 'test_p3_schema');
      assert.equal(user.emailLower, 'test_p3_schema@example.com');
      assert.equal(user.tokenVersion, 0);
      assert.ok(user.ageConfirmedAt);
      assert.ok(user.emailVerifiedAt);
      assert.equal(user.shadowBanned, false);
      assert.equal(user.trust, 10);
      assert.deepEqual(user.lastPostLocation.coordinates, [12.4924, 41.8902]);
    });

    test('RefreshToken model includes replacedBy and revokedAt fields', async () => {
      const user = await createTestUser();
      const tokenDoc = await models.RefreshToken.create({
        tokenHash: 'dummyhash1234567890',
        userId: user.id,
        familyId: 'family-101',
        expiresAt: new Date(Date.now() + 86400000),
        replacedBy: 'next-token-hash-456',
        revokedAt: new Date(),
        revoked: true,
      });

      assert.equal(tokenDoc.replacedBy, 'next-token-hash-456');
      assert.ok(tokenDoc.revokedAt);
      assert.equal(tokenDoc.revoked, true);
    });

    test('EmailToken model stores single-use email verification and reset tokens', async () => {
      const user = await createTestUser();
      const emailToken = await models.EmailToken.create({
        userId: user.id,
        tokenHash: 'email-token-hash-789',
        type: 'verify_email',
        expiresAt: new Date(Date.now() + 86400000),
      });

      assert.equal(emailToken.type, 'verify_email');
      assert.equal(emailToken.tokenHash, 'email-token-hash-789');
      assert.equal(emailToken.usedAt, null);
    });
  });

  // --------------------------------------------------------------------------
  // Task P3-T2: JWT Configuration & Key Rotation
  // --------------------------------------------------------------------------
  describe('Task P3-T2: JWT Config & Key Rotation', () => {
    test('validateJwtConfig throws if JWT_SECRET is missing or under 32 characters', () => {
      const origSecret = process.env.JWT_SECRET;
      try {
        delete process.env.JWT_SECRET;
        assert.throws(() => validateJwtConfig(), /FATAL: JWT_SECRET/);

        process.env.JWT_SECRET = 'short-secret';
        assert.throws(() => validateJwtConfig(), /at least 32 characters/);

        process.env.JWT_SECRET = 'this-is-a-valid-secure-jwt-secret-with-more-than-32-chars';
        assert.doesNotThrow(() => validateJwtConfig());
      } finally {
        process.env.JWT_SECRET = origSecret;
      }
    });

    test('getKeyring and getCurrentSigningKey support kid key rotation', () => {
      const origSecrets = process.env.JWT_SECRETS;
      const origKid = process.env.JWT_CURRENT_KEY_ID;
      try {
        process.env.JWT_SECRETS = JSON.stringify({
          'key-v1': 'secret-for-key-v1-with-sufficient-length-1234567890',
          'key-v2': 'secret-for-key-v2-with-sufficient-length-1234567890',
        });
        process.env.JWT_CURRENT_KEY_ID = 'key-v2';

        const keyring = getKeyring();
        assert.ok(keyring['key-v1']);
        assert.ok(keyring['key-v2']);

        const current = getCurrentSigningKey();
        assert.equal(current.kid, 'key-v2');
        assert.equal(current.secret, 'secret-for-key-v2-with-sufficient-length-1234567890');
      } finally {
        process.env.JWT_SECRETS = origSecrets;
        process.env.JWT_CURRENT_KEY_ID = origKid;
      }
    });
  });

  // --------------------------------------------------------------------------
  // Task P3-T3 (K11): tokenVersion & Banned Checks with 30s Cache
  // --------------------------------------------------------------------------
  describe('Task P3-T3: tokenVersion & Banned Checks', () => {
    test('tokenVersion mismatch rejects access token with 401', async () => {
      const user = await createTestUser();

      // Access token has tokenVersion 0
      const resBefore = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${user.token}`);
      assert.equal(resBefore.status, 200);

      // Increment tokenVersion in DB and invalidate cache
      await models.User.updateOne({ _id: user.id }, { $inc: { tokenVersion: 1 } });
      invalidateUserAuthCache(user.id);

      // Same token now rejected with 401
      const resAfter = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${user.token}`);
      assert.equal(resAfter.status, 401);
      assert.equal(resAfter.body.code, 'AUTH_TOKEN_EXPIRED');
    });

    test('banned user returns 403 AUTH_FORBIDDEN_BANNED on protected routes', async () => {
      const user = await createTestUser();

      // Ban user in DB and invalidate cache
      await models.User.updateOne({ _id: user.id }, { $set: { banned: true } });
      invalidateUserAuthCache(user.id);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${user.token}`);
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'AUTH_FORBIDDEN_BANNED');
    });

    test('invalidateUserAuthCache correctly evicts user from in-memory cache', async () => {
      const user = await createTestUser();

      // Populate cache
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`);

      // Modify role in DB
      await models.User.updateOne({ _id: user.id }, { $set: { role: 'moderator' } });

      // Invalidate cache
      invalidateUserAuthCache(user.id);

      // Fresh request reflects updated role immediately
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`);
      assert.equal(res.body.user.role, 'moderator');
    });
  });

  // --------------------------------------------------------------------------
  // Task P3-T4: Username Regex, Reserved Words, 8-72 Byte Passwords & Age Confirm
  // --------------------------------------------------------------------------
  describe('Task P3-T4: Registration Hardening & Age Confirmation', () => {
    test('Username must match /^[A-Za-z0-9_]{3,24}$/ and reject invalid characters', async () => {
      // Too short (< 3 chars)
      const resShort = await request(app)
        .post('/api/auth/signup')
        .send({ username: 'ab', email: 'test_short@example.com', password: 'ValidPassword123!' });
      assert.equal(resShort.status, 400);

      // Special chars rejected
      const resSpecial = await request(app)
        .post('/api/auth/signup')
        .send({ username: 'user@name!', email: 'test_spec@example.com', password: 'ValidPassword123!' });
      assert.equal(resSpecial.status, 400);

      // Reserved words rejected
      const resReserved = await request(app)
        .post('/api/auth/signup')
        .send({ username: 'admin', email: 'test_admin@example.com', password: 'ValidPassword123!' });
      assert.equal(resReserved.status, 400);
      assert.match(resReserved.body.error, /reserved/i);
    });

    test('Password bounds: rejects passwords under 8 bytes and over 72 bytes', async () => {
      // Under 8 bytes
      const resUnder = await request(app)
        .post('/api/auth/signup')
        .send({ username: 'valid_user_1', email: 'test_under@example.com', password: 'Short1!' });
      assert.equal(resUnder.status, 400);

      // Over 72 bytes
      const longPass = 'A'.repeat(73) + '1!';
      const resOver = await request(app)
        .post('/api/auth/signup')
        .send({ username: 'valid_user_2', email: 'test_over@example.com', password: longPass });
      assert.equal(resOver.status, 400);
    });

    test('Signup with confirmAge: true sets ageConfirmedAt on user doc', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          username: 'test_age_user',
          email: 'test_age@example.com',
          password: 'ValidPassword123!',
          confirmAge: true,
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.user.ageConfirmedAt);

      const dbUser = await models.User.findById(res.body.user.id);
      assert.ok(dbUser.ageConfirmedAt);
    });
  });

  // --------------------------------------------------------------------------
  // Task P3-T5: Timing Equalization & Lockout Throttling
  // --------------------------------------------------------------------------
  describe('Task P3-T5: Timing Equalization & Lockout', () => {
    test('Login handles non-existent users with DUMMY_HASH timing equalization', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'non_existent_user', password: 'WrongPassword123!' });

      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Invalid username/email or password');
    });

    test('Account locks out after consecutive failed attempts for 15 minutes', async () => {
      const user = await createTestUser();

      // Trigger 5 failed logins
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ identifier: user.username, password: 'WrongPassword123!' });
        assert.equal(res.status, 401);
      }

      await new Promise((r) => setImmediate(r));

      const dbUser = await models.User.findById(user.id);
      assert.ok(dbUser.lockUntil && dbUser.lockUntil > new Date());
      assert.ok(dbUser.failedLoginAttempts >= 5);

      // Attempt with correct password during lockout still returns 401 (oracle-safe)
      const resBlocked = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.username, password: user.password });
      assert.equal(resBlocked.status, 401);
    });
  });

  // --------------------------------------------------------------------------
  // Task P3-T6: Rotating Refresh Tokens & Reuse Detection
  // --------------------------------------------------------------------------
  describe('Task P3-T6: Refresh Token Rotation & Family Revocation', () => {
    test('POST /api/auth/refresh rotates token and marks previous replacedBy', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: user.refreshToken });

      assert.equal(res.status, 200);
      assert.ok(res.body.token);
      assert.ok(res.body.refreshToken);
      assert.notEqual(res.body.refreshToken, user.refreshToken);

      // Check DB confirms previous token was replaced
      const prevDoc = await models.RefreshToken.findOne({
        tokenHash: require('crypto').createHash('sha256').update(user.refreshToken).digest('hex'),
      });
      assert.ok(prevDoc.revoked);
      assert.ok(prevDoc.replacedBy);
    });

    test('Reuse of already-replaced refresh token revokes family and increments tokenVersion', async () => {
      const user = await createTestUser();

      // 1st rotation succeeds
      const res1 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: user.refreshToken });
      assert.equal(res1.status, 200);

      // Reusing original already-replaced token triggers reuse detection
      const resReuse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: user.refreshToken });

      assert.equal(resReuse.status, 401);
      assert.equal(resReuse.body.code, 'TOKEN_REUSE_DETECTED');

      // Verify user.tokenVersion was incremented
      const dbUser = await models.User.findById(user.id);
      assert.ok(dbUser.tokenVersion > 0);

      // Verify the child token from res1 was also revoked
      const resChild = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: res1.body.refreshToken });
      assert.equal(resChild.status, 401);
    });

    test('POST /api/auth/logout-all invalidates refresh tokens and increments tokenVersion', async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${user.token}`);

      assert.equal(res.status, 200);

      // Tokens deleted
      const tokenCount = await models.RefreshToken.countDocuments({ userId: user.id });
      assert.equal(tokenCount, 0);

      // User tokenVersion incremented
      const dbUser = await models.User.findById(user.id);
      assert.ok(dbUser.tokenVersion > 0);
    });
  });

  // --------------------------------------------------------------------------
  // Task P3-T7: Mailer Buffer, Email Verification & Password Reset
  // --------------------------------------------------------------------------
  describe('Task P3-T7: Email Verification & Password Reset Flows', () => {
    test('/verify-email/request and /verify-email/confirm verify user email', async () => {
      const user = await createTestUser({ email: 'test_p3_verify@example.com' });

      // Request verification email
      const reqRes = await request(app)
        .post('/api/auth/verify-email/request')
        .send({ email: 'test_p3_verify@example.com' });
      assert.equal(reqRes.status, 200);

      // Check mail was sent to in-memory buffer
      const sentMails = __getSentMail();
      assert.ok(sentMails.length >= 1);
      const mail = sentMails[sentMails.length - 1];
      assert.equal(mail.to, 'test_p3_verify@example.com');
      const tokenMatch = mail.text.match(/token:\s*([a-f0-9]{64})/i);
      assert.ok(tokenMatch);
      const rawToken = tokenMatch[1];

      // Confirm verification
      const confirmRes = await request(app)
        .post('/api/auth/verify-email/confirm')
        .send({ token: rawToken });
      assert.equal(confirmRes.status, 200);

      // Verify user document in DB
      const dbUser = await models.User.findById(user.id);
      assert.equal(dbUser.emailVerified, true);
      assert.ok(dbUser.emailVerifiedAt);
    });

    test('/forgot-password and /reset-password reset password and bump tokenVersion', async () => {
      const user = await createTestUser({ email: 'test_p3_reset@example.com' });

      // Initiate forgot password
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test_p3_reset@example.com' });
      assert.equal(forgotRes.status, 200);

      const sentMails = __getSentMail();
      const mail = sentMails[sentMails.length - 1];
      const tokenMatch = mail.text.match(/token:\s*([a-f0-9]{64})/i);
      assert.ok(tokenMatch);
      const rawResetToken = tokenMatch[1];

      // Complete reset password
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawResetToken, newPassword: 'BrandNewPassword123!' });
      assert.equal(resetRes.status, 200);

      // Login with new password succeeds
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.username, password: 'BrandNewPassword123!' });
      assert.equal(loginRes.status, 200);
    });
  });

  // --------------------------------------------------------------------------
  // Task P3-T8: Change-Password & DELETE /me Anonymization
  // --------------------------------------------------------------------------
  describe('Task P3-T8: Change Password & Account Deletion', () => {
    test('POST /api/auth/change-password invalidates previous tokenVersion', async () => {
      const user = await createTestUser();

      const changeRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: user.password, newPassword: 'NewSecurePassword123!' });

      assert.equal(changeRes.status, 200);
      assert.ok(changeRes.body.token);

      // Old token no longer works
      const oldCheck = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${user.token}`);
      assert.equal(oldCheck.status, 401);
    });

    test('DELETE /api/auth/me anonymizes posts/comments and deletes user document', async () => {
      const user = await createTestUser();
      const postRes = await createTestPost(user.token);
      const post = postRes.body;

      const delRes = await request(app)
        .delete('/api/auth/me')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: user.password });

      assert.equal(delRes.status, 200);

      // User document deleted
      const userCheck = await models.User.findById(user.id);
      assert.equal(userCheck, null);

      // Refresh tokens deleted
      const tokenCount = await models.RefreshToken.countDocuments({ userId: user.id });
      assert.equal(tokenCount, 0);

      // Post is anonymized (reassigned to system TOMBSTONE_USER_ID)
      const postCheck = await models.Post.findById(post._id);
      assert.ok(postCheck.authorId.equals(TOMBSTONE_USER_ID));
    });
  });

  // --------------------------------------------------------------------------
  // Task P3-T9: Cookie Auth Plan Documentation
  // --------------------------------------------------------------------------
  describe('Task P3-T9: Cookie Auth Plan Documentation', () => {
    test('docs/COOKIE_AUTH_PLAN.md exists and covers key migration areas', () => {
      const planPath = path.resolve(__dirname, '../../docs/COOKIE_AUTH_PLAN.md');
      assert.ok(fs.existsSync(planPath), 'docs/COOKIE_AUTH_PLAN.md must exist');
      const content = fs.readFileSync(planPath, 'utf8');
      assert.ok(content.includes('httpOnly'), 'Must discuss httpOnly cookies');
      assert.ok(content.includes('CSRF'), 'Must detail CSRF mitigation');
      assert.ok(content.includes('__Host-'), 'Must specify __Host- prefix');
    });
  });
});
