// backend/services/token.js
// Handles JWT signing, verification with key rotation (kid), and rotating refresh token generation.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { RefreshToken } = require('../models');

// Validates JWT configuration at startup
function validateJwtConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be configured and contain at least 32 characters');
  }
}

// Parses optional key rotation configuration
function getKeyring() {
  let keyring = {};
  if (process.env.JWT_SECRETS) {
    try {
      keyring = typeof process.env.JWT_SECRETS === 'string'
        ? JSON.parse(process.env.JWT_SECRETS)
        : process.env.JWT_SECRETS;
    } catch {
      keyring = {};
    }
  }
  return keyring;
}

// Returns the current signing key and optional key ID
function getCurrentSigningKey() {
  const keyring = getKeyring();
  const currentKid = process.env.JWT_CURRENT_KEY_ID;
  if (currentKid && keyring[currentKid]) {
    return { secret: keyring[currentKid], kid: currentKid };
  }
  return { secret: process.env.JWT_SECRET, kid: null };
}

// Generates short-lived 15m access token containing strictly { id, username }
function generateAccessToken(user) {
  const { secret, kid } = getCurrentSigningKey();
  const payload = {
    id: user._id ? user._id.toString() : user.id,
    username: user.username,
  };

  const options = { expiresIn: '15m' };
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

  const kid = decodedComplete.header && decodedComplete.header.kid;
  const keyring = getKeyring();

  let secretToUse = process.env.JWT_SECRET;
  if (kid && keyring[kid]) {
    secretToUse = keyring[kid];
  }

  return jwt.verify(token, secretToUse);
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
    { $set: { revoked: true } },
    { new: false }
  );

  if (!existing) {
    const found = await RefreshToken.findOne({ tokenHash });
    if (found && found.revoked) {
      compromisedFamilies.add(found.familyId);
      await RefreshToken.updateMany({ familyId: found.familyId }, { $set: { revoked: true } });
      return {
        status: 401,
        error: 'Refresh token reuse detected. All sessions in this family have been revoked.',
        code: 'TOKEN_REUSE_DETECTED',
      };
    }
    return { status: 401, error: 'Invalid or expired refresh token' };
  }

  if (compromisedFamilies.has(existing.familyId)) {
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
