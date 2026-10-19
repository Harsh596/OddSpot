const crypto = require('crypto');
const { IdempotencyKey } = require('../models');

// Computes a deterministic SHA-256 hash of the request body
function hashPayload(body) {
  const normalized = body && typeof body === 'object' ? JSON.stringify(body) : String(body || '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Middleware factory supporting the Idempotency-Key header.
 * Ensures write operations (POST /api/posts, POST /api/posts/:id/comments) are safe against duplicate submissions.
 */
function idempotency(endpoint) {
  return async (req, res, next) => {
    const rawKey = req.headers['idempotency-key'];

    // If header is not provided, proceed normally without idempotency tracking
    if (rawKey === undefined || rawKey === null) {
      return next();
    }

    if (typeof rawKey !== 'string' || !rawKey.trim() || rawKey.length > 128) {
      return res.status(400).json({
        error: 'Idempotency-Key header must be a non-empty string up to 128 characters',
      });
    }

    const key = rawKey.trim();
    const userId = req.user && req.user.id;
    if (!userId) {
      // Must have authenticated user identity
      return res.status(401).json({ error: 'Authentication required for idempotent requests' });
    }

    const requestHash = hashPayload(req.body);
    const now = new Date();

    try {
      // 1. Look up existing idempotency record
      const existing = await IdempotencyKey.findOne({ userId, key });

      if (existing) {
        // Parameter mismatch check: same key with different body is forbidden
        if (existing.requestHash !== requestHash) {
          return res.status(422).json({
            error: 'Idempotency key reuse with different parameters',
            code: 'IDEMPOTENCY_KEY_MISMATCH',
          });
        }

        // Cached replay if previously completed
        if (existing.status === 'completed') {
          return res.status(existing.statusCode).json(existing.responseBody);
        }

        // Pending check: lock timeout is 60 seconds
        const lockAgeMs = Date.now() - new Date(existing.lockedAt).getTime();
        if (lockAgeMs <= 60000) {
          return res.status(409).json({
            error: 'Request is currently being processed',
            code: 'IDEMPOTENCY_IN_FLIGHT',
          });
        }

        // Lock timed out (> 60s): re-acquire the lock
        const reacquired = await IdempotencyKey.findOneAndUpdate(
          { _id: existing._id, status: 'pending', lockedAt: existing.lockedAt },
          { $set: { lockedAt: now, endpoint, requestHash } },
          { new: true }
        );

        if (!reacquired) {
          // Another concurrent worker re-acquired it first
          return res.status(409).json({
            error: 'Request is currently being processed',
            code: 'IDEMPOTENCY_IN_FLIGHT',
          });
        }
      } else {
        // 2. Insert new pending record
        try {
          await IdempotencyKey.create({
            key,
            userId,
            endpoint,
            requestHash,
            status: 'pending',
            lockedAt: now,
          });
        } catch (createErr) {
          if (createErr.code === 11000) {
            // Concurrent race on insert: re-fetch and check
            const raced = await IdempotencyKey.findOne({ userId, key });
            if (raced) {
              if (raced.requestHash !== requestHash) {
                return res.status(422).json({
                  error: 'Idempotency key reuse with different parameters',
                  code: 'IDEMPOTENCY_KEY_MISMATCH',
                });
              }
              if (raced.status === 'completed') {
                return res.status(raced.statusCode).json(raced.responseBody);
              }
              return res.status(409).json({
                error: 'Request is currently being processed',
                code: 'IDEMPOTENCY_IN_FLIGHT',
              });
            }
          }
          throw createErr;
        }
      }

      // 3. Intercept response to store result or release lock on failure
      const originalJson = res.json.bind(res);
      let finalized = false;

      res.json = function (body) {
        if (!finalized) {
          finalized = true;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            IdempotencyKey.updateOne(
              { userId, key },
              {
                $set: {
                  status: 'completed',
                  statusCode: res.statusCode,
                  responseBody: body,
                },
              }
            ).catch((err) => {
              console.error('Failed to commit idempotency key result:', err);
            });
          } else {
            // Non-2xx response: purge pending lock so user can correct input and retry
            IdempotencyKey.deleteOne({ userId, key, status: 'pending' }).catch(() => {});
          }
        }
        return originalJson(body);
      };

      res.on('finish', () => {
        if (!finalized && res.statusCode >= 400) {
          IdempotencyKey.deleteOne({ userId, key, status: 'pending' }).catch(() => {});
        }
      });

      next();
    } catch (err) {
      // On internal failure, remove pending lock
      IdempotencyKey.deleteOne({ userId, key, status: 'pending' }).catch(() => {});
      next(err);
    }
  };
}

module.exports = { idempotency, hashPayload };
