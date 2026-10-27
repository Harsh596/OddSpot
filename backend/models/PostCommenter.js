// backend/models/PostCommenter.js
// Tracks unique non-author commenters per post for Oddometer scoring.

const { Schema, model } = require('mongoose');

const postCommenterSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weightApplied: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: 'postcommenters',
  }
);

// Compound unique index ensuring at most one PostCommenter per (postId, userId)
postCommenterSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = model('PostCommenter', postCommenterSchema);
