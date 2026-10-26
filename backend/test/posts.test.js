// backend/tests/posts.test.js
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  request,
  setupTestDb,
  teardownTestDb,
  clearCollections,
  createTestUser,
  models,
} = require('./setup');

describe('Posts Integration Tests', () => {
  let user;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    user = await createTestUser();
  });

  it('1. Create post returns 201 with stored URLs only', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Smoke Test Mysterious Stone',
        body: 'A weird engraved rock sitting at the edge of the lake.',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
        tags: ['stone', 'odd'],
      });

    assert.equal(res.status, 201);
    assert.ok(res.body._id);
    assert.equal(res.body.title, 'Smoke Test Mysterious Stone');
    assert.equal(res.body.images.length, 1);
    assert.equal(typeof res.body.images[0].url, 'string');
    assert.ok(res.body.images[0].url.startsWith('https://'));
    assert.equal(res.body.authorId, user.id, 'authorId must come strictly from JWT');
  });

  it('2. Author stats.posts is incremented upon post creation', async () => {
    const userBefore = await models.User.findById(user.id);
    const initialPosts = userBefore.stats?.posts || 0;

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Post Increment Check',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      });

    assert.equal(res.status, 201);
    const userAfter = await models.User.findById(user.id);
    assert.equal(userAfter.stats?.posts, initialPosts + 1);
  });

  it('3. Invalid coordinates return 400', async () => {
    // Latitude > 90
    const res1 = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Invalid Latitude',
        latitude: 95.0,
        longitude: 77.5,
        city: 'Bengaluru',
        country: 'India',
      });
    assert.equal(res1.status, 400);

    // Longitude > 180
    const res2 = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Invalid Longitude',
        latitude: 12.0,
        longitude: 195.0,
        city: 'Bengaluru',
        country: 'India',
      });
    assert.equal(res2.status, 400);
  });

  it('4. Insecure non-HTTPS image URL returns 400', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Insecure Image',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        images: ['http://insecure-site.com/pic.jpg'],
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /https/i);
  });

  it('5. Exceeding 6 images returns 400', async () => {
    const images = Array.from({ length: 7 }, (_, i) => `https://example.com/img${i}.jpg`);
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Seven Images',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        images,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /maximum of 6 images/i);
  });

  it('6. Exceeding 10 tags returns 400', async () => {
    const tooManyTags = Array.from({ length: 15 }, (_, i) => `tag${i}`);
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Too Many Tags Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        tags: tooManyTags,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /10 tags/i);
  });

  it('7. Tag exceeding 30 characters returns 400', async () => {
    const longTag = 'a'.repeat(31);
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Long Tag Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        tags: [longTag],
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /30 characters/i);
  });

  it('8. Unknown post type returns 400', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Unknown Type Post',
        type: 'hacked',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /type must be/i);
  });

  it('9. Unexpected input shape handled safely without 500', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Bad Shape Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        state: 12345, // Non-string state
        country: 'India',
        images: [{ url: 99999 }], // Non-string URL
      });

    assert.equal(res.status, 400);
  });

  it('10. Post title containing NUL character is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'bad\u0000title',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /null/i);
  });

  it('11. POST /api/v1/posts/:id/solve marks identify spot as solved by author only', async () => {
    const otherUser = await createTestUser({ username: 'solve_helper' });

    // Create an 'identify' post
    const postRes = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        type: 'identify',
        title: 'Mystery Archway in Forest',
        body: 'Can anyone tell me what this is?',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      });
    assert.equal(postRes.status, 201);
    const postId = postRes.body._id;

    // Helper comments with answer
    const commentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${otherUser.token}`)
      .send({ body: 'It is a 19th century aqueduct gate!' });
    assert.equal(commentRes.status, 201);
    const commentId = commentRes.body.comment._id;

    // Non-author attempting to solve gets 403
    const forbiddenSolve = await request(app)
      .post(`/api/v1/posts/${postId}/solve`)
      .set('Authorization', `Bearer ${otherUser.token}`)
      .send({ commentId });
    assert.equal(forbiddenSolve.status, 403);

    // Author solves successfully
    const solveRes = await request(app)
      .post(`/api/v1/posts/${postId}/solve`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ commentId });
    assert.equal(solveRes.status, 200);
    assert.equal(solveRes.body.ok, true);
    assert.equal(solveRes.body.post.solved, true);
    assert.equal(String(solveRes.body.post.bestCommentId), String(commentId));

    // Non-identify post rejected with 400
    const normalPostRes = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        type: 'find',
        title: 'Regular Find Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      });
    const normalSolveRes = await request(app)
      .post(`/api/v1/posts/${normalPostRes.body._id}/solve`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ commentId });
    assert.equal(normalSolveRes.status, 400);
  });

  it('12. POST /api/v1/posts/:id/updates appends author updates up to 10 max', async () => {
    const postRes = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Spot with Field Updates',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      });
    const postId = postRes.body._id;

    const otherUser = await createTestUser({ username: 'other_updater' });
    const forbiddenUpd = await request(app)
      .post(`/api/v1/posts/${postId}/updates`)
      .set('Authorization', `Bearer ${otherUser.token}`)
      .send({ body: 'Hacked update' });
    assert.equal(forbiddenUpd.status, 403);

    // Add first update
    const updRes = await request(app)
      .post(`/api/v1/posts/${postId}/updates`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 'Field check: Gate is now painted blue.' });
    assert.equal(updRes.status, 201);
    assert.equal(updRes.body.updates.length, 1);
    assert.equal(updRes.body.update.body, 'Field check: Gate is now painted blue.');

    // Fast-forward to 10 updates
    await models.Post.findByIdAndUpdate(postId, {
      $set: {
        updates: Array.from({ length: 10 }, (_, i) => ({
          body: `Update ${i + 1}`,
          createdAt: new Date(),
        })),
      },
    });

    const overflowUpd = await request(app)
      .post(`/api/v1/posts/${postId}/updates`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: '11th update should be blocked' });
    assert.equal(overflowUpd.status, 400);
    assert.match(overflowUpd.body.error, /maximum of 10 updates/i);
  });
});
