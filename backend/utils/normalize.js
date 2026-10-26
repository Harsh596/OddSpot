// backend/utils/normalize.js
// Centralized text normalization and sanitization utilities.

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

/**
 * Normalizes user string input:
 * - Rejects NUL (\0 / \u0000) characters
 * - Unicode NFKC normalization
 * - Strips zero-width characters (\u200B-\u200D, \uFEFF)
 * - Strips ASCII & Latin-1 control characters (optionally preserving \n, \r, \t)
 * - Trims leading/trailing whitespace and collapses inner spaces
 * - Enforces optional maxLength
 */
function normalizeText(input, options = {}) {
  const { maxLength, fieldName = 'Field' } = options;
  const allowNewlines = Boolean(options.allowNewlines || options.multiLine);
  if (typeof input !== 'string') return input;

  if (input.includes('\0') || input.includes('\u0000')) {
    const err = new Error(`${fieldName} must not contain null characters`);
    err.code = 'VALIDATION_FAILED';
    err.statusCode = 400;
    throw err;
  }

  // 1. Unicode NFKC normalization
  let normalized = input.normalize('NFKC');

  // 2. Strip zero-width characters (zero-width space, joiners, BOM)
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 3. Strip control characters
  if (allowNewlines) {
    // Preserve newlines (\n, \r) and tabs (\t)
    normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
    normalized = normalized.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  } else {
    normalized = normalized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();
  }

  // 4. Max length validation if specified
  if (typeof maxLength === 'number' && normalized.length > maxLength) {
    const err = new Error(`${fieldName} must not exceed ${maxLength} characters`);
    err.code = 'VALIDATION_FAILED';
    err.statusCode = 400;
    throw err;
  }

  return normalized;
}

module.exports = {
  normalizeText,
  containsNullByte,
};
