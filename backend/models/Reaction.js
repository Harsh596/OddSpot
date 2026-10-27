// backend/models/Reaction.js
// Stores user animated reactions on posts (weight: 5).

const { Schema, model } = require('mongoose');

const reactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    type: {
      type: String,
      enum: ['mind_blown', 'eyebrow_raise', 'cursed', 'legendary'],
      required: true,
    },
    weight: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'reactions',
    timestamps: false,
  }
);

// Unique compound index: one reaction per user per post
reactionSchema.index({ userId: 1, postId: 1 }, { unique: true });
reactionSchema.index({ postId: 1, type: 1 });

module.exports = model('Reaction', reactionSchema);
