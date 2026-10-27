// backend/routes/admin.js
// Admin analytics, runtime configuration tuning, and audit log inspection.

const { Router } = require('express');
const mongoose = require('mongoose');
const { User, Post, Report, AuditLog, Comment, Visit, Reaction } = require('../models');
const { requireAuth, requireRole, invalidateUserAuthCache } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const { updateMeterConfig, getMeterConfig } = require('../config/meter');
const {
  validateQuery,
  validateBody,
  validateParams,
  ErrorCodes,
  formatErrorResponse,
  admin: adminValidators,
} = require('../validators');

const router = Router();

// Strict security: all admin routes require authentication, admin role, and non-cacheable responses
router.use(requireAuth);
router.use(requireRole('admin'));
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// GET /api/v1/admin/analytics - Platform analytics overview
router.get('/analytics', async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      postsPerCityAgg,
      totalUsers,
      activeUsers7d,
      openReportsCount,
      postsUnderReviewCount,
      tierAgg,
      totalPosts,
      totalComments,
      totalVisits,
      totalReactions,
    ] = await Promise.all([
      Post.aggregate([
        { $match: { removed: { $ne: true } } },
        { $group: { _id: '$place.city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      User.countDocuments({ banned: { $ne: true } }),
      User.countDocuments({ updatedAt: { $gte: sevenDaysAgo }, banned: { $ne: true } }),
      Report.countDocuments({ status: { $in: ['open', 'pending'] } }),
      Post.countDocuments({ underReview: true, removed: { $ne: true } }),
      Post.aggregate([
        { $match: { removed: { $ne: true } } },
        { $group: { _id: '$tier', count: { $sum: 1 } } },
      ]),
      Post.countDocuments({ removed: { $ne: true } }),
      Comment.countDocuments({ removed: { $ne: true } }),
      Visit.countDocuments({}),
      Reaction.countDocuments({}),
    ]);

    const postsPerCity = postsPerCityAgg.map((item) => ({
      city: item._id || 'Unknown',
      count: item.count,
    }));

    const tierBreakdown = {
      city: 0,
      country: 0,
    };
    for (const t of tierAgg) {
      if (t._id && tierBreakdown[t._id] !== undefined) {
        tierBreakdown[t._id] = t.count;
      }
    }

    const storageSummary = {
      totalPosts,
      totalComments,
      totalVisits,
      totalReactions,
      totalUsers,
      databaseLimitMB: 512,
      warnThresholdMB: 400,
    };

    res.json({
      postsPerCity,
      totalUsers,
      activeUsers7d,
      openReportsCount,
      postsUnderReviewCount,
      tierBreakdown,
      storageSummary,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/config/meter - Get current runtime meter configuration
router.get('/config/meter', (req, res) => {
  res.json({
    config: getMeterConfig(),
  });
});

// PATCH /api/v1/admin/config/meter - Tune runtime meter thresholds and weights
router.patch(
  '/config/meter',
  validateBody(adminValidators.meterConfigSchema),
  async (req, res, next) => {
    try {
      const { countryThreshold, countryThresholdMin, reportFuzzThreshold, weights, reason } = req.body;

      const previousConfig = getMeterConfig();
      const updatedConfig = updateMeterConfig({
        countryThreshold: countryThreshold ?? countryThresholdMin,
        countryThresholdMin: countryThresholdMin ?? countryThreshold,
        reportFuzzThreshold,
        weights,
      });

      // Write immutable audit log entry
      await logAudit({
        actorId: req.user.id,
        action: 'admin.config.update',
        targetType: 'config',
        targetId: new mongoose.Types.ObjectId('000000000000000000000000'),
        reason: reason || 'Admin runtime meter tuning',
        meta: {
          previousConfig,
          updatedConfig,
          changes: req.body,
        },
      });

      res.json({
        message: 'Meter configuration updated successfully',
        config: updatedConfig,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/audit-logs - View audit trail
router.get(
  '/audit-logs',
  validateQuery(adminValidators.adminAuditLogsQuerySchema),
  async (req, res, next) => {
    try {
      const { limit, action, targetType } = req.query;
      const query = {};
      if (action) query.action = action;
      if (targetType) query.targetType = targetType;

      const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit) || 30)
        .populate('actorId', 'username role')
        .lean();

      res.json({
        count: logs.length,
        logs,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/users - Search and list users for role administration
router.get('/users', async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;
    const query = {};
    if (q && typeof q === 'string' && q.trim()) {
      const term = q.trim();
      query.$or = [
        { usernameLower: { $regex: term.toLowerCase(), $options: 'i' } },
        { emailLower: { $regex: term.toLowerCase(), $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .select('username email role banned shadowBanned trust stats createdAt')
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || 20, 1), 50))
      .lean();

    res.json({
      count: users.length,
      users,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/admin/users/:id/role - Update user role (admin only)
router.patch(
  '/users/:id/role',
  validateParams(adminValidators.adminUserIdParamSchema),
  validateBody(adminValidators.userRoleUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { role, reason } = req.body;

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json(formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
      }

      const previousRole = targetUser.role;
      targetUser.role = role;
      await targetUser.save();

      invalidateUserAuthCache(targetUser._id.toString());

      await logAudit({
        actorId: req.user.id,
        action: 'admin.user.role_change',
        targetType: 'user',
        targetId: targetUser._id,
        reason: reason || `Role changed from ${previousRole} to ${role}`,
        meta: { previousRole, newRole: role },
      });

      res.json({
        message: 'User role updated successfully',
        userId: targetUser._id,
        previousRole,
        role: targetUser.role,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
