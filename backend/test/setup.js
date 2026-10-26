// backend/test/setup.js
// Shared test setup and helpers using mongodb-memory-server and supertest

process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-very-secure-1234567890-test-key';
}
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '10000';
process.env.WRITE_RATE_LIMIT_MAX = process.env.WRITE_RATE_LIMIT_MAX || '10000';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');
const { connect, disconnect, mongoose, assertSafeTestDatabase } = require('../db');
const { app } = require('../app');
const models = require('../models');

let mongod = null;

async function setupTestDb() {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    if (!mongod) {
      mongod = await MongoMemoryReplSet.create({
        replSet: { count: 1, dbName: 'oddspot_test_2' },
      });
    }
    uri = mongod.getUri();
  }

  // Enforce test database safety barrier
  assertSafeTestDatabase(uri);

  await connect(uri);

  // Sync collections and indexes
  for (const Model of Object.values(models)) {
    await Model.createCollection().catch(() => {});
    await Model.syncIndexes();
  }

  return uri;
}

async function teardownTestDb() {
  await disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

async function clearCollections() {
  for (const Model of Object.values(models)) {
    await Model.deleteMany({});
  }
}

let userCounter = 0;
async function createTestUser(overrides = {}) {
  userCounter++;
  const runId = `${Date.now().toString().slice(-6)}_${userCounter}`;
  const username = overrides.username || `test_u_${runId}`;
  const email = overrides.email || `test_${runId}@example.com`;
  const password = overrides.password || 'TestPassword123!';

  const res = await request(app)
    .post('/api/auth/signup')
    .send({ username, email, password });

  if (res.status !== 201) {
    throw new Error(`Failed to create test user: ${res.status} ${JSON.stringify(res.body)}`);
  }

  let token = res.body.token;
  let user = res.body.user;

  // Handle banned or role overrides directly in DB if requested
  if (overrides.banned !== undefined || overrides.role !== undefined) {
    const update = {};
    if (overrides.banned !== undefined) update.banned = overrides.banned;
    if (overrides.role !== undefined) update.role = overrides.role;
    await models.User.findByIdAndUpdate(user.id, update);
  }

  return {
    id: user.id,
    username,
    email,
    password,
    token,
    refreshToken: res.body.refreshToken,
  };
}

let postCounter = 0;
async function createTestPost(token, overrides = {}) {
  postCounter++;
  const payload = {
    title: `test_post_${postCounter}`,
    body: 'Test post body description',
    latitude: 12.9716,
    longitude: 77.5946,
    city: 'Bengaluru',
    country: 'India',
    images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
    tags: ['odd', 'spot'],
    ...overrides,
  };

  const req = request(app).post('/api/posts');
  if (token) req.set('Authorization', `Bearer ${token}`);
  const res = await req.send(payload);

  return res;
}

module.exports = {
  app,
  request,
  setupTestDb,
  teardownTestDb,
  clearCollections,
  createTestUser,
  createTestPost,
  models,
  mongoose,
  assertSafeTestDatabase,
};
