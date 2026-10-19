// backend/tests/auth.test.js
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  request,
  setupTestDb,
  teardownTestDb,
  clearCollections,
} = require('./setup');

describe('Auth Integration Tests', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it('1. Signup creates a new test user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_alice',
        email: 'test_alice@example.com',
        password: 'ValidPassword123!',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.ok(res.body.user);
    assert.equal(res.body.user.username, 'test_alice');
    assert.equal(res.body.user.email, 'test_alice@example.com');
    assert.equal(res.body.user.passwordHash, undefined, 'passwordHash must never be exposed');
  });

  it('2. Login returns JWT token with valid credentials', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_bob',
        email: 'test_bob@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'test_bob',
        password: 'Password123!',
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.username, 'test_bob');
  });

  it('3. Login with wrong password returns 401', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_carol',
        email: 'test_carol@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'test_carol',
        password: 'WrongPassword!',
      });

    assert.equal(res.status, 401);
    assert.match(res.body.error, /invalid/i);
  });

  it('4. Login with non-existent user returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'test_nonexistent',
        password: 'SomePassword123!',
      });

    assert.equal(res.status, 401);
    assert.match(res.body.error, /invalid/i);
  });

  it('5. Missing token on /api/auth/me returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('6. Duplicate username signup returns 409', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_dupuser',
        email: 'test_orig@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_dupuser',
        email: 'test_other@example.com',
        password: 'Password123!',
      });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /already taken/i);
  });

  it('7. Duplicate email signup returns 409', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_user_a',
        email: 'test_same@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_user_b',
        email: 'test_same@example.com',
        password: 'Password123!',
      });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /already registered/i);
  });

  it('8. Malformed JSON returns 400 with generic message and no parser internals', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json content');

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid JSON body');
    const rawText = JSON.stringify(res.body);
    assert.ok(!rawText.includes('SyntaxError'));
    assert.ok(!rawText.includes('at '));
  });

  it('9. Non-JSON Content-Type returns 400 without crashing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send('hello world');

    assert.equal(res.status, 400);
    assert.match(res.body.error, /application\/json/i);
  });

  it('10. Empty request body returns 400 without crashing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send();

    assert.equal(res.status, 400);
  });

  it('11. Short username and weak password rejected with 400', async () => {
    const shortUserRes = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'ab',
        email: 'test_short@example.com',
        password: 'ValidPassword123!',
      });
    assert.equal(shortUserRes.status, 400);

    const shortPassRes = await request(app)
      .post('/api/auth/signup')
      .send({
        username: 'test_validname',
        email: 'test_shortpass@example.com',
        password: '123',
      });
    assert.equal(shortPassRes.status, 400);
  });

  it('12. NoSQL operator injection in identifier returns 400 without 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: { $gt: '' },
        password: 'Password123!',
      });

    assert.equal(res.status, 400);
  });
});
