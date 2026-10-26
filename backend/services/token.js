// backend/services/token.js
// Handles JWT signing, verification with key rotation (kid), and rotating refresh token generation.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { RefreshToken, User } = require('../models');
const {
  validateJwtConfig,
  getKeyring,
  getCurrentSigningKey,
  JWT_EXPIRES_IN,
} = require('../config/jwt');

// Generates short-lived 15m access token containing strictly { id, username, tokenVersion }
function generateAccessToken(user) {
  const { secret, kid } = getCurrentSigningKey();
  const payload = {
    id: user._id ? user._id.toString() : user.id,
    username: user.username,
    tokenVersion: typeof user.tokenVersion === 'number' ? user.tokenVersion : 0,
  };

  const options = { expiresIn: JWT_EXPIRES_IN || '15m' };
  if (kid) {
    options.header = { kid };
  }

  return jwt.sign(payload, secret, options);
}

// Verifies access token supporting key rotation
function verifyAccessToken(token) {
  const decodedComplete = jwt.decode(token, { complete: true });
  if (!decodedComplete || !decodedComplete.payload) {
    throw new Error('Invalid token structure');
  }

  if (decodedComplete.header && decodedComplete.header.alg === 'none') {
    throw new Error('Algorithm "none" is not permitted');
  }

  const kid = decodedComplete.header && decodedComplete.header.kid;
  const keyring = getKeyring();

  let secretToUse = process.env.JWT_SECRET;
  if (kid) {
    if (keyring[kid]) {
      secretToUse = keyring[kid];
    } else {
      throw new Error('Unknown or invalid key identifier (kid)');
    }
  }

  return jwt.verify(token, secretToUse, { algorithms: ['HS256'] });
}

const compromisedFamilies = new Set();

// Generates a hashed rotating refresh token record in the database
async function issueRefreshToken(userId, familyId = null) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tokenFamilyId = familyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const isRevoked = Boolean(familyId && compromisedFamilies.has(familyId));

  await RefreshToken.create({
    tokenHash,
    userId,
    familyId: tokenFamilyId,
    revoked: isRevoked,
    revokedAt: isRevoked ? new Date() : null,
    expiresAt,
  });

  return {
    refreshToken: rawToken,
    familyId: tokenFamilyId,
    expiresAt,
  };
}

// Atomically rotates a refresh token, enforcing reuse detection across the token family
async function rotateRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    return { status: 400, error: 'Refresh token is required' };
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

  // Atomically find and mark as revoked to eliminate TOCTOU race conditions
  const existing = await RefreshToken.findOneAndUpdate(
    { tokenHash, revoked: false, expiresAt: { $gt: new Date() } },
    { $set: { revoked: true, revokedAt: new Date() } },
    { new: false }
  );

  if (!existing) {
    const found = await RefreshToken.findOne({ tokenHash });
    if (found && (found.revoked || found.replacedBy)) {
      compromisedFamilies.add(found.familyId);
      await RefreshToken.updateMany(
        { familyId: found.familyId },
        { $set: { revoked: true, revokedAt: new Date() } }
      );
      if (found.userId) {
        await User.findByIdAndUpdate(found.userId, { $inc: { tokenVersion: 1 } });
        try {
          const { invalidateUserAuthCache } = require('../middleware/auth');
          invalidateUserAuthCache(found.userId.toString());
        } catch {}
      }
      return {
        status: 401,
        error: 'Refresh token reuse detected. All sessions in this family have been revoked.',
        code: 'TOKEN_REUSE_DETECTED',
      };
    }
    return { status: 401, error: 'Invalid or expired refresh token' };
  }

  if (compromisedFamilies.has(existing.familyId)) {
    if (existing.userId) {
      await User.findByIdAndUpdate(existing.userId, { $inc: { tokenVersion: 1 } });
      try {
        const { invalidateUserAuthCache } = require('../middleware/auth');
        invalidateUserAuthCache(existing.userId.toString());
      } catch {}
    }
    return {
      status: 401,
      error: 'Refresh token reuse detected. All sessions in this family have been revoked.',
      code: 'TOKEN_REUSE_DETECTED',
    };
  }

  return { existing };
}

module.exports = {
  validateJwtConfig,
  generateAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
};
