// backend/validators/common.js
// Shared validation primitives, text normalization transforms, and common Zod schemas.

const { z } = require('zod');
const { normalizeText, containsNullByte } = require('../utils/normalize');
const { parseStrictCoordinate } = require('../utils/coordinates');

// Reusable normalized string schema with length bounds
function normalizedString({ min = 1, max = 255, multiLine = false, fieldName = 'Field' } = {}) {
  return z
    .string({ required_error: `${fieldName} is required`, invalid_type_error: `${fieldName} must be a text string` })
    .refine((val) => !val.includes('\0') && !val.includes('\u0000'), {
      message: `${fieldName} must not contain null characters`,
    })
    .transform((val) => normalizeText(val, { maxLength: max, allowNewlines: multiLine, fieldName }))
    .refine((val) => val.length >= min, {
      message: `${fieldName} cannot be empty or contain only whitespace and control characters`,
    })
    .refine((val) => val.length <= max, {
      message: `${fieldName} must not exceed ${max} characters`,
    });
}

// Valid 24-character hexadecimal MongoDB ObjectId
const objectIdSchema = z
  .string({ required_error: 'ID is required', invalid_type_error: 'ID must be a string' })
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

// Latitude (-90 to 90), rounded to 6 decimal places
const latitudeSchema = z
  .number({ required_error: 'Latitude is required', invalid_type_error: 'Latitude must be a valid number' })
  .refine((v) => Number.isFinite(v), 'Latitude must be a finite number')
  .refine((v) => v >= -90 && v <= 90, 'Latitude must be between -90 and 90')
  .transform((v) => Number(v.toFixed(6)));

// Longitude (-180 to 180), rounded to 6 decimal places
const longitudeSchema = z
  .number({ required_error: 'Longitude is required', invalid_type_error: 'Longitude must be a valid number' })
  .refine((v) => Number.isFinite(v), 'Longitude must be a finite number')
  .refine((v) => v >= -180 && v <= 180, 'Longitude must be between -180 and 180')
  .transform((v) => Number(v.toFixed(6)));

module.exports = {
  containsNullByte,
  normalizeText,
  normalizedString,
  objectIdSchema,
  latitudeSchema,
  longitudeSchema,
  parseStrictCoordinate,
};
