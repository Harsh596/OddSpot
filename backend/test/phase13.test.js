// backend/test/phase13.test.js
// Tests for Phase P13: Notifications Engine (Triggers, Deduplication, Unread Counts & TTL)

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
const { Notification, Post, Comment } = models;
const meterService = require('../services/meter');
const { createNotification } = require('../services/notifications');

describe('Phase P13: Notifications Engine', () => {
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
    await Notification.deleteMany({});
  });

  it('1. Creates notifications for comment, reply, mention, and tier_up, and never notifies a user of their own actions', async () => {
    // 1. Setup users
    const userA = await createTestUser({ username: 'test_author_a' });
    const userB = await createTestUser({ username: 'test_commenter_b' });
    const userC = await createTestUser({ username: 'test_replier_c' });
    const userD = await createTestUser({ username: 'alice_mention_d' });

    // 2. User A creates a post
    const postRes = await createTestPost(userA.token, {
      title: 'Spot at the edge of the park',
      body: 'Check out this strange glowing rock',
    });
    assert.equal(postRes.status, 201);
    const postId = postRes.body._id;

    // A) Self-comments generate 0 notifications
    const selfCommentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ body: 'Self comment from post author' });
    assert.equal(selfCommentRes.status, 201);

    const authorNotifsAfterSelf = await Notification.find({ userId: userA.id });
    assert.equal(
      authorNotifsAfterSelf.length,
      0,
      'Author commenting on own post must generate 0 notifications'
    );

    // B) Top-level comment by User B generates 1 comment notification for User A, 0 for User B
    const commentBRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ body: 'Awesome find! Loved this place.' });
    assert.equal(commentBRes.status, 201);
    const commentBId = commentBRes.body.comment._id;

    const notifsForA = await Notification.find({ userId: userA.id, type: 'comment' });
    assert.equal(notifsForA.length, 1, 'Post author must receive exactly 1 comment notification');
    assert.equal(notifsForA[0].actorId.toString(), userB.id.toString());
    assert.equal(notifsForA[0].postId.toString(), postId.toString());

    const notifsForB = await Notification.find({ userId: userB.id });
    assert.equal(notifsForB.length, 0, 'Commenter must not receive a notification for their own comment');

    // C) User C replies to User B's comment
    // User B receives 1 reply notification, User A receives 1 comment notification, User C receives 0
    const replyCRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${userC.token}`)
      .send({
        body: 'Totally agree with you!',
        parentId: commentBId,
      });
    assert.equal(replyCRes.status, 201);

    const replyNotifsForB = await Notification.find({ userId: userB.id, type: 'reply' });
    assert.equal(replyNotifsForB.length, 1, 'Parent comment author must receive 1 reply notification');
    assert.equal(replyNotifsForB[0].actorId.toString(), userC.id.toString());

    const commentNotifsForAAfterReply = await Notification.find({ userId: userA.id, type: 'comment' });
    assert.equal(
      commentNotifsForAAfterReply.length,
      2,
      'Post author should receive comment notification for reply as well'
    );

    const notifsForC = await Notification.find({ userId: userC.id });
    assert.equal(notifsForC.length, 0, 'Replier must not receive a notification for their own action');

    // D) Mentions generate mention notification
    // User C posts a comment mentioning @alice_mention_d
    const mentionCommentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${userC.token}`)
      .send({ body: 'Hey @alice_mention_d take a look at this!' });
    assert.equal(mentionCommentRes.status, 201);

    const mentionNotifsForD = await Notification.find({ userId: userD.id, type: 'mention' });
    assert.equal(mentionNotifsForD.length, 1, 'Mentioned user must receive 1 mention notification');
    assert.equal(mentionNotifsForD[0].actorId.toString(), userC.id.toString());
    assert.equal(mentionNotifsForD[0].postId.toString(), postId.toString());

    // E) Tier-up generates tier_up notification
    // Apply enough score delta to cross the countryThreshold (default 50)
    await meterService.applyDelta(postId, { likes: 50 }, null, { userId: userB.id });

    const tierUpNotifsForA = await Notification.find({ userId: userA.id, type: 'tier_up' });
    assert.equal(tierUpNotifsForA.length, 1, 'Post author must receive 1 tier_up notification');
    assert.equal(tierUpNotifsForA[0].postId.toString(), postId.toString());
    assert.equal(tierUpNotifsForA[0].data.newTier, 'country');
  });

  it('2. Deduplicates multiple comments by the same actor on the same post within 1 hour into a single notification', async () => {
    const author = await createTestUser({ username: 'dedupe_author' });
    const spammer = await createTestUser({ username: 'dedupe_spammer' });

    const postRes = await createTestPost(author.token, {
      title: 'Spam target spot',
      body: 'Will receive rapid comments',
    });
    assert.equal(postRes.status, 201);
    const postId = postRes.body._id;

    // Send 4 comments from same user within rapid succession (< 1 minute)
    for (let i = 1; i <= 4; i++) {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${spammer.token}`)
        .send({ body: `Rapid comment #${i} within same minute` });
      assert.equal(res.status, 201);
    }

    // Verify exactly 1 notification document exists for author
    const authorCommentsNotifs = await Notification.find({
      userId: author.id,
      type: 'comment',
      actorId: spammer.id,
      postId,
    });

    assert.equal(
      authorCommentsNotifs.length,
      1,
      '4 comments from same user within 1 minute must create exactly 1 Notification document'
    );
  });

  it('3. GET /notifications returns cursor-paginated items with unreadCount and POST /notifications/read marks items or all as read (scoped to owner)', async () => {
    const userA = await createTestUser({ username: 'notif_reader_a' });
    const userB = await createTestUser({ username: 'notif_reader_b' });

    // Seed 5 unread notifications for user A with sequential timestamps
    const now = Date.now();
    const notifDocs = [];
    for (let i = 0; i < 5; i++) {
      const notif = await Notification.create({
        userId: userA.id,
        type: 'comment',
        dedupeKey: `seed_a_notif_${i}_${now}`,
        data: { index: i },
        read: false,
        createdAt: new Date(now - (5 - i) * 60000),
      });
      notifDocs.push(notif);
    }

    // Seed 1 unread notification for user B
    const userBNotif = await Notification.create({
      userId: userB.id,
      type: 'comment',
      dedupeKey: `seed_b_notif_${now}`,
      data: { owner: 'userB' },
      read: false,
      createdAt: new Date(now),
    });

    // 1. GET /api/v1/notifications with limit=2
    const page1Res = await request(app)
      .get('/api/v1/notifications?limit=2')
      .set('Authorization', `Bearer ${userA.token}`);
    assert.equal(page1Res.status, 200);
    assert.equal(page1Res.headers['cache-control'], 'no-store, no-cache, must-revalidate');
    assert.equal(page1Res.body.notifications.length, 2);
    assert.equal(page1Res.body.unreadCount, 5);
    assert.equal(page1Res.body.hasMore, true);
    assert(page1Res.body.nextCursor, 'Should have nextCursor');

    // 2. Fetch page 2 using cursor
    const page2Res = await request(app)
      .get(`/api/v1/notifications?cursor=${page1Res.body.nextCursor}&limit=2`)
      .set('Authorization', `Bearer ${userA.token}`);
    assert.equal(page2Res.status, 200);
    assert.equal(page2Res.body.notifications.length, 2);
    assert.equal(page2Res.body.unreadCount, 5);
    assert.equal(page2Res.body.hasMore, true);

    // 3. Fetch page 3 (last page)
    const page3Res = await request(app)
      .get(`/api/v1/notifications?cursor=${page2Res.body.nextCursor}&limit=2`)
      .set('Authorization', `Bearer ${userA.token}`);
    assert.equal(page3Res.status, 200);
    assert.equal(page3Res.body.notifications.length, 1);
    assert.equal(page3Res.body.hasMore, false);
    assert.equal(page3Res.body.nextCursor, null);

    // 4. Mark specific notification as read by ID (userA marks one of their own)
    const targetId = notifDocs[0]._id.toString();
    const readSpecificRes = await request(app)
      .post('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ ids: [targetId] });
    assert.equal(readSpecificRes.status, 200);
    assert.equal(readSpecificRes.body.ok, true);
    assert.equal(readSpecificRes.body.modifiedCount, 1);
    assert.equal(readSpecificRes.body.unreadCount, 4);

    // 5. Attempt to mark User B's notification as read using User A's token -> should NOT modify User B's notification
    const crossReadRes = await request(app)
      .post('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ ids: [userBNotif._id.toString()] });
    assert.equal(crossReadRes.status, 200);
    assert.equal(crossReadRes.body.ok, true);
    assert.equal(crossReadRes.body.modifiedCount, 0, 'Cannot mark another users notification as read');
    assert.equal(crossReadRes.body.unreadCount, 4);

    const bDoc = await Notification.findById(userBNotif._id);
    assert.equal(bDoc.read, false, 'User B notification must remain unread');

    // 6. Mark all as read for User A
    const readAllRes = await request(app)
      .post('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ all: true });
    assert.equal(readAllRes.status, 200);
    assert.equal(readAllRes.body.ok, true);
    assert.equal(readAllRes.body.modifiedCount, 4);
    assert.equal(readAllRes.body.unreadCount, 0);

    // Verify User A unread count is 0 in GET /notifications
    const verifyRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${userA.token}`);
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.unreadCount, 0);

    // Verify unreadOnly filter works
    const unreadOnlyRes = await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${userA.token}`);
    assert.equal(unreadOnlyRes.status, 200);
    assert.equal(unreadOnlyRes.body.notifications.length, 0);
  });
});
