const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupTestDb, teardownTestDb, models } = require('./setup');
const { User, Post, Visit, Community, Membership } = models;

describe('Phase F6: User Visits, Posts & Communities Profile Endpoints', () => {
  let testUser;
  let testPostExact;
  let testPostHidden;
  let testCommunity;

  before(async () => {
    await setupTestDb();

    // Create test user
    testUser = await User.create({
      username: 'test_f6_scout',
      usernameLower: 'test_f6_scout',
      email: 'f6scout@oddspot.test',
      passwordHash: 'hash',
      badges: ['scout', 'first_visit'],
      stats: { posts: 2, visits: 2 },
    });

    // Create public exact post
    testPostExact = await Post.create({
      authorId: testUser._id,
      title: 'F6 Visible Anomaly',
      hideExact: false,
      place: { city: 'Portland', country: 'USA' },
      location: { type: 'Point', coordinates: [-122.6784, 45.5152] },
    });

    // Create hidden post
    testPostHidden = await Post.create({
      authorId: testUser._id,
      title: 'F6 Hidden Wonder',
      hideExact: true,
      place: { city: 'Portland', country: 'USA' },
      location: { type: 'Point', coordinates: [-122.6500, 45.5200] },
      feedLocation: { type: 'Point', coordinates: [-122.6550, 45.5250] },
    });

    // Create visits
    await Visit.create([
      {
        postId: testPostExact._id,
        userId: testUser._id,
        location: { type: 'Point', coordinates: [-122.6784, 45.5152] },
        verified: true,
        spotStatus: 'still_there',
        note: 'Still standing strong!',
        photoUrl: 'https://images.oddspot.test/proof1.jpg',
      },
      {
        postId: testPostHidden._id,
        userId: testUser._id,
        location: { type: 'Point', coordinates: [-122.6500, 45.5200] },
        verified: true,
        spotStatus: 'changed',
        note: 'Moss has taken over half of it',
      },
    ]);

    // Create community & membership
    testCommunity = await Community.create({
      name: 'Portland Urban Explorers',
      slug: 'portland-urban-f6',
      description: 'PDX weird spots',
      ownerId: testUser._id,
      memberCount: 1,
    });

    await Membership.create({
      communityId: testCommunity._id,
      userId: testUser._id,
      role: 'owner',
    });
  });

  after(async () => {
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testPostExact) await Post.deleteOne({ _id: testPostExact._id });
    if (testPostHidden) await Post.deleteOne({ _id: testPostHidden._id });
    if (testCommunity) {
      await Community.deleteOne({ _id: testCommunity._id });
      await Membership.deleteMany({ communityId: testCommunity._id });
    }
    await Visit.deleteMany({ userId: testUser?._id });
    await teardownTestDb();
  });

  it('1. GET /api/v1/users/:username/visits returns verified visits with sanitized post summaries', async () => {
    const res = await request(app).get(`/api/v1/users/${testUser.username}/visits`);
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.ok(Array.isArray(res.body.visits));

    // Verify hidden post visit uses fuzzed location and never leaks exact coords
    const hiddenVisit = res.body.visits.find((v) => v.postId === testPostHidden._id.toString());
    assert.ok(hiddenVisit);
    assert.equal(hiddenVisit.location.fuzzed, true);
    assert.deepEqual(hiddenVisit.location.coordinates, testPostHidden.feedLocation.coordinates);
    assert.notDeepEqual(hiddenVisit.location.coordinates, testPostHidden.location.coordinates);
    assert.equal(hiddenVisit.spotStatus, 'changed');
    assert.equal(hiddenVisit.note, 'Moss has taken over half of it');

    // Verify exact post visit
    const exactVisit = res.body.visits.find((v) => v.postId === testPostExact._id.toString());
    assert.ok(exactVisit);
    assert.equal(exactVisit.spotStatus, 'still_there');
    assert.equal(exactVisit.photoUrl, 'https://images.oddspot.test/proof1.jpg');
  });

  it('2. GET /api/v1/users/:username/posts returns serialized public posts', async () => {
    const res = await request(app).get(`/api/v1/users/${testUser.username}/posts`);
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.ok(Array.isArray(res.body.posts));
    assert.ok(res.body.posts[0].meter);
    assert.equal(res.body.posts[0].meter.label, 'Oddometer');
  });

  it('3. GET /api/v1/users/:username/communities returns joined communities with role', async () => {
    const res = await request(app).get(`/api/v1/users/${testUser.username}/communities`);
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.communities[0].slug, 'portland-urban-f6');
    assert.equal(res.body.communities[0].role, 'owner');
  });

  it('4. Returns 404 for non-existent username across all sub-endpoints', async () => {
    const resVisits = await request(app).get('/api/v1/users/non_existent_ghost_scout/visits');
    assert.equal(resVisits.status, 404);

    const resPosts = await request(app).get('/api/v1/users/non_existent_ghost_scout/posts');
    assert.equal(resPosts.status, 404);

    const resComms = await request(app).get('/api/v1/users/non_existent_ghost_scout/communities');
    assert.equal(resComms.status, 404);
  });
});
