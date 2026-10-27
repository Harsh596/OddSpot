// backend/validators/uploads.validators.js
// Zod schemas for signed image upload endpoints (P15).

const { z } = require('zod');
const { ALLOWED_MIME_TYPES, ALLOWED_PURPOSES } = require('../services/uploadProvider');

const signUploadSchema = z
  .object({
    mimeType: z
      .string({ required_error: 'mimeType is required', invalid_type_error: 'mimeType must be a string' })
      .trim()
      .refine(
        (val) => ALLOWED_MIME_TYPES.includes(val),
        `Unsupported MIME type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      ),
    sizeBytes: z
      .number({ required_error: 'sizeBytes is required', invalid_type_error: 'sizeBytes must be a number' })
      .int('sizeBytes must be an integer')
      .min(1, 'sizeBytes must be at least 1 byte'),
    purpose: z
      .enum(ALLOWED_PURPOSES, {
        invalid_type_error: `purpose must be one of: ${ALLOWED_PURPOSES.join(', ')}`,
      })
      .optional()
      .default('post_image'),
  })
  .strict();

module.exports = {
  signUploadSchema,
};
