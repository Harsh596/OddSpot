// backend/validators/mod.validators.js
// Zod schemas with strict validation for moderation queue, report actions, and user banning.

const { z } = require('zod');
const { normalizeText, objectIdSchema } = require('./common');

const modReportsQuerySchema = z
  .object({
    status: z
      .enum(['pending', 'resolved', 'dismissed', 'open', 'actioned'])
      .optional()
      .default('pending'),
    reason: z.string().optional(),
    targetType: z.enum(['post', 'comment', 'user']).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strip();

const reportActionSchema = z
  .object({
    action: z.enum(['remove_content', 'dismiss', 'ban_reporter'], {
      required_error: 'Action is required',
      invalid_type_error: "Action must be 'remove_content', 'dismiss', or 'ban_reporter'",
    }),
    reason: z
      .string({ required_error: 'Reason is required', invalid_type_error: 'Reason must be a text string' })
      .transform((val) => normalizeText(val))
      .refine((val) => val.length >= 3 && val.length <= 500, {
        message: 'Reason must be between 3 and 500 characters',
      }),
  })
  .strip();

const userBanSchema = z
  .object({
    reason: z
      .string({ required_error: 'Reason is required', invalid_type_error: 'Reason must be a text string' })
      .transform((val) => normalizeText(val))
      .refine((val) => val.length >= 3 && val.length <= 500, {
        message: 'Reason must be between 3 and 500 characters',
      }),
    shadow: z.boolean().optional().default(false),
  })
  .strip();

const modIdParamSchema = z
  .object({
    id: objectIdSchema,
  })
  .strip();

module.exports = {
  modReportsQuerySchema,
  reportActionSchema,
  userBanSchema,
  modIdParamSchema,
};
