// backend/test/phase8.test.js
// Regression test suite for Phase 8:
// - Regional Feeds: /feed/city, /feed/country, and /feed/random
// - Sort options: sort=new|hot|top with cursor pagination
// - Query optimization (.lean() and projections) and hideExact privacy protection
// - Weak ETag & Cache-Control: public, max-age=15, stale-while-revalidate=30 for anonymous requests
// - 304 Not Modified on If-None-Match match
// - Compound index verification: IXSCAN executionStats without COLLSCAN

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const { app, request, setupTestDb, teardownTestDb, clearCollections, createTestUser, mongoose } = require('./setup');
const { User, Post } = require('../models');
const { calculateHotScore } = require('../services/meter');

describe('Phase 8: Regional Feeds, Caching, Indexes & Pagination', () => {
  let user;

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
    user = await createTestUser(app, { username: 'test_p8_user', email: 'test_p8_user@example.com' });
  });

  // ============================================================================
  // Task P8-T2: City Feed (/feed/city)
  // ============================================================================
  describe('Task P8-T2: /feed/city', () => {
    it('1. returns posts filtered by cityKey and countryCode with default sort=new', async () => {
      // Create 2 posts in Bengaluru and 1 in Mumbai
      await Post.create([
        {
          authorId: user.id,
          title: 'Post BLR 1',
          location: { type: 'Point', coordinates: [77.59, 12.97] },
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
          createdAt: new Date('2026-10-01T10:00:00Z'),
        },
        {
          authorId: user.id,
          title: 'Post BLR 2',
          location: { type: 'Point', coordinates: [77.59, 12.97] },
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
          createdAt: new Date('2026-10-02T10:00:00Z'),
        },
        {
          authorId: user.id,
          title: 'Post BOM 1',
          location: { type: 'Point', coordinates: [72.87, 19.07] },
          place: { city: 'Mumbai', cityKey: 'mumbai', country: 'India', countryCode: 'IN' },
          createdAt: new Date('2026-10-03T10:00:00Z'),
        },
      ]);

      const res = await request(app).get('/api/v1/feed/city?cityKey=bengaluru&countryCode=IN');
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 2);
      assert.equal(res.body.posts[0].title, 'Post BLR 2', 'Default sort=new should return newest first');
      assert.equal(res.body.posts[1].title, 'Post BLR 1');
    });

    it('2. sorts by top (meter.score desc) and hot (hotScore desc)', async () => {
      await Post.create([
        {
          authorId: user.id,
          title: 'Low Score Recent',
          location: { type: 'Point', coordinates: [77.59, 12.97] },
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
          meter: { score: 5, likes: 5 },
          hotScore: 100,
          createdAt: new Date('2026-10-10T10:00:00Z'),
        },
        {
          authorId: user.id,
          title: 'High Score Older',
          location: { type: 'Point', coordinates: [77.59, 12.97] },
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
          meter: { score: 50, likes: 50 },
          hotScore: 50,
          createdAt: new Date('2026-10-01T10:00:00Z'),
        },
      ]);

      // sort=top
      const resTop = await request(app).get('/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&sort=top');
      assert.equal(resTop.status, 200);
      assert.equal(resTop.body.posts[0].title, 'High Score Older');

      // sort=hot
      const resHot = await request(app).get('/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&sort=hot');
      assert.equal(resHot.status, 200);
      assert.equal(resHot.body.posts[0].title, 'Low Score Recent');
    });

    it('3. supports cursor-based pagination across multiple pages', async () => {
      for (let i = 1; i <= 5; i++) {
        await Post.create({
          authorId: user.id,
          title: `Spot ${i}`,
          location: { type: 'Point', coordinates: [77.59, 12.97] },
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
          createdAt: new Date(Date.now() + i * 1000),
        });
      }

      // Page 1 with limit=2
      const page1 = await request(app).get('/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&limit=2');
      assert.equal(page1.status, 200);
      assert.equal(page1.body.posts.length, 2);
      assert.equal(page1.body.hasMore, true);
      assert.ok(page1.body.nextCursor);

      // Page 2 with cursor
      const page2 = await request(app).get(
        `/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&limit=2&cursor=${page1.body.nextCursor}`
      );
      assert.equal(page2.status, 200);
      assert.equal(page2.body.posts.length, 2);
      assert.notEqual(page2.body.posts[0].title, page1.body.posts[0].title);
      assert.notEqual(page2.body.posts[0].title, page1.body.posts[1].title);
    });

    it('4. rejects request missing city or country with 400', async () => {
      const resNoCountry = await request(app).get('/api/v1/feed/city?cityKey=bengaluru');
      assert.equal(resNoCountry.status, 400);

      const resNoCity = await request(app).get('/api/v1/feed/city?countryCode=IN');
      assert.equal(resNoCity.status, 400);
    });
  });

  // ============================================================================
  // Task P8-T2: Country Feed (/feed/country) & Random Feed (/feed/random)
  // ============================================================================
  describe('Task P8-T2: /feed/country and /feed/random', () => {
    it('5. /feed/country filters strictly on tier="country" and countryCode', async () => {
      await Post.create([
        {
          authorId: user.id,
          title: 'City Tier Post',
          tier: 'city',
          location: { type: 'Point', coordinates: [77.59, 12.97] },
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
        },
        {
          authorId: user.id,
          title: 'Country Tier Post IN',
          tier: 'country',
          location: { type: 'Point', coordinates: [77.59, 12.97] },
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
        },
        {
          authorId: user.id,
          title: 'Country Tier Post JP',
          tier: 'country',
          location: { type: 'Point', coordinates: [139.69, 35.68] },
          place: { city: 'Tokyo', cityKey: 'tokyo', country: 'Japan', countryCode: 'JP' },
        },
      ]);

      const res = await request(app).get('/api/v1/feed/country?countryCode=IN');
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 1);
      assert.equal(res.body.posts[0].title, 'Country Tier Post IN');
    });

    it('6. /feed/random returns random sample of country-tier spots with optional teleport', async () => {
      for (let i = 1; i <= 6; i++) {
        await Post.create({
          authorId: user.id,
          title: `Country Spot ${i}`,
          tier: 'country',
          location: { type: 'Point', coordinates: [77.59, 12.97] },
          place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
        });
      }

      const resAll = await request(app).get('/api/v1/feed/random?limit=3');
      assert.equal(resAll.status, 200);
      assert.equal(resAll.body.posts.length, 3);

      const resTeleport = await request(app).get('/api/v1/feed/random?countryCode=IN&limit=2');
      assert.equal(resTeleport.status, 200);
      assert.equal(resTeleport.body.posts.length, 2);
    });
  });

  // ============================================================================
  // Task P8-T2: Weak ETag & Cache-Control Headers
  // ============================================================================
  describe('Task P8-T2: Caching & 304 Not Modified', () => {
    it('7. sends Cache-Control: public and ETag for anonymous callers and returns 304 on match', async () => {
      await Post.create({
        authorId: user.id,
        title: 'Cache Test Spot',
        location: { type: 'Point', coordinates: [77.59, 12.97] },
        place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
      });

      // Anonymous GET request
      const firstRes = await request(app).get('/api/v1/feed/city?cityKey=bengaluru&countryCode=IN');
      assert.equal(firstRes.status, 200);

      const cacheControl = firstRes.headers['cache-control'];
      assert.ok(cacheControl, 'Cache-Control header must be present');
      assert.match(cacheControl, /public/);
      assert.match(cacheControl, /max-age=15/);
      assert.match(cacheControl, /stale-while-revalidate=30/);

      const etag = firstRes.headers['etag'];
      assert.ok(etag, 'ETag header must be present');
      assert.match(etag, /^W\/"[0-9a-fA-F]+"/);

      // Second request sending If-None-Match with exact ETag
      const secondRes = await request(app)
        .get('/api/v1/feed/city?cityKey=bengaluru&countryCode=IN')
        .set('If-None-Match', etag);

      assert.equal(secondRes.status, 304, 'ETag match must return 304 Not Modified');
      assert.equal(secondRes.text, '', '304 response body must be empty');
    });

    it('8. authenticated callers receive Cache-Control: no-store and 200', async () => {
      const authRes = await request(app)
        .get('/api/v1/feed/city?cityKey=bengaluru&countryCode=IN')
        .set('Authorization', `Bearer ${user.token}`);

      assert.equal(authRes.status, 200);
      const cacheControl = authRes.headers['cache-control'];
      assert.match(cacheControl, /no-store/, 'Authenticated requests must strictly enforce no-store');
    });
  });

  // ============================================================================
  // Task P8-T3: Compound Index & IXSCAN Coverage Verification
  // ============================================================================
  describe('Task P8-T3: Compound Index IXSCAN Verification', () => {
    it('9. City Feed queries (new, top, hot) execute via IXSCAN without COLLSCAN', async () => {
      await Post.create({
        authorId: user.id,
        title: 'Index Test Post',
        location: { type: 'Point', coordinates: [77.59, 12.97] },
        place: { city: 'Bengaluru', cityKey: 'bengaluru', country: 'India', countryCode: 'IN' },
        tier: 'country',
        hotScore: 100,
        meter: { score: 10 },
      });

      const sorts = [
        { sort: { createdAt: -1, _id: -1 }, name: 'new' },
        { sort: { 'meter.score': -1, _id: -1 }, name: 'top' },
        { sort: { hotScore: -1, _id: -1 }, name: 'hot' },
      ];

      for (const item of sorts) {
        const explain = await Post.find({
          removed: { $ne: true },
          'place.cityKey': 'bengaluru',
          'place.countryCode': 'IN',
        })
          .sort(item.sort)
          .limit(20)
          .explain('executionStats');

        const stages = JSON.stringify(explain.executionStats?.executionStages || {});
        assert.ok(!stages.includes('"COLLSCAN"'), `City feed (${item.name}) must not COLLSCAN`);
        assert.ok(stages.includes('"IXSCAN"'), `City feed (${item.name}) must use IXSCAN`);
      }
    });

    it('10. Country Feed queries (new, top, hot) execute via IXSCAN without COLLSCAN', async () => {
      const sorts = [
        { sort: { createdAt: -1, _id: -1 }, name: 'new' },
        { sort: { 'meter.score': -1, _id: -1 }, name: 'top' },
        { sort: { hotScore: -1, _id: -1 }, name: 'hot' },
      ];

      for (const item of sorts) {
        const explain = await Post.find({
          removed: { $ne: true },
          tier: 'country',
          'place.countryCode': 'IN',
        })
          .sort(item.sort)
          .limit(20)
          .explain('executionStats');

        const stages = JSON.stringify(explain.executionStats?.executionStages || {});
        assert.ok(!stages.includes('"COLLSCAN"'), `Country feed (${item.name}) must not COLLSCAN`);
        assert.ok(stages.includes('"IXSCAN"'), `Country feed (${item.name}) must use IXSCAN`);
      }
    });
  });
});
