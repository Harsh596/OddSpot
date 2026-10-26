const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupTestDb, teardownTestDb, createTestUser } = require('./setup');

describe('Phase F7: Scout Onboarding Completion & Scout Badge Award', () => {
  let user;

  before(async () => {
    await setupTestDb();
    user = await createTestUser({
      username: 'test_f7_recruit',
      email: 'recruit_f7@oddspot.test',
      badges: [],
      onboardingDone: false,
    });
  });

  after(async () => {
    await teardownTestDb();
  });

  it('1. POST /api/v1/users/me/onboarding-complete returns 401 if unauthenticated', async () => {
    const res = await request(app).post('/api/v1/users/me/onboarding-complete');
    assert.equal(res.status, 401);
  });

  it('2. POST /api/v1/users/me/onboarding-complete sets onboardingDone: true and awards scout badge', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/onboarding-complete')
      .set('Authorization', `Bearer ${user.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.onboardingDone, true);
    assert.ok(Array.isArray(res.body.badges));
    assert.ok(res.body.badges.includes('scout'));
  });

  it('3. POST /api/v1/users/me/onboarding-complete is idempotent ($addToSet does not duplicate scout badge)', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/onboarding-complete')
      .set('Authorization', `Bearer ${user.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.onboardingDone, true);
    const scoutCount = res.body.badges.filter((b) => b === 'scout').length;
    assert.equal(scoutCount, 1, 'Badge scout must not be duplicated');
  });

  it('4. GET /api/auth/me returns onboardingDone: true and scout badge', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.user.onboardingDone, true);
    assert.ok(res.body.user.badges.includes('scout'));
  });
});
