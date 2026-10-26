// backend/test/phase10.test.js
// Tests for Phase P10: Database Safety (collMod Schemas, Migrations, Storage Report & Backups)

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');

const { setupTestDb, teardownTestDb } = require('./setup');
const { User, Post, Vote, SchemaVersion } = require('../models');
const { applyCollectionValidators } = require('../scripts/applySchemaValidation');
const { runMigrations } = require('../migrations/runner');
const { generateStorageReport } = require('../scripts/storageReport');
const { dumpDatabase, restoreDatabase } = require('../scripts/jsonBackupRestore');

describe('Phase 10: Database Safety, Migrations & Backup Verification', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
    if (mongoose && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. collMod $jsonSchema rejects raw driver insert bypassing Mongoose when post title > 140 chars or vote value is 99', async () => {
    const db = mongoose.connection.db;
    await applyCollectionValidators(db);

    // Test raw insert into 'votes' bypassing Mongoose validation
    const invalidVote = {
      userId: new mongoose.Types.ObjectId(),
      postId: new mongoose.Types.ObjectId(),
      value: 99, // Allowed values are only [1, -1]
    };

    let voteErr = null;
    try {
      await db.collection('votes').insertOne(invalidVote);
    } catch (err) {
      voteErr = err;
    }

    assert(voteErr, 'Expected raw insert with value: 99 to fail MongoDB $jsonSchema validation');
    assert.strictEqual(voteErr.code, 121, `Expected Mongo error code 121 (Document failed validation), got ${voteErr.code}`);

    // Test raw insert into 'posts' with title exceeding 140 chars
    const invalidPost = {
      title: 'A'.repeat(141),
      location: {
        type: 'Point',
        coordinates: [12.3456, 78.9012],
      },
      feedLocation: {
        type: 'Point',
        coordinates: [12.3456, 78.9012],
      },
      tier: 'city',
    };

    let postErr = null;
    try {
      await db.collection('posts').insertOne(invalidPost);
    } catch (err) {
      postErr = err;
    }

    assert(postErr, 'Expected raw insert with title > 140 chars to fail MongoDB $jsonSchema validation');
    assert.strictEqual(postErr.code, 121, `Expected Mongo error code 121, got ${postErr.code}`);
  });

  it('2. Migration runner applies pending migrations once and is idempotent on second run', async () => {
    await SchemaVersion.deleteMany({});

    // First run: should apply all 3 pending migrations
    const run1 = await runMigrations({ db: mongoose.connection.db });
    assert.strictEqual(run1.appliedCount, 3, `Expected 3 applied migrations, got ${run1.appliedCount}`);

    // Second run: should be completely idempotent (apply 0 migrations)
    const run2 = await runMigrations({ db: mongoose.connection.db });
    assert.strictEqual(run2.appliedCount, 0, `Expected 0 applied migrations on second run, got ${run2.appliedCount}`);

    // Verify SchemaVersion count
    const totalVersions = await SchemaVersion.countDocuments();
    assert.strictEqual(totalVersions, 3, `Expected 3 recorded schema versions, found ${totalVersions}`);
  });

  it('3. Storage report returns collection metrics and triggers warning flag when threshold is exceeded', async () => {
    const report = await generateStorageReport({
      warnThresholdMB: 0.0001,
      quiet: true,
      db: mongoose.connection.db,
    });

    assert.strictEqual(report.warning, true, 'Expected warning: true when warnThresholdMB is 0.0001 MB');
    assert(Array.isArray(report.collections), 'Expected report.collections to be an array');
    assert(typeof report.totalMB === 'number', 'Expected report.totalMB to be a number');
    assert(typeof report.dataMB === 'number', 'Expected report.dataMB to be a number');
    assert(typeof report.indexMB === 'number', 'Expected report.indexMB to be a number');
  });

  it('4. Backup and restore drill exports test database and restores it cleanly into a fresh state', async () => {
    const db = mongoose.connection.db;

    // Seed 3 test users
    const seedUsers = [];
    const suffix = Math.floor(Math.random() * 10000);
    for (let i = 1; i <= 3; i++) {
      const user = await User.create({
        username: `t2_drill_${i}_${suffix}`,
        email: `t2_drill_${i}_${suffix}@example.com`,
        passwordHash: 'dummy_hash_for_test_drill',
        role: 'member',
      });
      seedUsers.push(user);
    }

    // Seed 5 test posts
    const seedPosts = [];
    for (let i = 1; i <= 5; i++) {
      const post = await Post.create({
        title: `Drill Spot ${i}`,
        authorId: seedUsers[i % 3]._id,
        location: { type: 'Point', coordinates: [-122.4194 + i * 0.01, 37.7749 + i * 0.01] },
        feedLocation: { type: 'Point', coordinates: [-122.4194 + i * 0.01, 37.7749 + i * 0.01] },
        place: { city: 'San Francisco', cityKey: 'san-francisco', country: 'United States', countryCode: 'US' },
        tier: 'city',
        meter: { score: 10 * i, likes: i, dislikes: 0, comments: 2 * i },
      });
      seedPosts.push(post);
    }

    // Temp directory for dump
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oddspot-backup-drill-'));

    try {
      // 1. Export database
      const dumpRes = await dumpDatabase({ db, outDir: tempDir, quiet: true });
      assert(fs.existsSync(path.join(tempDir, 'metadata.json')));
      assert(fs.existsSync(path.join(tempDir, 'users.json')));
      assert(fs.existsSync(path.join(tempDir, 'posts.json')));

      // 2. Clear seeded data from test DB
      await User.deleteMany({ _id: { $in: seedUsers.map((u) => u._id) } });
      await Post.deleteMany({ _id: { $in: seedPosts.map((p) => p._id) } });

      const countUsersAfterClear = await User.countDocuments({ _id: { $in: seedUsers.map((u) => u._id) } });
      const countPostsAfterClear = await Post.countDocuments({ _id: { $in: seedPosts.map((p) => p._id) } });
      assert.strictEqual(countUsersAfterClear, 0);
      assert.strictEqual(countPostsAfterClear, 0);

      // 3. Restore data from backup
      await restoreDatabase({ db, inDir: tempDir, quiet: true });

      // 4. Verify identical restoration
      const restoredUsers = await User.find({ _id: { $in: seedUsers.map((u) => u._id) } })
        .sort({ _id: 1 })
        .lean();
      assert.strictEqual(restoredUsers.length, 3, 'All 3 seeded users should be restored');

      const restoredPosts = await Post.find({ _id: { $in: seedPosts.map((p) => p._id) } })
        .sort({ _id: 1 })
        .lean();
      assert.strictEqual(restoredPosts.length, 5, 'All 5 seeded posts should be restored');

      for (let i = 0; i < 5; i++) {
        const orig = seedPosts[i];
        const restored = restoredPosts.find((p) => p._id.toString() === orig._id.toString());
        assert(restored, `Post ${orig._id} must exist in restored collection`);
        assert.strictEqual(restored.title, orig.title);
        assert.deepStrictEqual(restored.location.coordinates, orig.location.coordinates);
        assert.deepStrictEqual(restored.feedLocation.coordinates, orig.feedLocation.coordinates);
        assert.strictEqual(restored.meter.score, orig.meter.score);
        assert.strictEqual(restored.meter.likes, orig.meter.likes);
        assert.strictEqual(restored.meter.comments, orig.meter.comments);
      }
    } finally {
      // Clean up test data and temp directory
      await User.deleteMany({ _id: { $in: seedUsers.map((u) => u._id) } }).catch(() => {});
      await Post.deleteMany({ _id: { $in: seedPosts.map((p) => p._id) } }).catch(() => {});
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
