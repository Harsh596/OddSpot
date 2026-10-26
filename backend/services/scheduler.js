// backend/services/scheduler.js
// Distributed background job scheduler backed by MongoDB JobLock collection.

const JobLock = require('../models/JobLock');
const { logger } = require('../utils/logger');

async function acquireLock(name, { ttlMs = 60000, owner } = {}) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);
  const workerOwner = owner || `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Try to take an existing expired or unlocked lock
  const updated = await JobLock.findOneAndUpdate(
    {
      name,
      $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: null }],
    },
    {
      $set: { lockedUntil, owner: workerOwner, updatedAt: now },
    },
    { new: true }
  );

  if (updated) {
    return { acquired: true, owner: workerOwner, lock: updated };
  }

  // 2. If it does not exist at all, try to create it
  const existing = await JobLock.findOne({ name });
  if (!existing) {
    try {
      const created = await JobLock.create({
        name,
        lockedUntil,
        owner: workerOwner,
        updatedAt: now,
      });
      return { acquired: true, owner: workerOwner, lock: created };
    } catch (err) {
      if (err.code === 11000) {
        return { acquired: false, owner: null };
      }
      throw err;
    }
  }

  return { acquired: false, owner: null };
}

async function releaseLock(name, owner) {
  await JobLock.updateOne(
    { name, owner },
    { $set: { lockedUntil: null, owner: null, updatedAt: new Date() } }
  );
}

async function runWithJobLock(name, fn, options = {}) {
  const lockRes = await acquireLock(name, options);
  if (!lockRes.acquired) {
    return { executed: false, reason: 'LOCKED' };
  }

  try {
    const result = await fn();
    return { executed: true, result };
  } finally {
    await releaseLock(name, lockRes.owner);
  }
}

// Scheduled Job 1: Reconcile counters and scores
async function reconcileCountersJob(options = {}) {
  return runWithJobLock('reconcile-counters', async () => {
    const { reconcileAllCounters } = require('../scripts/reconcileCounters');
    return await reconcileAllCounters({ apply: true });
  }, options);
}

// Scheduled Job 2: Refresh hotScore on active spots created within last 30 days
async function refreshHotScoresJob(options = {}) {
  return runWithJobLock('refresh-hot-scores', async () => {
    const Post = require('../models/Post');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const posts = await Post.find({
      removed: { $ne: true },
      createdAt: { $gte: thirtyDaysAgo },
    });

    let updatedCount = 0;
    const now = Date.now();
    for (const post of posts) {
      const ageHours = (now - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
      const score = post.meter?.score || 0;
      const hotScore = Number((score / Math.pow(ageHours + 2, 1.5)).toFixed(6));
      await Post.updateOne({ _id: post._id }, { $set: { hotScore } });
      updatedCount++;
    }
    return { postsInspected: posts.length, updatedCount };
  }, options);
}

// Scheduled Job 3: Sweep expired RefreshToken, EmailToken, IdempotencyKey, and RateLimit records
async function cleanupExpiredRecordsJob(options = {}) {
  return runWithJobLock('cleanup-expired-records', async () => {
    const { RefreshToken, EmailToken, IdempotencyKey, RateLimit } = require('../models');
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [refreshRes, emailRes, idempRes, rateRes] = await Promise.all([
      RefreshToken.deleteMany({ expiresAt: { $lt: now } }),
      EmailToken.deleteMany({ expiresAt: { $lt: now } }),
      IdempotencyKey.deleteMany({ createdAt: { $lt: oneDayAgo } }),
      RateLimit.deleteMany({ resetAt: { $lt: now } }),
    ]);

    return {
      deletedRefreshTokens: refreshRes.deletedCount,
      deletedEmailTokens: emailRes.deletedCount,
      deletedIdempotencyKeys: idempRes.deletedCount,
      deletedRateLimits: rateRes.deletedCount,
    };
  }, options);
}

let schedulerTimer = null;

function startBackgroundScheduler({ intervalMs = 60000 } = {}) {
  if (schedulerTimer) return;

  const runAllJobs = async () => {
    try {
      await cleanupExpiredRecordsJob().catch((e) => logger.error(e, 'cleanupExpiredRecordsJob error'));
      await refreshHotScoresJob().catch((e) => logger.error(e, 'refreshHotScoresJob error'));
      await reconcileCountersJob().catch((e) => logger.error(e, 'reconcileCountersJob error'));
    } catch (err) {
      logger.error(err, 'Scheduler loop exception');
    }
  };

  schedulerTimer = setInterval(runAllJobs, intervalMs);
  schedulerTimer.unref();
}

function stopBackgroundScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  acquireLock,
  releaseLock,
  runWithJobLock,
  reconcileCountersJob,
  refreshHotScoresJob,
  cleanupExpiredRecordsJob,
  startBackgroundScheduler,
  stopBackgroundScheduler,
};
