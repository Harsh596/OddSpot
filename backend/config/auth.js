// backend/config/auth.js
// Centralized authentication constants, security limits, and validation helpers.

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { isCommonPassword } = require('./passwordBlocklist');

// Standard bcrypt rounds constant
const BCRYPT_ROUNDS = 10;

// Pre-computed dummy hash to equalize timing on non-existent users
const DUMMY_HASH = bcrypt.hashSync('oddspot_timing_equalization_secret_dummy', BCRYPT_ROUNDS);

// Reserved usernames blocked case-insensitively
const RESERVED_USERNAMES = new Set([
  'admin',
  'root',
  'support',
  'oddspot',
  'moderator',
  'mod',
  'system',
  'null',
  'undefined',
]);

// System tombstone User ID for anonymizing posts and comments upon user deletion
// Valid ObjectId satisfying required: true schema constraints on authorId
const TOMBSTONE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000000');

// Helper to validate password byte length, null characters, and common password blocklist
function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    return 'Password is required and must be text';
  }
  // Explicitly reject NUL bytes
  if (password.includes('\0') || password.includes('\u0000')) {
    return 'Password must not contain null characters';
  }
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength < 8) {
    return 'Password must be at least 8 bytes long';
  }
  if (byteLength > 72) {
    return 'Password must not exceed 72 bytes';
  }
  if (isCommonPassword(password)) {
    return 'This password is too common and easily guessed';
  }
  return null;
}

module.exports = {
  BCRYPT_ROUNDS,
  DUMMY_HASH,
  RESERVED_USERNAMES,
  TOMBSTONE_USER_ID,
  validatePasswordStrength,
};
