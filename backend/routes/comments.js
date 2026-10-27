// backend/routes/comments.js
// Comment mutation routes: PATCH /comments/:id and DELETE /comments/:id.

const express = require('express');
const router = express.Router();
const { Comment, Post, PostCommenter } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateParams, ErrorCodes, formatErrorResponse } = require('../validators');
const postsValidators = require('../validators/posts.validators');
const { withTransaction } = require('../utils/withTransaction');
const meterService = require('../services/meter');
const { logAudit } = require('../services/audit');

// PATCH /api/comments/:id - Edit comment (author only)
router.patch(
  '/:id',
  requireAuth,
  validateParams(postsValidators.postIdParamSchema),
  validateBody(postsValidators.updateCommentSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const comment = await Comment.findOne({ _id: id, removed: { $ne: true } });
      if (!comment) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Comment not found'));
      }

      if (comment.authorId.toString() !== req.user.id.toString()) {
        return res.status(403).json(
          formatErrorResponse(ErrorCodes.FORBIDDEN, 'Only the author can edit this comment')
        );
      }

      comment.body = req.body.body;
      comment.edited = true;
      comment.editedAt = new Date();
      await comment.save();

      const populated = await Comment.findById(comment._id).populate('authorId', 'username avatarUrl badges');
      res.json({ message: 'Comment updated successfully', comment: populated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/comments/:id - Soft delete comment (author or moderator/admin)
router.delete(
  '/:id',
  requireAuth,
  validateParams(postsValidators.postIdParamSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const comment = await Comment.findOne({ _id: id, removed: { $ne: true } });
      if (!comment) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'Comment not found'));
      }

      const isAuthor = comment.authorId.toString() === req.user.id.toString();
      const isStaff = ['moderator', 'admin'].includes(req.user.role);

      if (!isAuthor && !isStaff) {
        return res.status(403).json(
          formatErrorResponse(ErrorCodes.FORBIDDEN, 'Only the author or a moderator can delete this comment')
        );
      }

      await withTransaction(async (session) => {
        comment.removed = true;
        await comment.save({ session });

        const remainingCount = await Comment.countDocuments({
          postId: comment.postId,
          authorId: comment.authorId,
          removed: { $ne: true },
        }).session(session);

        const delta = { comments: -1, commenters: 0 };
        if (remainingCount === 0) {
          const deleted = await PostCommenter.findOneAndDelete({
            postId: comment.postId,
            userId: comment.authorId,
          }).session(session);
          if (deleted) {
            delta.commenters = -1;
          }
        }

        await meterService.applyDelta(comment.postId, delta, session);

        if (!isAuthor && isStaff) {
          await logAudit({
            actorId: req.user.id,
            action: 'comment_deleted',
            targetType: 'comment',
            targetId: comment._id,
            reason: req.body?.reason || 'moderator action',
            session,
          });
        }
      });

      res.json({ message: 'Comment deleted successfully', removed: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
