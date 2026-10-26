// backend/routes/notifications.js
// Notifications retrieval, cursor pagination, and mark-read endpoints (P13).

const { Router } = require('express');
const mongoose = require('mongoose');
const { Notification } = require('../models');
const { requireAuth } = require('../middleware/auth');
const {
  validateQuery,
  validateBody,
  notifications: notificationsValidators,
} = require('../validators');

const router = Router();

// All notification endpoints require authentication and Cache-Control: no-store
router.use(requireAuth);
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// Helper to decode cursor (supports raw 24-hex ObjectId or base64url encoded cursor)
function decodeNotificationCursor(cursor) {
  if (!cursor) return null;
  if (/^[0-9a-fA-F]{24}$/.test(cursor)) {
    return cursor;
  }
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    return parsed.id || null;
  } catch {
    return null;
  }
}

// 1. GET /api/v1/notifications
router.get(
  '/',
  validateQuery(notificationsValidators.notificationsQuerySchema),
  async (req, res, next) => {
    try {
      const { cursor, limit = 20, unreadOnly } = req.query;
      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);

      const filter = {
        userId: new mongoose.Types.ObjectId(req.user.id),
      };

      if (unreadOnly) {
        filter.read = false;
      }

      if (cursor) {
        const decodedId = decodeNotificationCursor(cursor);
        if (decodedId && mongoose.Types.ObjectId.isValid(decodedId)) {
          const cursorDoc = await Notification.findById(decodedId).select('createdAt _id').lean();
          if (cursorDoc) {
            filter.$or = [
              { createdAt: { $lt: cursorDoc.createdAt } },
              { createdAt: cursorDoc.createdAt, _id: { $lt: cursorDoc._id } },
            ];
          } else {
            filter._id = { $lt: new mongoose.Types.ObjectId(decodedId) };
          }
        }
      }

      // Fetch limit + 1 documents to calculate hasMore
      const rawDocs = await Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limitNum + 1)
        .populate('actorId', 'username avatarUrl')
        .populate('postId', 'title images')
        .lean();

      const hasMore = rawDocs.length > limitNum;
      const notifications = hasMore ? rawDocs.slice(0, limitNum) : rawDocs;

      const nextCursor =
        hasMore && notifications.length > 0
          ? notifications[notifications.length - 1]._id.toString()
          : null;

      const unreadCount = await Notification.countDocuments({
        userId: req.user.id,
        read: false,
      });

      return res.status(200).json({
        notifications,
        unreadCount,
        nextCursor,
        hasMore,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 2. POST /api/v1/notifications/read
router.post(
  '/read',
  validateBody(notificationsValidators.markReadSchema),
  async (req, res, next) => {
    try {
      const { ids, all } = req.body;
      const userId = req.user.id;

      let updateFilter;
      if (all) {
        updateFilter = { userId, read: false };
      } else {
        const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
        updateFilter = { _id: { $in: objectIds }, userId, read: false };
      }

      const updateResult = await Notification.updateMany(updateFilter, {
        $set: { read: true },
      });

      const unreadCount = await Notification.countDocuments({
        userId,
        read: false,
      });

      return res.status(200).json({
        ok: true,
        modifiedCount: updateResult.modifiedCount,
        unreadCount,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
