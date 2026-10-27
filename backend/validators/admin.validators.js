// backend/validators/admin.validators.js
// Zod schemas for admin analytics, configuration, and user role updates.

const { z } = require('zod');
const { objectIdSchema } = require('./common');

const meterConfigSchema = z
  .object({
    countryThreshold: z.number().int().min(1).max(1000).optional(),
    countryThresholdMin: z.number().int().min(1).max(1000).optional(),
    reportFuzzThreshold: z.number().int().min(1).max(50).optional(),
    weights: z
      .object({
        reaction: z.number().min(0).max(50).optional(),
        visit: z.number().min(0).max(50).optional(),
        comment: z.number().min(0).max(50).optional(),
        like: z.number().min(0).max(50).optional(),
        dislike: z.number().min(-50).max(0).optional(),
      })
      .optional(),
    reason: z.string().max(300).optional(),
  })
  .strip();

const userRoleUpdateSchema = z
  .object({
    role: z.enum(['member', 'moderator', 'admin']),
    reason: z.string().max(300).optional(),
  })
  .strip();

const adminAuditLogsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(30),
    action: z.string().optional(),
    targetType: z.string().optional(),
  })
  .strip();

module.exports = {
  meterConfigSchema,
  userRoleUpdateSchema,
  adminAuditLogsQuerySchema,
  adminUserIdParamSchema: z.object({ id: objectIdSchema }).strip(),
};
