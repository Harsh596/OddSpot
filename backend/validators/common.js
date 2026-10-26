// backend/validators/common.js
// Shared validation primitives, text normalization transforms, and common Zod schemas.

const { z } = require('zod');

// Helper to recursively detect NUL (\0 / \u0000) characters in any string or object
function containsNullByte(val) {
  if (typeof val === 'string') {
    return val.includes('\0') || val.includes('\u0000');
  }
  if (Array.isArray(val)) {
    return val.some(containsNullByte);
  }
  if (val && typeof val === 'object') {
    for (const key of Object.keys(val)) {
      if (key.includes('\0') || key.includes('\u0000') || containsNullByte(val[key])) {
        return true;
      }
    }
  }
  return false;
}

// Normalizes text: rejects NUL, NFKC normalization, strips zero-width & control chars, collapses whitespace
function normalizeText(val, options = {}) {
  const { multiLine = false } = options;
  if (typeof val !== 'string') return val;

  if (val.includes('\0') || val.includes('\u0000')) {
    throw new Error('Input must not contain null characters');
  }

  // 1. Unicode NFKC normalization
  let normalized = val.normalize('NFKC');

  // 2. Strip zero-width characters (zero-width space, zero-width non-joiner, joiner, byte order mark)
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 3. Strip non-printable ASCII and Latin-1 control characters
  if (multiLine) {
    // Preserve newlines (\n, \r) and tabs (\t) for multiline content
    normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
    // Collapse tabs/spaces to single space, limit consecutive newlines to 2
    normalized = normalized.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  } else {
    // Strip all control characters
    normalized = normalized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    // Collapse all whitespace sequences to single space
    normalized = normalized.replace(/\s+/g, ' ').trim();
  }

  return normalized;
}

// Reusable normalized string schema with length bounds
function normalizedString({ min = 1, max = 255, multiLine = false, fieldName = 'Field' } = {}) {
  return z
    .string({ required_error: `${fieldName} is required`, invalid_type_error: `${fieldName} must be a text string` })
    .refine((val) => !val.includes('\0') && !val.includes('\u0000'), {
      message: `${fieldName} must not contain null characters`,
    })
    .transform((val) => normalizeText(val, { multiLine }))
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

// Latitude (-90 to 90)
const latitudeSchema = z
  .number({ required_error: 'Latitude is required', invalid_type_error: 'Latitude must be a valid number' })
  .refine((v) => Number.isFinite(v), 'Latitude must be a finite number')
  .refine((v) => v >= -90 && v <= 90, 'Latitude must be between -90 and 90');

// Longitude (-180 to 180)
const longitudeSchema = z
  .number({ required_error: 'Longitude is required', invalid_type_error: 'Longitude must be a valid number' })
  .refine((v) => Number.isFinite(v), 'Longitude must be a finite number')
  .refine((v) => v >= -180 && v <= 180, 'Longitude must be between -180 and 180');

module.exports = {
  containsNullByte,
  normalizeText,
  normalizedString,
  objectIdSchema,
  latitudeSchema,
  longitudeSchema,
};
