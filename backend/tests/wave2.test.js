// backend/tests/wave2.test.js
// Comprehensive integration test suite for Wave 2: Accounts and sessions.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../server');
const { setupTestDb, teardownTestDb, clearCollections, createTestUser, createTestPost } = require('./setup');
const models = require('../models');
const { __getSentMail, __clearSentMail } = require('../services/mailer');
const { validateJwtConfig, verifyAccessToken } = require('../services/token');
const { TOMBSTONE_USER_ID } = require('../config/auth');

describe('Wave 2: Accounts and Sessions Integration Tests', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    __clearSentMail();
  });

  test('1. Username validation: ASCII characters, reserved names blocked, case-insensitive uniqueness', async () => {
    // 1a. Reserved name check (case-insensitive)
    for (const reserved of ['admin', 'Root', 'SUPPORT', 'oddspot', 'MODERATOR', 'mod', 'system', 'null', 'undefined']) {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          username: reserved,
          email: `${reserved.toLowerCase()}@example.com`,
          password: 'ValidPassword123!',
        });
      assert.equal(res.status, 400, `Reserved username ${reserved} should be blocked`);
      assert.equal(res.body.error, 'This username is reserved');
    }

    // 1b. Disallowed characters (non-alphanumeric/underscore)
    const resInvalidChar = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'user@name!',
        email: 'invalidchar@example.com',
        password: 'ValidPassword123!',
      });
      assert.equal(resInvalidChar.status, 400);

    // 1c. Valid registration
    const resValid = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_UniqueCase',
        email: 'uniquecase@example.com',
        password: 'ValidPassword123!',
      });
    assert.equal(resValid.status, 201);

    // 1d. Case-insensitive duplicate username rejected
    const resDupCase = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'TEST_UNIQUECASE',
        email: 'different_email@example.com',
        password: 'ValidPassword123!',
      });
    assert.equal(resDupCase.status, 409);
    assert.equal(resDupCase.body.error, 'Username is already taken');
  });

  test('2. Password rules: 8 to 72 bytes, NUL bytes rejected, common passwords blocked, never silently truncated', async () => {
    // 2a. Short password (< 8 bytes)
    const resShort = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_pass_short',
        email: 'short@example.com',
        password: 'short7',
      });
    assert.equal(resShort.status, 400);
    assert.equal(resShort.body.error, 'Password must be at least 8 bytes long');

    // 2b. Long password (> 72 bytes)
    const longPassword = 'a'.repeat(73);
    const resLong = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_pass_long',
        email: 'long@example.com',
        password: longPassword,
      });
    assert.equal(resLong.status, 400);
    assert.equal(resLong.body.error, 'Password must not exceed 72 bytes');

    // 2c. Common password blocklist
    for (const common of ['password', '12345678', 'qwerty123', 'admin123', 'welcome1']) {
      const resCommon = await request(app)
        .post('/api/auth/signup')
        .send({
          username: `test_${common}`,
          email: `${common}@example.com`,
          password: common,
        });
      assert.equal(resCommon.status, 400);
      assert.equal(resCommon.body.error, 'This password is too common and easily guessed');
    }

    // 2d. NUL bytes in password explicitly rejected
    const resNul = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_pass_nul',
        email: 'nul@example.com',
        password: 'pass\u0000word123',
      });
    assert.equal(resNul.status, 400);
    assert.match(resNul.body.error, /null characters/i);
  });

  test('3. JWT Access Token: 15-minute lifetime and carries no role claim', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_jwt_claims',
        email: 'jwtclaims@example.com',
        password: 'ValidPassword123!',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);

    const decoded = jwt.decode(res.body.token);
    assert.ok(decoded.id);
    assert.equal(decoded.username, 'test_jwt_claims');
    assert.equal(decoded.role, undefined, 'Role must NOT be present in JWT payload');

    // Lifetime is 15 minutes (900 seconds)
    const lifetimeSec = decoded.exp - decoded.iat;
    assert.equal(lifetimeSec, 900);
  });

  test('4. Rotating Refresh Tokens & Reuse Detection', async () => {
    // 4a. Signup provides initial refresh token
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_refresh_user',
        email: 'refresh_user@example.com',
        password: 'ValidPassword123!',
      });

    assert.equal(signupRes.status, 201);
    const initialRefresh = signupRes.body.refreshToken;
    assert.ok(initialRefresh);

    // 4b. Refresh route rotates token and provides new access token
    const refreshRes1 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: initialRefresh });

    assert.equal(refreshRes1.status, 200);
    assert.ok(refreshRes1.body.token);
    assert.ok(refreshRes1.body.refreshToken);
    const secondRefresh = refreshRes1.body.refreshToken;
    assert.notEqual(initialRefresh, secondRefresh);

    // 4c. Reuse Detection: attempting to use initialRefresh again triggers reuse alarm
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: initialRefresh });

    assert.equal(reuseRes.status, 401);
    assert.equal(reuseRes.body.code, 'TOKEN_REUSE_DETECTED');

    // 4d. The second refresh token is now also invalidated due to family revocation
    const cascadeRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: secondRefresh });

    assert.equal(cascadeRes.status, 401);
  });

  test('5. Logout and Logout-All sessions', async () => {
    const user = await createTestUser();

    // Login to get fresh refresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: user.password });

    assert.equal(loginRes.status, 200);
    const refreshToken = loginRes.body.refreshToken;

    // Logout single session
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });
    assert.equal(logoutRes.status, 200);

    // Refresh with logged-out token fails
    const refreshFail = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    assert.equal(refreshFail.status, 401);

    // Login again and perform logout-all
    const loginRes2 = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: user.password });
    const token2 = loginRes2.body.token;

    const logoutAllRes = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${token2}`)
      .send();
    assert.equal(logoutAllRes.status, 200);

    const activeTokens = await models.RefreshToken.countDocuments({ userId: user.id });
    assert.equal(activeTokens, 0);
  });

  test('6. POST /api/auth/change-password invalidates other sessions and unsets reset tokens', async () => {
    const user = await createTestUser();

    // Login to get access token and refresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: user.password });
    const oldAccessToken = loginRes.body.token;
    const oldRefreshToken = loginRes.body.refreshToken;

    // Change password
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${oldAccessToken}`)
      .send({
        currentPassword: user.password,
        newPassword: 'BrandNewSecurePassword123!',
      });

    assert.equal(changeRes.status, 200);
    assert.ok(changeRes.body.token);
    assert.ok(changeRes.body.refreshToken);

    // Old refresh token must be invalidated
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    assert.equal(refreshRes.status, 401);

    // Login with new password succeeds
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: 'BrandNewSecurePassword123!' });
    assert.equal(newLoginRes.status, 200);
  });

  test('7. Password Reset & Email Verification via Pluggable Mailer (non-blocking)', async () => {
    // 7a. Verification email sent on signup
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_mail_user',
        email: 'mailuser@example.com',
        password: 'ValidPassword123!',
      });

    assert.equal(signupRes.status, 201);
    // Yield execution tick for background mail delivery
    await new Promise((r) => setImmediate(r));

    const sentMails = __getSentMail();
    assert.equal(sentMails.length, 1);
    assert.equal(sentMails[0].to, 'mailuser@example.com');
    assert.match(sentMails[0].subject, /Verify/i);

    // Extract token from mail body
    const matchVerify = sentMails[0].text.match(/token: ([a-f0-9]+)/);
    assert.ok(matchVerify);
    const verificationToken = matchVerify[1];

    // Verify email
    const verifyRes = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken });
    assert.equal(verifyRes.status, 200);

    const userInDb = await models.User.findOne({ email: 'mailuser@example.com' });
    assert.equal(userInDb.emailVerified, true);

    // 7b. Forgot password (enumeration safe, non-blocking)
    __clearSentMail();
    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'mailuser@example.com' });

    assert.equal(forgotRes.status, 200);
    await new Promise((r) => setImmediate(r));

    const resetMails = __getSentMail();
    assert.equal(resetMails.length, 1);

    const matchReset = resetMails[0].text.match(/token: ([a-f0-9]+)/);
    assert.ok(matchReset);
    const resetToken = matchReset[1];

    // Reset password
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        newPassword: 'AfterResetPassword123!',
      });
    assert.equal(resetRes.status, 200);

    // Replay reset token fails (single-use)
    const replayReset = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        newPassword: 'AnotherPassword123!',
      });
    assert.equal(replayReset.status, 400);

    // Login with new password succeeds
    const loginAfterReset = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'mailuser@example.com', password: 'AfterResetPassword123!' });
    assert.equal(loginAfterReset.status, 200);
  });

  test('8. DELETE /api/auth/me requires currentPassword, transactional deletion, and reassigns contributions to tombstone', async () => {
    const user = await createTestUser();
    const postRes = await createTestPost(user.token);
    const post = postRes.body;

    // Create a comment by user
    const commentRes = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 'Comment to be anonymized' });
    assert.equal(commentRes.status, 201);
    const commentId = commentRes.body.comment._id;

    // Issue a refresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: user.password });
    const refreshToken = loginRes.body.refreshToken;

    // 8a. Deletion without currentPassword fails with 400
    const deleteFailNoPass = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    assert.equal(deleteFailNoPass.status, 400);

    // 8b. Deletion with incorrect currentPassword fails with 400
    const deleteFailWrongPass = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currentPassword: 'WrongPassword123!' });
    assert.equal(deleteFailWrongPass.status, 400);

    // 8c. Deletion with correct currentPassword succeeds
    const deleteRes = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currentPassword: user.password });

    assert.equal(deleteRes.status, 200);

    // User record is deleted
    const userCheck = await models.User.findById(user.id);
    assert.equal(userCheck, null);

    // Refresh token is deleted
    const tokenCheck = await models.RefreshToken.countDocuments({ userId: user.id });
    assert.equal(tokenCheck, 0);

    // Post is anonymized (authorId is reassigned to system TOMBSTONE_USER_ID, satisfying schema constraints)
    const postCheck = await models.Post.findById(post._id);
    assert.ok(postCheck.authorId.equals(TOMBSTONE_USER_ID));

    // Comment is anonymized (authorId is reassigned to system TOMBSTONE_USER_ID)
    const commentCheck = await models.Comment.findById(commentId);
    assert.ok(commentCheck.authorId.equals(TOMBSTONE_USER_ID));
  });

  test('9. Per-account login lockout after 5 consecutive failed attempts with oracle-safe timing', async () => {
    const user = await createTestUser();

    // 4 failed attempts: returns 401
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: user.username, password: 'WrongPassword123!' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Invalid username/email or password');
    }

    // 5th failed attempt: triggers lockout
    const res5 = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: 'WrongPassword123!' });
    assert.equal(res5.status, 401);
    assert.equal(res5.body.error, 'Invalid username/email or password');

    // Yield execution tick for background counter update
    await new Promise((r) => setImmediate(r));

    // Check DB state confirms account is locked
    const dbUser = await models.User.findById(user.id);
    assert.ok(dbUser.lockUntil && dbUser.lockUntil > new Date());
    assert.ok(dbUser.failedLoginAttempts >= 5);

    // 6th attempt with CORRECT password during lockout returns identical 401 (oracle-safe)
    const resBlocked = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: user.password });
    assert.equal(resBlocked.status, 401);
    assert.equal(resBlocked.body.error, 'Invalid username/email or password');
  });

  test('10. Startup validation refuses to boot if JWT secret is missing or under 32 characters', () => {
    const originalSecret = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      assert.throws(() => validateJwtConfig(), /FATAL: JWT_SECRET/);

      process.env.JWT_SECRET = 'too-short';
      assert.throws(() => validateJwtConfig(), /at least 32 characters/);

      process.env.JWT_SECRET = 'this-secret-is-more-than-32-characters-long!';
      assert.doesNotThrow(() => validateJwtConfig());
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  test('11. Key rotation: tokens signed with key ID (kid) verify cleanly against keyring', () => {
    const originalSecrets = process.env.JWT_SECRETS;
    const originalCurrent = process.env.JWT_CURRENT_KEY_ID;

    try {
      process.env.JWT_SECRETS = JSON.stringify({
        k1: 'secret-key-one-which-is-at-least-32-chars-long!',
        k2: 'secret-key-two-which-is-at-least-32-chars-long!',
      });
      process.env.JWT_CURRENT_KEY_ID = 'k2';

      const user = { _id: '6ad5fa805b2623b103a33b2a', username: 'test_kid_user' };
      const { generateAccessToken } = require('../services/token');
      const token = generateAccessToken(user);

      const decoded = jwt.decode(token, { complete: true });
      assert.equal(decoded.header.kid, 'k2');

      const verified = verifyAccessToken(token);
      assert.equal(verified.username, 'test_kid_user');
    } finally {
      process.env.JWT_SECRETS = originalSecrets;
      process.env.JWT_CURRENT_KEY_ID = originalCurrent;
    }
  });

  test('12. Concurrent refresh token requests: exactly one succeeds, duplicate triggers family revocation', async () => {
    const user = await createTestUser();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: user.password });
    const initialRefresh = loginRes.body.refreshToken;

    // Fire 2 concurrent refresh requests with the exact same unrevoked token
    const [resA, resB] = await Promise.all([
      request(app).post('/api/auth/refresh').send({ refreshToken: initialRefresh }),
      request(app).post('/api/auth/refresh').send({ refreshToken: initialRefresh }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 401], 'Exactly one refresh should succeed (200) and the duplicate must fail (401)');

    const failureRes = resA.status === 401 ? resA : resB;
    assert.equal(failureRes.body.code, 'TOKEN_REUSE_DETECTED');

    // Due to family revocation, child token in that family is also invalidated
    const successRes = resA.status === 200 ? resA : resB;
    const childRefresh = successRes.body.refreshToken;
    const childRefreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: childRefresh });
    assert.equal(childRefreshRes.status, 401);
  });

  test('13. POST /api/auth/change-password throttles and tracks failed attempts towards lockout', async () => {
    const user = await createTestUser();

    // 4 failed change-password attempts
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'WrongPassword!', newPassword: 'NewSecurePassword123!' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Current password is incorrect');
    }

    // 5th failed attempt triggers lockout
    const res5 = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currentPassword: 'WrongPassword!', newPassword: 'NewSecurePassword123!' });
    assert.equal(res5.status, 400);

    const dbUser = await models.User.findById(user.id);
    assert.ok(dbUser.lockUntil && dbUser.lockUntil > new Date());

    // Subsequent login is blocked by lockout (returns 401 generic error)
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: user.password });
    assert.equal(loginRes.status, 401);
    assert.equal(loginRes.body.error, 'Invalid username/email or password');
  });
});
