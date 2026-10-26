// backend/routes/mod.js
// Moderation queue, report resolution, trust score updates, and user banning/shadow-banning.

const { Router } = require('express');
const mongoose = require('mongoose');
const { Report, Post, Comment, User, RefreshToken } = require('../models');
const { requireAuth, requireRole, invalidateUserAuthCache } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const { recomputeUserTrust } = require('../services/trust');
const { withTransaction } = require('../utils/withTransaction');
const {
  validateQuery,
  validateBody,
  validateParams,
  ErrorCodes,
  formatErrorResponse,
  mod: modValidators,
} = require('../validators');

const router = Router();

// All moderation routes require authentication, moderator or admin role, and no-store caching
router.use(requireAuth);
router.use(requireRole('moderator', 'admin'));
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// GET /api/v1/mod/reports - Moderation report queue
router.get(
  '/reports',
  validateQuery(modValidators.modReportsQuerySchema),
  async (req, res, next) => {
    try {
      const { status, reason, targetType, limit } = req.query;

      const query = {};
      if (status === 'pending') {
        query.status = { $in: ['pending', 'open'] };
      } else if (status === 'resolved') {
        query.status = { $in: ['resolved', 'actioned'] };
      } else if (status === 'dismissed') {
        query.status = 'dismissed';
      } else if (status) {
        query.status = status;
      }

      if (reason) query.reason = reason;
      if (targetType) query.targetType = targetType;

      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);

      // Fetch reports
      const reports = await Report.find(query)
        .sort({ weight: -1, createdAt: -1 })
        .limit(limitNum)
        .lean();

      // Collect IDs for batch population
      const reporterIds = [...new Set(reports.map((r) => r.reporterId.toString()))];
      const postIds = reports
        .filter((r) => r.targetType === 'post')
        .map((r) => r.targetId);
      const commentIds = reports
        .filter((r) => r.targetType === 'comment')
        .map((r) => r.targetId);
      const userIds = reports
        .filter((r) => r.targetType === 'user')
        .map((r) => r.targetId);

      const [reporters, posts, comments, targetUsers] = await Promise.all([
        User.find({ _id: { $in: reporterIds } })
          .select('username avatarUrl trust')
          .lean(),
        postIds.length
          ? Post.find({ _id: { $in: postIds } })
              .select('title authorId removed underReview meter createdAt')
              .lean()
          : [],
        commentIds.length
          ? Comment.find({ _id: { $in: commentIds } })
              .select('body authorId removed postId createdAt')
              .lean()
          : [],
        userIds.length
          ? User.find({ _id: { $in: userIds } })
              .select('username banned shadowBanned trust createdAt')
              .lean()
          : [],
      ]);

      const reporterMap = new Map(reporters.map((u) => [u._id.toString(), u]));
      const postMap = new Map(posts.map((p) => [p._id.toString(), p]));
      const commentMap = new Map(comments.map((c) => [c._id.toString(), c]));
      const userMap = new Map(targetUsers.map((u) => [u._id.toString(), u]));

      const enriched = reports.map((r) => {
        const reporter = reporterMap.get(r.reporterId.toString());
        const reporterSummary = reporter
          ? {
              id: reporter._id,
              username: reporter.username,
              avatarUrl: reporter.avatarUrl,
              trust: {
                score:
                  typeof reporter.trust === 'object' && reporter.trust?.score !== undefined
                    ? reporter.trust.score
                    : typeof reporter.trust === 'number' && reporter.trust > 0
                    ? reporter.trust
                    : 1.0,
              },
            }
          : null;

        let targetSummary = null;
        let isEscalated = false;
        if (r.targetType === 'post') {
          const targetPost = postMap.get(r.targetId.toString());
          if (targetPost) {
            targetSummary = targetPost;
            if (targetPost.underReview) isEscalated = true;
          }
        } else if (r.targetType === 'comment') {
          targetSummary = commentMap.get(r.targetId.toString()) || null;
        } else if (r.targetType === 'user') {
          targetSummary = userMap.get(r.targetId.toString()) || null;
        }

        return {
          ...r,
          id: r._id,
          reporter: reporterSummary,
          target: targetSummary,
          isEscalated,
        };
      });

      // Prioritize underReview/escalated items at the top
      enriched.sort((a, b) => {
        if (a.isEscalated && !b.isEscalated) return -1;
        if (!a.isEscalated && b.isEscalated) return 1;
        return (b.weight || 1.0) - (a.weight || 1.0);
      });

      res.json({
        reports: enriched,
        count: enriched.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/mod/reports/:id/action - Action a moderation report
router.post(
  '/reports/:id/action',
  validateParams(modValidators.modIdParamSchema),
  validateBody(modValidators.reportActionSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { action, reason } = req.body;

      const result = await withTransaction(async (session) => {
        const report = await Report.findById(id).session(session);
        if (!report) {
          const err = new Error('Report not found');
          err.statusCode = 404;
          err.code = ErrorCodes.NOT_FOUND;
          throw err;
        }

        const now = new Date();

        if (action === 'remove_content') {
          let authorId = null;

          // 1. Soft-delete target content
          if (report.targetType === 'post') {
            const post = await Post.findById(report.targetId).session(session);
            if (post) {
              authorId = post.authorId;
              post.removed = true;
              await post.save({ session });
            }
          } else if (report.targetType === 'comment') {
            const comment = await Comment.findById(report.targetId).session(session);
            if (comment) {
              authorId = comment.authorId;
              comment.removed = true;
              await comment.save({ session });
            }
          }

          // 2. Mark all open reports on that target as 'resolved'
          const openReports = await Report.find({
            targetType: report.targetType,
            targetId: report.targetId,
            status: { $in: ['open', 'pending'] },
          }).session(session);

          await Report.updateMany(
            {
              targetType: report.targetType,
              targetId: report.targetId,
              status: { $in: ['open', 'pending'] },
            },
            {
              $set: {
                status: 'resolved',
                resolvedBy: req.user.id,
                resolvedAt: now,
                resolutionNote: reason,
              },
            },
            { session }
          );

          // 3. Recompute trust score for reporters (upheld)
          const reporterIds = [...new Set(openReports.map((r) => r.reporterId.toString()))];
          for (const repId of reporterIds) {
            await recomputeUserTrust(repId, session);
          }

          // 4. Recompute trust score for target author (penalized)
          if (authorId) {
            await recomputeUserTrust(authorId, session);
          }

          // 5. Immutable AuditLog
          await logAudit({
            actorId: req.user.id,
            action: 'mod.report.remove_content',
            targetType: report.targetType,
            targetId: report.targetId,
            reason,
            meta: { reportId: report._id, action },
            session,
          });

          return {
            action,
            status: 'resolved',
            targetType: report.targetType,
            targetId: report.targetId,
          };
        }

        if (action === 'dismiss') {
          // 1. Mark this report as dismissed
          report.status = 'dismissed';
          report.resolvedBy = req.user.id;
          report.resolvedAt = now;
          report.resolutionNote = reason;
          await report.save({ session });

          // 2. If no remaining open reports on target post, clear underReview
          const remainingOpen = await Report.countDocuments({
            targetType: report.targetType,
            targetId: report.targetId,
            status: { $in: ['open', 'pending'] },
          }).session(session);

          if (remainingOpen === 0 && report.targetType === 'post') {
            await Post.updateOne(
              { _id: report.targetId },
              { $set: { underReview: false } },
              { session }
            );
          }

          // 3. Recompute reporter trust score
          await recomputeUserTrust(report.reporterId, session);

          // 4. Immutable AuditLog
          await logAudit({
            actorId: req.user.id,
            action: 'mod.report.dismiss',
            targetType: 'report',
            targetId: report._id,
            reason,
            meta: { targetType: report.targetType, targetId: report.targetId, action },
            session,
          });

          return { action, status: 'dismissed', reportId: report._id };
        }

        if (action === 'ban_reporter') {
          // 1. Ban reporter account, bump tokenVersion, revoke refresh tokens
          await User.updateOne(
            { _id: report.reporterId },
            {
              $set: { banned: true },
              $inc: { tokenVersion: 1 },
            },
            { session }
          );

          await RefreshToken.updateMany(
            { userId: report.reporterId },
            { $set: { revoked: true, revokedAt: now } },
            { session }
          );

          invalidateUserAuthCache(report.reporterId.toString());

          // 2. Mark report dismissed
          report.status = 'dismissed';
          report.resolvedBy = req.user.id;
          report.resolvedAt = now;
          report.resolutionNote = reason;
          await report.save({ session });

          // 3. Recompute reporter trust score
          await recomputeUserTrust(report.reporterId, session);

          // 4. Immutable AuditLog
          await logAudit({
            actorId: req.user.id,
            action: 'mod.report.ban_reporter',
            targetType: 'user',
            targetId: report.reporterId,
            reason,
            meta: { reportId: report._id, action },
            session,
          });

          return { action, status: 'dismissed', bannedReporterId: report.reporterId };
        }

        const err = new Error(`Unsupported action: ${action}`);
        err.statusCode = 400;
        err.code = ErrorCodes.VALIDATION_FAILED;
        throw err;
      });

      res.json({
        message: 'Moderation action applied successfully',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/mod/users/:id/ban - Ban or shadow-ban user
router.post(
  '/users/:id/ban',
  validateParams(modValidators.modIdParamSchema),
  validateBody(modValidators.userBanSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason, shadow = false } = req.body;

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
      }

      // Hierarchy rule: Moderator cannot ban an admin or another moderator
      if (req.user.role === 'moderator') {
        if (targetUser.role === 'admin' || targetUser.role === 'moderator') {
          return res.status(403).json(
            formatErrorResponse(
              ErrorCodes.FORBIDDEN,
              'Moderators cannot ban administrators or other moderators'
            )
          );
        }
      }
      if (targetUser.role === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json(
          formatErrorResponse(ErrorCodes.FORBIDDEN, 'Cannot ban administrator')
        );
      }

      const now = new Date();

      if (shadow) {
        targetUser.shadowBanned = true;
        await targetUser.save();

        await Promise.all([
          Post.updateMany({ authorId: targetUser._id }, { $set: { shadowBannedAuthor: true } }),
          Comment.updateMany({ authorId: targetUser._id }, { $set: { shadowBannedAuthor: true } }),
        ]);

        invalidateUserAuthCache(targetUser._id.toString());

        await logAudit({
          actorId: req.user.id,
          action: 'mod.user.shadowban',
          targetType: 'user',
          targetId: targetUser._id,
          reason,
          meta: { shadow: true },
        });

        return res.json({
          message: 'User shadow-banned successfully',
          userId: targetUser._id,
          shadowBanned: true,
        });
      }

      targetUser.banned = true;
      targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
      await targetUser.save();

      await RefreshToken.updateMany(
        { userId: targetUser._id },
        { $set: { revoked: true, revokedAt: now } }
      );

      invalidateUserAuthCache(targetUser._id.toString());

      await logAudit({
        actorId: req.user.id,
        action: 'mod.user.ban',
        targetType: 'user',
        targetId: targetUser._id,
        reason,
        meta: { shadow: false },
      });

      res.json({
        message: 'User banned successfully',
        userId: targetUser._id,
        banned: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/mod/users/:id/unban - Unban or remove shadow-ban from user
router.post(
  '/users/:id/unban',
  validateParams(modValidators.modIdParamSchema),
  validateBody(modValidators.userBanSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason, shadow = false } = req.body;

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
      }

      if (shadow) {
        targetUser.shadowBanned = false;
        await targetUser.save();

        await Promise.all([
          Post.updateMany({ authorId: targetUser._id }, { $set: { shadowBannedAuthor: false } }),
          Comment.updateMany({ authorId: targetUser._id }, { $set: { shadowBannedAuthor: false } }),
        ]);

        invalidateUserAuthCache(targetUser._id.toString());

        await logAudit({
          actorId: req.user.id,
          action: 'mod.user.unshadowban',
          targetType: 'user',
          targetId: targetUser._id,
          reason,
          meta: { shadow: true },
        });

        return res.json({
          message: 'User shadow-ban lifted successfully',
          userId: targetUser._id,
          shadowBanned: false,
        });
      }

      targetUser.banned = false;
      await targetUser.save();

      invalidateUserAuthCache(targetUser._id.toString());

      await logAudit({
        actorId: req.user.id,
        action: 'mod.user.unban',
        targetType: 'user',
        targetId: targetUser._id,
        reason,
        meta: { shadow: false },
      });

      res.json({
        message: 'User unbanned successfully',
        userId: targetUser._id,
        banned: false,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
