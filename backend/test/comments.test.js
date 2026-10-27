// backend/tests/comments.test.js
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  request,
  setupTestDb,
  teardownTestDb,
  clearCollections,
  createTestUser,
  createTestPost,
  models,
} = require('./setup');

describe('Comments Integration Tests', () => {
  let user;
  let commenter;
  let post;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    user = await createTestUser();
    commenter = await createTestUser();
    const postRes = await createTestPost(user.token);
    post = postRes.body;
  });

  it('1. Comment without token returns 401', async () => {
    const res = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .send({ body: 'Unauthenticated comment' });

    assert.equal(res.status, 401);
  });

  it('2. Create comment returns 201 and updates post meter and score', async () => {
    const initialScore = post.meter?.score || 0;

    const res = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ body: 'Smoke test comment verifying applyDelta!' });

    assert.equal(res.status, 201);
    assert.ok(res.body.comment?._id);
    assert.equal(res.body.comment.body, 'Smoke test comment verifying applyDelta!');
    assert.equal(res.body.comment.authorId.username, commenter.username);

    // Verify post meter updated (+1 comment, +3 score)
    const updatedPost = await models.Post.findById(post._id);
    assert.equal(updatedPost.meter.comments, 1);
    assert.equal(updatedPost.meter.score, initialScore + 3);
  });

  it('3. Fetch comments returns list of comments for the post', async () => {
    await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 'First comment' });

    await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 'Second comment' });

    const getRes = await request(app).get(`/api/posts/${post._id}/comments`);

    assert.equal(getRes.status, 200);
    assert.ok(getRes.body.comments);
    assert.equal(getRes.body.comments.length, 2);
  });

  it('4. Comment on non-existent post returns 404', async () => {
    const fakeId = '660000000000000000000000';
    const res = await request(app)
      .post(`/api/posts/${fakeId}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 'Comment on nothing' });

    assert.equal(res.status, 404);
  });

  it('5. Comment with empty or non-string body returns 400', async () => {
    const res1 = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: '   ' });
    assert.equal(res1.status, 400);

    const res2 = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 12345 });
    assert.equal(res2.status, 400);
  });

  it('6. Comment with invalid parentId returns 400', async () => {
    const res = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        body: 'Reply to invalid parent',
        parentId: 'not-a-valid-object-id',
      });

    assert.equal(res.status, 400);
  });
});
