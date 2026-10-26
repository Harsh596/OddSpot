// backend/models/RefreshToken.js
// Stores SHA-256 hashed rotating refresh tokens with lineage familyId for reuse detection.

const { Schema, model } = require('mongoose');

const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    replacedBy: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    revoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
  }
);

// TTL index to automatically remove expired refresh tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('RefreshToken', refreshTokenSchema);
