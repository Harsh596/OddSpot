// backend/config/jwt.js
// Centralized JWT configuration, startup secret validation, and kid key rotation support.

function validateJwtConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be configured and contain at least 32 characters');
  }
}

function getKeyring() {
  let keyring = {};
  if (process.env.JWT_SECRETS) {
    try {
      keyring =
        typeof process.env.JWT_SECRETS === 'string'
          ? JSON.parse(process.env.JWT_SECRETS)
          : process.env.JWT_SECRETS;
    } catch {
      keyring = {};
    }
  }
  return keyring;
}

function getCurrentSigningKey() {
  const keyring = getKeyring();
  const currentKid = process.env.JWT_CURRENT_KEY_ID;
  if (currentKid && keyring[currentKid]) {
    return { secret: keyring[currentKid], kid: currentKid };
  }
  return { secret: process.env.JWT_SECRET, kid: null };
}

module.exports = {
  validateJwtConfig,
  getKeyring,
  getCurrentSigningKey,
  JWT_EXPIRES_IN: '15m',
};
