// backend/models/Notification.js
// User notifications with 1-hour bucket deduplication and 30-day TTL (P13).

const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: ['comment', 'reply', 'visit', 'tier_up', 'nearby_find', 'mention'],
      required: true,
    },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', default: null },
    dedupeKey: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
    read: { type: Boolean, default: false, index: true },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 30 * 86400, // 30-day TTL index
    },
  },
  { versionKey: false }
);

// Indexes
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
  }
);

module.exports = model('Notification', notificationSchema);
