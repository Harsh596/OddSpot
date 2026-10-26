const { Schema, model } = require('mongoose');

const commentSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null }, // threading
    body: { type: String, required: true, maxlength: 5000 }, // markdown
    edited: { type: Boolean, default: false },
    editedAt: { type: Date },
    removed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ parentId: 1 });

module.exports = model('Comment', commentSchema);
