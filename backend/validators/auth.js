// backend/validators/auth.js
// Zod schemas with allowlists and scalar enforcement for authentication endpoints.

const { z } = require('zod');
const { RESERVED_USERNAMES, validatePasswordStrength } = require('../config/auth');
const { normalizeText } = require('./common');

// Password schema enforcing 8-72 byte length, no NUL bytes, and OWASP common blocklist
const passwordSchema = z
  .string({ required_error: 'Password is required', invalid_type_error: 'Password must be a text string' })
  .superRefine((val, ctx) => {
    const error = validatePasswordStrength(val);
    if (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error,
      });
    }
  });

// POST /api/v1/auth/signup
const signupSchema = z
  .object({
    username: z
      .string({ required_error: 'Username is required', invalid_type_error: 'Username must be a text string' })
      .transform((val) => normalizeText(val))
      .refine((val) => /^[A-Za-z0-9_]{3,24}$/.test(val), {
        message: 'Username must be 3-24 characters containing only letters, numbers, and underscores',
      })
      .refine((val) => !RESERVED_USERNAMES.has(val.toLowerCase()), {
        message: 'This username is reserved',
      }),
    email: z
      .string({ required_error: 'Email is required', invalid_type_error: 'Email must be a text string' })
      .transform((val) => normalizeText(val).toLowerCase())
      .refine((val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
        message: 'Invalid email address',
      }),
    password: passwordSchema,
    confirmAge: z.boolean().optional(),
    ageConfirmed: z.boolean().optional(),
  })
  .strip();

// POST /api/v1/auth/login
const loginSchema = z
  .object({
    identifier: z
      .string({ required_error: 'Username or email is required', invalid_type_error: 'Username or email must be a text string' })
      .transform((val) => normalizeText(val).toLowerCase())
      .refine((val) => val.length >= 1, {
        message: 'Username or email is required',
      }),
    password: z
      .string({ required_error: 'Password is required', invalid_type_error: 'Password must be a text string' })
      .refine((val) => !val.includes('\0') && !val.includes('\u0000'), {
        message: 'Password must not contain null characters',
      })
      .refine((val) => val.length >= 1, {
        message: 'Password is required',
      }),
  })
  .strip();

// POST /api/v1/auth/refresh
const refreshSchema = z
  .object({
    refreshToken: z
      .string({ required_error: 'Refresh token is required', invalid_type_error: 'Refresh token must be a text string' })
      .transform((val) => val.trim())
      .refine((val) => val.length >= 1, {
        message: 'Refresh token is required',
      }),
  })
  .strip();

// POST /api/v1/auth/logout
const logoutSchema = z
  .object({
    refreshToken: z
      .string({ invalid_type_error: 'Refresh token must be a text string' })
      .transform((val) => val.trim())
      .optional(),
  })
  .strip();

// POST /api/v1/auth/change-password
const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Current password is required', invalid_type_error: 'Current password must be a text string' })
      .refine((val) => !val.includes('\0') && !val.includes('\u0000'), {
        message: 'Password must not contain null characters',
      })
      .refine((val) => val.length >= 1, {
        message: 'Current password is required',
      }),
    newPassword: passwordSchema,
  })
  .strip();

// POST /api/v1/auth/forgot-password
const forgotPasswordSchema = z
  .object({
    email: z
      .string({ required_error: 'Email is required', invalid_type_error: 'Email must be a text string' })
      .transform((val) => normalizeText(val).toLowerCase())
      .optional(),
  })
  .strip();

// POST /api/v1/auth/reset-password
const resetPasswordSchema = z
  .object({
    token: z
      .string({ required_error: 'Reset token is required', invalid_type_error: 'Reset token must be a text string' })
      .transform((val) => val.trim())
      .refine((val) => val.length >= 1, {
        message: 'Reset token is required',
      }),
    newPassword: passwordSchema,
  })
  .strip();

// POST /api/v1/auth/verify-email
const verifyEmailSchema = z
  .object({
    token: z
      .string({ required_error: 'Verification token is required', invalid_type_error: 'Verification token must be a text string' })
      .transform((val) => val.trim())
      .refine((val) => val.length >= 1, {
        message: 'Verification token is required',
      }),
  })
  .strip();

// POST /api/v1/auth/resend-verification
const resendVerificationSchema = z
  .object({
    email: z
      .string({ required_error: 'Email is required', invalid_type_error: 'Email must be a text string' })
      .transform((val) => normalizeText(val).toLowerCase())
      .optional(),
  })
  .strip();

// DELETE /api/v1/auth/me
const deleteAccountSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Current password is required to delete account', invalid_type_error: 'Current password must be a text string' })
      .refine((val) => !val.includes('\0') && !val.includes('\u0000'), {
        message: 'Password must not contain null characters',
      })
      .refine((val) => val.length >= 1, {
        message: 'Current password is required to delete account',
      }),
  })
  .strip();

module.exports = {
  signupSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyEmailConfirmSchema: verifyEmailSchema,
  resendVerificationSchema,
  verifyEmailRequestSchema: resendVerificationSchema,
  deleteAccountSchema,
};
