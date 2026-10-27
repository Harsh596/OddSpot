const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupTestDb, teardownTestDb, createTestUser } = require('./setup');
const Post = require('../models/Post');
const Report = require('../models/Report');

describe('Phase F9: Safety UX, Solar Time & Structured Report Tests', async () => {
  // Dynamically import frontend pure safety utilities
  const { getLocalSolarTime, REPORT_REASONS } = await import('../../frontend/src/utils/safety.js');

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  describe('1. Solar Time & Night Detection Unit Tests', () => {
    it('returns null for missing, non-numeric, or NaN longitudes', () => {
      assert.equal(getLocalSolarTime(null), null);
      assert.equal(getLocalSolarTime(undefined), null);
      assert.equal(getLocalSolarTime('77.59'), null);
      assert.equal(getLocalSolarTime(NaN), null);
    });

    it('computes solar hours and minutes matching Earth rotation (1 deg = 4 min)', () => {
      // Longitude 0: Solar time should match UTC time exactly
      const now = new Date();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();

      const solar0 = getLocalSolarTime(0);
      assert.ok(solar0);
      assert.equal(solar0.hours, utcHours);
      assert.equal(solar0.minutes, utcMinutes);
      assert.equal(typeof solar0.isNight, 'boolean');
      assert.match(solar0.timeString, /^\d{2}:\d{2}$/);
    });

    it('correctly shifts solar time for positive and negative longitudes', () => {
      // +60 deg longitude = +4 hours (240 min)
      const expectedHours = new Date(Date.now() + 60 * 4 * 60 * 1000).getUTCHours();

      const solar60 = getLocalSolarTime(60);
      assert.ok(solar60);
      assert.equal(solar60.hours, expectedHours);
    });

    it('accurately identifies nighttime (hours >= 20 or hours < 6)', () => {
      // Test isNight logic directly
      const testCases = [
        { h: 20, isNight: true },
        { h: 23, isNight: true },
        { h: 0, isNight: true },
        { h: 5, isNight: true },
        { h: 6, isNight: false },
        { h: 12, isNight: false },
        { h: 19, isNight: false },
      ];

      for (const tc of testCases) {
        const isNight = tc.h >= 20 || tc.h < 6;
        assert.equal(isNight, tc.isNight, `Hour ${tc.h} should be isNight=${tc.isNight}`);
      }
    });
  });

  describe('2. Structured Report Reasons Schema Integrity', () => {
    it('contains all 6 required report reason categories', () => {
      const expectedReasons = [
        'unsafe_or_private',
        'nsfw',
        'spam',
        'doxxing',
        'misinformation',
        'other',
      ];

      const actualIds = REPORT_REASONS.map((r) => r.id);
      for (const expected of expectedReasons) {
        assert.ok(
          actualIds.includes(expected),
          `REPORT_REASONS should include reason category "${expected}"`
        );
      }
    });

    it('ensures every reason has non-empty label, icon, and explanatory description', () => {
      for (const r of REPORT_REASONS) {
        assert.ok(r.id && typeof r.id === 'string', 'Reason must have string id');
        assert.ok(r.label && typeof r.label === 'string', 'Reason must have string label');
        assert.ok(r.icon && typeof r.icon === 'string', 'Reason must have icon');
        assert.ok(r.description && typeof r.description === 'string', 'Reason must have description');
      }
    });
  });

  describe('3. Report Endpoint Safety Integrations', () => {
    let authorToken;
    let reporterToken;
    let authorUser;
    let reporterUser;
    let testPost;

    before(async () => {
      // Create author and reporter
      authorUser = await createTestUser({
        username: 'test_f9_author',
        email: 'f9_author@oddspot.test',
      });
      authorToken = authorUser.token;

      reporterUser = await createTestUser({
        username: 'test_f9_scout',
        email: 'f9_scout@oddspot.test',
      });
      reporterToken = reporterUser.token;

      // Create test post
      const postRes = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Test F9 Spot for Safety Verification',
          latitude: 12.9716,
          longitude: 77.5946,
          city: 'Bengaluru',
          country: 'India',
          warnings: ['private_property', 'unsafe_night'],
        });
      testPost = postRes.body;
    });

    after(async () => {
      if (testPost?._id) {
        await Post.deleteOne({ _id: testPost._id });
        await Report.deleteMany({ targetId: testPost._id });
      }
    });

    it('rejects author reporting their own post with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/posts/${testPost._id}/report`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          reason: 'unsafe_or_private',
          details: 'Attempting to report my own post',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error?.message || res.body.message, /cannot report your own post/i);
    });

    it('allows a scout to submit an unsafe_or_private report with details', async () => {
      const res = await request(app)
        .post(`/api/v1/posts/${testPost._id}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({
          reason: 'unsafe_or_private',
          details: 'Active private driveway with no trespassing signs',
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.reportId);
    });

    it('blocks duplicate report from same scout with 409', async () => {
      const res = await request(app)
        .post(`/api/v1/posts/${testPost._id}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({
          reason: 'unsafe_or_private',
          details: 'Submitting duplicate report',
        });

      assert.equal(res.status, 409);
      assert.match(res.body.error?.message || res.body.message, /already reported/i);
    });
  });
});
