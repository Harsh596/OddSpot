// backend/routes/auth.js
// Authentication routes with 15m access tokens, rotating refresh tokens,
// timing-equalized logins, email verification, password reset, and account management.

const crypto = require('crypto');
const { Router } = require('express');
const bcrypt = require('bcrypt');
const { authLimiter } = require('../config/rateLimits');
const { mongoose } = require('../db');
const { User, Post, Comment, RefreshToken, EmailToken } = require('../models');
const { requireAuth, clearUserCache, invalidateUserAuthCache } = require('../middleware/auth');
const {
  BCRYPT_ROUNDS,
  DUMMY_HASH,
  TOMBSTONE_USER_ID,
} = require('../config/auth');
const { sendMail } = require('../services/mailer');
const { generateAccessToken, issueRefreshToken, rotateRefreshToken } = require('../services/token');
const {
  validateBody,
  ErrorCodes,
  formatErrorResponse,
  auth: authValidators,
} = require('../validators');

const router = Router();

// POST /api/auth/signup - User registration
router.post('/signup', authLimiter, validateBody(authValidators.signupSchema), async (req, res, next) => {
  try {
    const { username, email, password, confirmAge, ageConfirmed } = req.body;

    // Case-insensitive duplicate check
    const existing = await User.findOne({
      $or: [{ usernameLower: username.toLowerCase() }, { email: email.toLowerCase() }],
    });

    if (existing) {
      if (existing.usernameLower === username.toLowerCase()) {
        return res.status(409).json(
          formatErrorResponse(ErrorCodes.DUPLICATE_KEY, 'Username is already taken')
        );
      }
      return res.status(409).json(
        formatErrorResponse(ErrorCodes.DUPLICATE_KEY, 'Email is already registered')
      );
    }

    // Generate email verification token (single-use, expires in 24h)
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const ageConfirmedAt = (confirmAge || ageConfirmed) ? new Date() : null;

    // Hash password with centralized rounds and create user
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({
      username,
      email,
      passwordHash,
      emailVerified: false,
      ageConfirmedAt,
      tokenVersion: 0,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationExpires: verificationExpires,
    });

    // Record verification token in EmailToken collection
    await EmailToken.create({
      userId: user._id,
      tokenHash: verificationTokenHash,
      type: 'verify_email',
      expiresAt: verificationExpires,
    });

    // Send verification email asynchronously via pluggable mail transport
    setImmediate(() => {
      sendMail({
        to: email,
        subject: 'Verify your Oddspot account',
        text: `Welcome to Oddspot! Verify your account with token: ${rawVerificationToken}`,
      }).catch((err) => console.error('Failed to send verification email:', err));
    });

    // Issue tokens: 15m access token (without role) and rotating refresh token
    const token = generateAccessToken(user);
    const { refreshToken } = await issueRefreshToken(user._id);

    res.status(201).json({
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        homePlace: user.homePlace,
        badges: user.badges,
        emailVerified: user.emailVerified,
        ageConfirmedAt: user.ageConfirmedAt,
        onboardingDone: Boolean(user.onboardingDone),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login - Timing-equalized login with oracle-safe lockout
router.post('/login', authLimiter, validateBody(authValidators.loginSchema), async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    const cleanIdentifier = identifier.trim().toLowerCase();

    // Find user by normalized email or lowercased username
    const user = await User.findOne({
      $or: [{ email: cleanIdentifier }, { usernameLower: cleanIdentifier }],
    }).select('+passwordHash');

    // [B1] Always run bcrypt.compare unconditionally first before any lockout/ban check
    const targetHash = user && user.passwordHash ? user.passwordHash : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, targetHash);

    const isLocked = Boolean(user && user.lockUntil && new Date(user.lockUntil) > new Date());

    // If user does not exist, credentials mismatch, or account is currently locked:
    // Return identical 401 response and update failure counters asynchronously
    if (!user || !passwordMatches || isLocked) {
      if (user) {
        setImmediate(async () => {
          try {
            const now = new Date();
            // If lockUntil has expired, atomically reset failedLoginAttempts to 1 instead of stacking old failures
            if (user.lockUntil && new Date(user.lockUntil) <= now) {
              await User.updateOne(
                { _id: user._id },
                { $set: { failedLoginAttempts: 1, lockUntil: null } }
              );
            } else {
              const newAttempts = (user.failedLoginAttempts || 0) + 1;
              const updateDoc = { $inc: { failedLoginAttempts: 1 } };
              if (newAttempts >= 5) {
                // Lock account for 15 minutes
                updateDoc.$set = { lockUntil: new Date(Date.now() + 15 * 60 * 1000) };
              }
              await User.updateOne({ _id: user._id }, updateDoc);
            }
          } catch (err) {
            if (err.name !== 'MongoClientClosedError' && !err.message?.includes('closed')) {
              console.error('Failed to update login failure counter:', err);
            }
          }
        });
      }

      return res.status(401).json(
        formatErrorResponse(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid username/email or password')
      );
    }

    // Check and return banned status (HTTP 403) ONLY after password verification succeeds
    if (user.banned) {
      return res.status(403).json(
        formatErrorResponse(ErrorCodes.AUTH_FORBIDDEN_BANNED, 'This account has been suspended')
      );
    }

    // Reset failed login attempts on successful authentication
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      User.updateOne(
        { _id: user._id },
        { $set: { failedLoginAttempts: 0, lockUntil: null } }
      ).catch((err) => console.error('Failed to reset login failure counter:', err));
    }

    const token = generateAccessToken(user);
    const { refreshToken } = await issueRefreshToken(user._id);

    res.json({
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        homePlace: user.homePlace,
        badges: user.badges,
        emailVerified: user.emailVerified,
        onboardingDone: Boolean(user.onboardingDone),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh - Rotate refresh token with atomic reuse detection
router.post('/refresh', validateBody(authValidators.refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const rotated = await rotateRefreshToken(refreshToken);
    if (rotated.error) {
      const code = rotated.code || ErrorCodes.AUTH_INVALID_TOKEN;
      return res.status(rotated.status || 401).json(
        formatErrorResponse(code, rotated.error)
      );
    }

    const existing = rotated.existing;

    // Check user still exists and is not banned before issuing child token
    const user = await User.findById(existing.userId);
    if (!user) {
      return res.status(401).json(
        formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'User no longer exists')
      );
    }
    if (user.banned) {
      return res.status(403).json(
        formatErrorResponse(ErrorCodes.AUTH_FORBIDDEN_BANNED, 'This account has been suspended')
      );
    }

    const newAccessToken = generateAccessToken(user);
    const { refreshToken: nextRefreshToken } = await issueRefreshToken(user._id, existing.familyId);
    const nextTokenHash = crypto.createHash('sha256').update(nextRefreshToken.trim()).digest('hex');
    await RefreshToken.updateOne({ _id: existing._id }, { $set: { replacedBy: nextTokenHash } });

    res.json({
      token: newAccessToken,
      refreshToken: nextRefreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout - Revoke the specific refresh token session
router.post('/logout', validateBody(authValidators.logoutSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken && typeof refreshToken === 'string') {
      const tokenHash = crypto.createHash('sha256').update(refreshToken.trim()).digest('hex');
      await RefreshToken.updateOne(
        { tokenHash },
        { $set: { revoked: true, revokedAt: new Date() } }
      );
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout-all - Invalidate all active refresh tokens and sessions for user
router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await RefreshToken.deleteMany({ userId: req.user.id });
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { tokenVersion: 1 },
      $set: { passwordChangedAt: new Date() },
    });
    invalidateUserAuthCache(req.user.id);
    res.json({ message: 'All sessions logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password - Change password with rate limiting, tokenVersion bump, and lockout protection
router.post('/change-password', requireAuth, authLimiter, validateBody(authValidators.changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!user) {
      return res.status(404).json(
        formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found')
      );
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      // Track failed password attempts against account lockout counter
      const newAttempts = (user.failedLoginAttempts || 0) + 1;
      const updateDoc = { $inc: { failedLoginAttempts: 1 } };
      if (newAttempts >= 5) {
        updateDoc.$set = { lockUntil: new Date(Date.now() + 15 * 60 * 1000) };
      }
      await User.updateOne({ _id: user._id }, updateDoc);
      return res.status(400).json(
        formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Current password is incorrect')
      );
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      return res.status(400).json(
        formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'New password must be different from current password')
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Atomically update password, increment tokenVersion, reset lockout, and clear reset tokens
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockUntil: null,
        },
        $inc: { tokenVersion: 1 },
        $unset: {
          passwordResetTokenHash: 1,
          passwordResetExpires: 1,
        },
      }
    );

    // Revoke all existing refresh tokens
    await RefreshToken.deleteMany({ userId: user._id });
    invalidateUserAuthCache(user._id.toString());

    // Issue fresh tokens for the current session
    const updatedUser = await User.findById(user._id);
    const token = generateAccessToken(updatedUser);
    const { refreshToken } = await issueRefreshToken(user._id);

    res.json({
      message: 'Password changed successfully',
      token,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// Generic password reset initiation handler
async function handleForgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const genericResponse = {
      message: 'If an account exists with that email, a password reset link has been sent.',
    };

    if (!email) {
      return res.json(genericResponse);
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (user && !user.banned) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store in User and EmailToken collection
      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpires = expiresAt;
      await user.save();

      await EmailToken.create({
        userId: user._id,
        tokenHash,
        type: 'reset_password',
        expiresAt,
      });

      // Non-blocking detached email delivery to prevent timing enumeration
      setImmediate(() => {
        sendMail({
          to: user.email,
          subject: 'Reset your Oddspot password',
          text: `You requested a password reset. Reset token: ${rawToken}`,
        }).catch((err) => console.error('Failed to send reset email:', err));
      });
    }

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/forgot-password - Enumeration-safe, non-blocking password reset initiation
router.post('/forgot-password', authLimiter, validateBody(authValidators.forgotPasswordSchema), handleForgotPassword);

// POST /api/auth/reset-password - Single-use expiring password reset
router.post('/reset-password', authLimiter, validateBody(authValidators.resetPasswordSchema), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    let user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetTokenHash +passwordResetExpires +passwordHash');

    if (!user) {
      const emailToken = await EmailToken.findOne({
        tokenHash,
        type: 'reset_password',
        expiresAt: { $gt: new Date() },
        usedAt: null,
      });
      if (emailToken) {
        user = await User.findById(emailToken.userId).select('+passwordHash');
      }
    }

    if (!user) {
      return res.status(400).json(
        formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid or expired password reset token')
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Atomically clear password reset tokens, set new password, increment tokenVersion, and reset lockout
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockUntil: null,
        },
        $inc: { tokenVersion: 1 },
        $unset: {
          passwordResetTokenHash: 1,
          passwordResetExpires: 1,
        },
      }
    );

    // Mark EmailToken used
    await EmailToken.updateMany({ tokenHash }, { $set: { usedAt: new Date() } });

    // Revoke all active sessions on password reset
    await RefreshToken.deleteMany({ userId: user._id });
    invalidateUserAuthCache(user._id.toString());

    res.json({ message: 'Password reset successfully. You may now log in.' });
  } catch (err) {
    next(err);
  }
});

// Verification request handler
async function handleVerifyEmailRequest(req, res, next) {
  try {
    const email = req.body?.email || req.user?.email;
    const genericResponse = {
      message: 'If an account exists with that email and is unverified, a verification link has been sent.',
    };

    if (!email) {
      return res.json(genericResponse);
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (user && !user.emailVerified && !user.banned) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      user.emailVerificationTokenHash = tokenHash;
      user.emailVerificationExpires = expiresAt;
      await user.save();

      await EmailToken.create({
        userId: user._id,
        tokenHash,
        type: 'verify_email',
        expiresAt,
      });

      setImmediate(() => {
        sendMail({
          to: user.email,
          subject: 'Verify your Oddspot account',
          text: `Verify your account with token: ${rawToken}`,
        }).catch((err) => console.error('Failed to send verification email:', err));
      });
    }

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
}

// Verification confirm handler
async function handleVerifyEmailConfirm(req, res, next) {
  try {
    const { token } = req.body;

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    let user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: { $gt: new Date() },
    }).select('+emailVerificationTokenHash +emailVerificationExpires');

    if (!user) {
      const emailToken = await EmailToken.findOne({
        tokenHash,
        type: 'verify_email',
        expiresAt: { $gt: new Date() },
        usedAt: null,
      });
      if (emailToken) {
        user = await User.findById(emailToken.userId);
      }
    }

    if (!user) {
      return res.status(400).json(
        formatErrorResponse(ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid or expired verification token')
      );
    }

    const now = new Date();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerified: true,
          emailVerifiedAt: now,
        },
        $unset: {
          emailVerificationTokenHash: 1,
          emailVerificationExpires: 1,
        },
      }
    );

    await EmailToken.updateMany({ tokenHash }, { $set: { usedAt: now } });
    invalidateUserAuthCache(user._id.toString());

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-email/request & POST /api/auth/resend-verification
router.post('/verify-email/request', authLimiter, validateBody(authValidators.resendVerificationSchema), handleVerifyEmailRequest);
router.post('/resend-verification', authLimiter, validateBody(authValidators.resendVerificationSchema), handleVerifyEmailRequest);

// POST /api/auth/verify-email/confirm & POST /api/auth/verify-email
router.post('/verify-email/confirm', validateBody(authValidators.verifyEmailSchema), handleVerifyEmailConfirm);
router.post('/verify-email', validateBody(authValidators.verifyEmailSchema), handleVerifyEmailConfirm);

// GET /api/auth/me - Protected user profile
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json(
        formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found')
      );
    }
    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        homePlace: user.homePlace,
        badges: user.badges,
        stats: user.stats,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        ageConfirmedAt: user.ageConfirmedAt,
        trust: user.trust,
        onboardingDone: Boolean(user.onboardingDone),
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/me - Secure account deletion with password re-check and transactional anonymization
router.delete('/me', requireAuth, validateBody(authValidators.deleteAccountSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword } = req.body;

    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      return res.status(404).json(
        formatErrorResponse(ErrorCodes.NOT_FOUND, 'User not found')
      );
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      return res.status(400).json(
        formatErrorResponse(ErrorCodes.VALIDATION_FAILED, 'Current password is incorrect')
      );
    }

    // Execute deletion within a Mongoose transaction
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Reassign posts and comments to system tombstone ID (schema compliant, non-null ObjectId)
        await Post.updateMany({ authorId: userId }, { $set: { authorId: TOMBSTONE_USER_ID } }, { session });
        await Comment.updateMany({ authorId: userId }, { $set: { authorId: TOMBSTONE_USER_ID } }, { session });

        // Revoke and delete all refresh tokens and email tokens for user
        await RefreshToken.deleteMany({ userId }, { session });
        await EmailToken.deleteMany({ userId }, { session });

        // Delete user document
        await User.findByIdAndDelete(userId, { session });
      });
    } catch (txErr) {
      // Standalone MongoDB fallback if transactions not supported by deployment
      if (txErr.message && (txErr.message.includes('replica set') || txErr.message.includes('Transaction numbers'))) {
        await Post.updateMany({ authorId: userId }, { $set: { authorId: TOMBSTONE_USER_ID } });
        await Comment.updateMany({ authorId: userId }, { $set: { authorId: TOMBSTONE_USER_ID } });
        await RefreshToken.deleteMany({ userId });
        await EmailToken.deleteMany({ userId });
        await User.findByIdAndDelete(userId);
      } else {
        throw txErr;
      }
    } finally {
      await session.endSession();
    }

    invalidateUserAuthCache(userId);

    res.json({ message: 'Account deleted and contributions anonymized successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
