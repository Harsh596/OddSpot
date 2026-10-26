// backend/validators/notifications.validators.js
// Zod schemas for notifications query and mark-read operations.

const { z } = require('zod');
const { objectIdSchema } = require('./common');

const notificationsQuerySchema = z
  .object({
    cursor: z.string().max(512).optional(),
    limit: z.coerce
      .number({ invalid_type_error: 'limit must be a number' })
      .int('limit must be an integer')
      .min(1, 'limit must be between 1 and 50')
      .max(50, 'limit must be between 1 and 50')
      .optional()
      .default(20),
    unreadOnly: z.preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional()),
  })
  .strip();

const markReadSchema = z
  .object({
    ids: z
      .array(objectIdSchema, { invalid_type_error: 'ids must be an array of IDs' })
      .max(100, 'Cannot mark more than 100 notifications at once')
      .optional(),
    all: z.boolean({ invalid_type_error: 'all must be a boolean' }).optional(),
  })
  .strip()
  .refine(
    (data) => data.all === true || (Array.isArray(data.ids) && data.ids.length > 0),
    {
      message: "Either 'ids' array or 'all: true' is required",
    }
  );

module.exports = {
  notificationsQuerySchema,
  markReadSchema,
};
