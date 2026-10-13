const { Schema, model } = require('mongoose');

const voteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    value: { type: Number, enum: [1, -1], required: true },
  },
  { timestamps: true }
);

// One vote per user per post (also blocks duplicate voting)
voteSchema.index({ userId: 1, postId: 1 }, { unique: true });
voteSchema.index({ postId: 1 });

module.exports = model('Vote', voteSchema);
