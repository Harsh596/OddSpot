const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupTestDb, teardownTestDb, createTestUser } = require('./setup');
const { Notification, Community, Membership, Post, User } = require('../models');

describe('Phase F10: Notifications Drawer, Communities Hub & Profile Layout Tests', () => {
  let userA, userB;
  let testCommunity;
  let testPost;

  before(async () => {
    await setupTestDb();

    userA = await createTestUser({
      username: 'test_f10_alice',
      email: 'f10_alice@oddspot.test',
    });

    userB = await createTestUser({
      username: 'test_f10_bob',
      email: 'f10_bob@oddspot.test',
    });
  });

  after(async () => {
    await teardownTestDb();
  });

  describe('1. Notifications API (Drawer Support)', () => {
    let notif1, notif2;

    before(async () => {
      // Create mock notifications for userA
      notif1 = await Notification.create({
        userId: userA.id,
        actorId: userB.id,
        type: 'comment',
        read: false,
        data: { preview: 'Great spot find!' },
      });

      notif2 = await Notification.create({
        userId: userA.id,
        actorId: userB.id,
        type: 'tier_up',
        read: false,
        data: { newTier: 'city' },
      });
    });

    it('requires authentication on GET /api/v1/notifications', async () => {
      const res = await request(app).get('/api/v1/notifications');
      assert.equal(res.status, 401);
    });

    it('fetches notifications with unreadCount and Cache-Control: no-store', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userA.token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.notifications));
      assert.ok(res.body.unreadCount >= 2);
      assert.match(res.headers['cache-control'], /no-store/i);
    });

    it('marks a specific notification as read via POST /api/v1/notifications/read', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ ids: [notif1._id.toString()] });

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.modifiedCount, 1);

      const updated = await Notification.findById(notif1._id);
      assert.equal(updated.read, true);
    });

    it('marks all notifications as read when { all: true }', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ all: true });

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.unreadCount, 0);

      const unreadCountInDb = await Notification.countDocuments({
        userId: userA.id,
        read: false,
      });
      assert.equal(unreadCountInDb, 0);
    });
  });

  describe('2. Communities Hub & Detail API', () => {
    const slug = `test-bengaluru-syndicate-${Date.now()}`;

    it('creates a new community and assigns creator as owner with memberCount=1', async () => {
      const res = await request(app)
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          name: 'Bengaluru Underground',
          slug,
          description: 'Secret passages, forgotten tunnels, and rooftop oddities of Bengaluru.',
          scope: 'city',
          place: {
            city: 'Bengaluru',
            country: 'India',
          },
          coordinates: [77.5946, 12.9716],
          rules: ['Stay off restricted tracks', 'Carry a backup torch'],
          flairs: ['underground', 'rooftops', 'tunnels'],
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.community);
      assert.equal(res.body.community.slug, slug);
      assert.equal(res.body.community.memberCount, 1);
      assert.equal(res.body.role, 'owner');

      testCommunity = res.body.community;
    });

    it('finds the community via GET /api/v1/communities/nearby', async () => {
      const res = await request(app)
        .get('/api/v1/communities/nearby')
        .query({
          latitude: 12.9716,
          longitude: 77.5946,
          radiusKm: 25,
        });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.communities));
      const found = res.body.communities.find((c) => c.slug === slug);
      assert.ok(found, 'Created community should appear in nearby search results');
    });

    it('retrieves community detail with isMember=true for creator and false for non-member', async () => {
      // Check as creator (userA)
      const resA = await request(app)
        .get(`/api/v1/communities/${slug}`)
        .set('Authorization', `Bearer ${userA.token}`);

      assert.equal(resA.status, 200);
      assert.equal(resA.body.community.slug, slug);
      assert.equal(resA.body.isMember, true);
      assert.equal(resA.body.memberRole, 'owner');
      assert.equal(resA.body.community.rules.length, 2);
      assert.equal(resA.body.community.flairs.length, 3);

      // Check as non-member (userB)
      const resB = await request(app)
        .get(`/api/v1/communities/${slug}`)
        .set('Authorization', `Bearer ${userB.token}`);

      assert.equal(resB.status, 200);
      assert.equal(resB.body.isMember, false);
      assert.equal(resB.body.memberRole, null);
    });

    it('allows a user to join community atomically via POST /join', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${slug}/join`)
        .set('Authorization', `Bearer ${userB.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.joined, true);
      assert.equal(res.body.memberCount, 2);

      const membership = await Membership.findOne({
        userId: userB.id,
        communityId: testCommunity._id,
      });
      assert.ok(membership);
      assert.equal(membership.role, 'member');
    });

    it('allows a member to leave community atomically via POST /leave', async () => {
      const res = await request(app)
        .post(`/api/v1/communities/${slug}/leave`)
        .set('Authorization', `Bearer ${userB.token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.left, true);
      assert.equal(res.body.memberCount, 1);

      const membership = await Membership.findOne({
        userId: userB.id,
        communityId: testCommunity._id,
      });
      assert.equal(membership, null);
    });

    it('filters posts by community slug via GET /api/v1/communities/:slug/posts', async () => {
      // Create a post linked to this community
      const postRes = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          title: 'Subterranean Reservoir Hatch',
          latitude: 12.972,
          longitude: 77.595,
          city: 'Bengaluru',
          country: 'India',
          communityId: testCommunity._id,
        });

      testPost = postRes.body;

      const feedRes = await request(app)
        .get(`/api/v1/communities/${slug}/posts`)
        .query({ sort: 'new' });

      assert.equal(feedRes.status, 200);
      assert.ok(Array.isArray(feedRes.body.posts));
      const hasPost = feedRes.body.posts.some((p) => p._id.toString() === testPost._id.toString());
      assert.ok(hasPost, 'Community posts feed should contain newly created spot');
    });
  });

  describe('3. Profile Layout Preferences API', () => {
    it('persists customized widgetOrder in user preferences', async () => {
      const customLayout = {
        widgetOrder: ['stats', 'badges', 'tabs'],
      };

      const patchRes = await request(app)
        .patch('/api/v1/users/me/preferences')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          profileLayout: customLayout,
        });

      assert.equal(patchRes.status, 200);
      assert.deepEqual(patchRes.body.preferences?.profileLayout?.widgetOrder, [
        'stats',
        'badges',
        'tabs',
      ]);

      // Verify persistence directly in User model
      const userDoc = await User.findById(userA.id).lean();
      assert.deepEqual(userDoc.profileLayout?.widgetOrder, [
        'stats',
        'badges',
        'tabs',
      ]);
    });
  });
});
