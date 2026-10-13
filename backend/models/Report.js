const { Schema, model } = require('mongoose');

const reportSchema = new Schema(
  {
    targetType: { type: String, enum: ['post', 'comment', 'user'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      enum: ['unsafe_or_private', 'nsfw', 'spam', 'doxxing', 'misinformation', 'other'],
      required: true,
    },
    details: { type: String, maxlength: 500 },
    status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 }); // admin queue (later)
reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });

module.exports = model('Report', reportSchema);
