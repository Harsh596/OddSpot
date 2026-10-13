const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['comment', 'reply', 'visit', 'tier_up', 'nearby_find', 'mention'], required: true },
    postId: { type: Schema.Types.ObjectId, ref: 'Post' },
    data: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
// Auto-delete after 30 days to save Atlas storage
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = model('Notification', notificationSchema);
