// backend/test/phase14.test.js
// Tests for Phase P14: Communities, Whitelisted Home Feed Rule Interpreter & Verified GPS Visits

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');

const {
  setupTestDb,
  teardownTestDb,
  clearCollections,
  createTestUser,
  createTestPost,
  app,
  models,
} = require('./setup');
const { Community, Membership, Post, Visit, User, Notification, AuditLog } = models;

describe('Phase P14: Communities, Feed Rules & Verified Visits', () => {
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
    await Community.deleteMany({});
    await Membership.deleteMany({});
    await Visit.deleteMany({});
    await Notification.deleteMany({});
    await AuditLog.deleteMany({});
  });

  it('1. Communities: create, nearby discovery, join/leave atomically updates memberCount, and per-community feed returns posts', async () => {
    const owner = await createTestUser({ username: 'comm_owner' });
    const user2 = await createTestUser({ username: 'comm_user_2' });
    const user3 = await createTestUser({ username: 'comm_user_3' });

    // A) Create community
    const createRes = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Urban Explorers Rome',
        slug: 'urban-explorers-rome',
        description: 'Exploring hidden ruins and underground spots in Rome',
        scope: 'city',
        place: { city: 'Rome', country: 'Italy' },
        coordinates: [12.4924, 41.8902],
        rules: ['Leave no trace', 'Respect historic sites'],
        flairs: ['ruins', 'underground'],
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.community.slug, 'urban-explorers-rome');
    assert.equal(createRes.body.community.memberCount, 1);
    assert.equal(createRes.body.role, 'owner');
    const communityId = createRes.body.community._id;

    // Verify owner membership created
    const ownerMembership = await Membership.findOne({
      userId: owner.id,
      communityId,
    });
    assert(ownerMembership);
    assert.equal(ownerMembership.role, 'owner');

    // B) Nearby discovery via coordinates
    const nearbyRes = await request(app)
      .get('/api/v1/communities/nearby')
      .query({
        latitude: 41.8902,
        longitude: 12.4924,
        radius: 10000,
      });
    assert.equal(nearbyRes.status, 200);
    assert(Array.isArray(nearbyRes.body.communities));
    assert(
      nearbyRes.body.communities.some((c) => c.slug === 'urban-explorers-rome'),
      'Nearby search must discover community within 10km'
    );

    // C) Parallel joins: User 2 and User 3 join simultaneously
    const [join2Res, join3Res] = await Promise.all([
      request(app)
        .post('/api/v1/communities/urban-explorers-rome/join')
        .set('Authorization', `Bearer ${user2.token}`),
      request(app)
        .post('/api/v1/communities/urban-explorers-rome/join')
        .set('Authorization', `Bearer ${user3.token}`),
    ]);

    assert.equal(join2Res.status, 200);
    assert.equal(join3Res.status, 200);

    // Verify memberCount is atomically updated to 3
    const commAfterJoins = await Community.findById(communityId);
    assert.equal(
      commAfterJoins.memberCount,
      3,
      'memberCount must be exactly 3 after 2 parallel joins'
    );

    // Verify GET /api/v1/communities/:slug reflects membership for caller
    const getCommRes = await request(app)
      .get('/api/v1/communities/urban-explorers-rome')
      .set('Authorization', `Bearer ${user2.token}`);
    assert.equal(getCommRes.status, 200);
    assert.equal(getCommRes.body.isMember, true);
    assert.equal(getCommRes.body.memberRole, 'member');

    // D) Leave: User 2 leaves community
    const leaveRes = await request(app)
      .post('/api/v1/communities/urban-explorers-rome/leave')
      .set('Authorization', `Bearer ${user2.token}`);
    assert.equal(leaveRes.status, 200);
    assert.equal(leaveRes.body.left, true);

    const commAfterLeave = await Community.findById(communityId);
    assert.equal(
      commAfterLeave.memberCount,
      2,
      'memberCount must decrement to 2 after member leaves'
    );

    // E) Owner cannot leave without transferring ownership (400)
    const ownerLeaveRes = await request(app)
      .post('/api/v1/communities/urban-explorers-rome/leave')
      .set('Authorization', `Bearer ${owner.token}`);
    assert.equal(ownerLeaveRes.status, 400);

    // F) Per-community feed returns community posts
    const postRes = await createTestPost(owner.token, {
      title: 'Hidden Mithraeum below church',
      communityId,
    });
    assert.equal(postRes.status, 201);

    const commPostsRes = await request(app).get(
      '/api/v1/communities/urban-explorers-rome/posts'
    );
    assert.equal(commPostsRes.status, 200);
    assert.equal(commPostsRes.body.posts.length, 1);
    assert.equal(commPostsRes.body.posts[0].title, 'Hidden Mithraeum below church');
  });

  it('2. Whitelisted feed rule interpreter filters by excludeTags, minScore, and boosts preferred tags without eval, and rejects unknown rule keys', async () => {
    const user = await createTestUser({ username: 'rules_user' });
    const author = await createTestUser({ username: 'rules_author' });

    // Create a community and have user join it
    const commRes = await request(app)
      .post('/api/v1/communities')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Weird Architecture Club',
        slug: 'weird-architecture',
      });
    assert.equal(commRes.status, 201);
    const communityId = commRes.body.community._id;

    // Seed 3 posts in this community:
    // Post A: tags: ['architecture', 'weird'], score: 15
    const postARes = await createTestPost(author.token, {
      title: 'Post A Architecture Regular',
      communityId,
      tags: ['architecture', 'weird'],
    });
    assert.equal(postARes.status, 201);
    await Post.updateOne(
      { _id: postARes.body._id },
      { $set: { 'meter.score': 15, hotScore: 15 } }
    );

    // Post B: tags: ['danger', 'rooftop'], score: 25 (has excluded tag 'danger')
    const postBRes = await createTestPost(author.token, {
      title: 'Post B Dangerous Rooftop',
      communityId,
      tags: ['danger', 'rooftop'],
    });
    assert.equal(postBRes.status, 201);
    await Post.updateOne(
      { _id: postBRes.body._id },
      { $set: { 'meter.score': 25, hotScore: 25 } }
    );

    // Post C: tags: ['neon', 'architecture'], score: 10 (has boost tag 'neon' -> 10 * 2.5 = 25)
    const postCRes = await createTestPost(author.token, {
      title: 'Post C Neon Facade',
      communityId,
      tags: ['neon', 'architecture'],
    });
    assert.equal(postCRes.status, 201);
    await Post.updateOne(
      { _id: postCRes.body._id },
      { $set: { 'meter.score': 10, hotScore: 10 } }
    );

    // 1. Rejects dangerous $where injection or unknown rule keys with 400
    const evilPrefRes = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        feedConfig: {
          mode: 'rules',
          rules: {
            version: 1,
            $where: 'function() { return true; }',
          },
        },
      });
    assert.equal(evilPrefRes.status, 400);

    const unknownKeyPrefRes = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        feedConfig: {
          mode: 'rules',
          rules: {
            version: 1,
            maliciousField: true,
          },
        },
      });
    assert.equal(unknownKeyPrefRes.status, 400);

    // 2. Set valid whitelisted rules: excludeTags: ['danger'], minScore: 5, boostTags: [{ tag: 'neon', multiplier: 2.5 }]
    const validPrefRes = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        feedConfig: {
          mode: 'rules',
          rules: {
            version: 1,
            excludeTags: ['danger'],
            minScore: 5,
            boostTags: [{ tag: 'neon', multiplier: 2.5 }],
          },
        },
      });
    assert.equal(validPrefRes.status, 200);

    // 3. Query GET /api/v1/feed/home
    const homeFeedRes = await request(app)
      .get('/api/v1/feed/home')
      .set('Authorization', `Bearer ${user.token}`);
    assert.equal(homeFeedRes.status, 200);
    assert.equal(homeFeedRes.body.mode, 'rules');

    const feedPosts = homeFeedRes.body.posts;
    // Post B must be excluded because of 'danger' tag
    assert(
      !feedPosts.some((p) => p.title === 'Post B Dangerous Rooftop'),
      "Post B with excluded tag 'danger' must not appear in feed"
    );

    // Both Post C and Post A should be present
    assert.equal(feedPosts.length, 2);

    // Because Post C has tag 'neon' boosted by 2.5x (10 * 2.5 = 25 vs Post A score 15), Post C should rank first!
    assert.equal(
      feedPosts[0].title,
      'Post C Neon Facade',
      'Post C with boosted tag neon must rank above Post A'
    );
    assert.equal(feedPosts[1].title, 'Post A Architecture Regular');
  });

  it('3. POST /posts/:id/visit rejects caller 120m away without leaking distance, accepts caller 20m away (+4 meter score), blocks duplicate visits (409), blocks impossible-speed spoofing (403), and never leaks hidden post coordinates', async () => {
    const author = await createTestUser({ username: 'visit_author' });
    const visitor = await createTestUser({ username: 'visit_visitor' });

    // Spot coordinates in Rome: Colosseum [12.4924, 41.8902]
    const postRes = await createTestPost(author.token, {
      title: 'Ancient Colosseum Secret Niche',
      latitude: 41.8902,
      longitude: 12.4924,
      hideExact: true,
    });
    assert.equal(postRes.status, 201);
    const postId = postRes.body._id;

    // A) Caller 120m away rejected with 403 without leaking exact coordinates or distance
    // 0.0011 degrees latitude is ~122 meters away
    const farRes = await request(app)
      .post(`/api/v1/posts/${postId}/visit`)
      .set('Authorization', `Bearer ${visitor.token}`)
      .send({
        latitude: 41.8913,
        longitude: 12.4924,
      });

    assert.equal(farRes.status, 403);
    assert(
      !farRes.text.includes('122') && !farRes.text.includes('41.8902'),
      '403 response must NEVER leak exact distance or true coordinates'
    );

    // B) Author cannot visit own spot (403)
    const authorVisitRes = await request(app)
      .post(`/api/v1/posts/${postId}/visit`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        latitude: 41.8902,
        longitude: 12.4924,
      });
    assert.equal(authorVisitRes.status, 403);

    // C) Caller 20m away accepted with 201 (+4 meter score, badges, author notification)
    // 0.00015 degrees latitude is ~16.7 meters away
    const closeRes = await request(app)
      .post(`/api/v1/posts/${postId}/visit`)
      .set('Authorization', `Bearer ${visitor.token}`)
      .send({
        latitude: 41.89035,
        longitude: 12.4924,
        note: 'Found the ancient mark behind the column!',
        spotStatus: 'still_there',
      });

    assert.equal(closeRes.status, 201);
    assert.equal(closeRes.body.ok, true);
    assert.equal(closeRes.body.meterScore, 4, 'Score must increase by +4 for visit');
    assert.equal(closeRes.body.visit.spotStatus, 'still_there');

    // Confirm true coordinates are NOT leaked in response
    assert.equal(closeRes.body.visit.location, undefined);

    // Verify author received visit notification
    const authorNotifs = await Notification.find({
      userId: author.id,
      type: 'visit',
      postId,
    });
    assert.equal(authorNotifs.length, 1, 'Post author must receive 1 visit notification');

    // Verify visitor received badge 'first_visit'
    const updatedVisitor = await User.findById(visitor.id);
    assert.equal(updatedVisitor.stats.visits, 1);
    assert(
      updatedVisitor.badges.includes('first_visit'),
      'Visitor must receive first_visit badge'
    );

    // D) Duplicate visit rejected with 409
    const dupRes = await request(app)
      .post(`/api/v1/posts/${postId}/visit`)
      .set('Authorization', `Bearer ${visitor.token}`)
      .send({
        latitude: 41.89035,
        longitude: 12.4924,
      });
    assert.equal(dupRes.status, 409);

    // E) Impossible speed check: visitor immediately visits spot 1000km away (Paris) -> 403 & AuditLog
    const parisPostRes = await createTestPost(author.token, {
      title: 'Eiffel Tower Oddity',
      latitude: 48.8584,
      longitude: 2.2945,
    });
    const parisPostId = parisPostRes.body._id;

    const spoofRes = await request(app)
      .post(`/api/v1/posts/${parisPostId}/visit`)
      .set('Authorization', `Bearer ${visitor.token}`)
      .send({
        latitude: 48.8584,
        longitude: 2.2945,
      });

    assert.equal(spoofRes.status, 403);
    assert(
      spoofRes.body.message.includes('impossible travel speed'),
      'Must reject impossible speed'
    );

    // Verify AuditLog recorded the incident
    const auditRecord = await AuditLog.findOne({
      actorId: visitor.id,
      action: 'impossible_speed_visit_blocked',
    });
    assert(auditRecord, 'AuditLog must record impossible_speed_visit_blocked');

    // F) GET /api/v1/posts/:id/visits lists visits without leaking visit.location
    const listVisitsRes = await request(app).get(`/api/v1/posts/${postId}/visits`);
    assert.equal(listVisitsRes.status, 200);
    assert.equal(listVisitsRes.body.visits.length, 1);
    assert.equal(listVisitsRes.body.visits[0].location, undefined);
    assert.equal(listVisitsRes.body.visits[0].user.username, 'visit_visitor');
  });
});
