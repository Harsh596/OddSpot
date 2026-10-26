// backend/models/EmailToken.js
// Stores single-use SHA-256 hashed email verification and password reset tokens.

const { Schema, model } = require('mongoose');

const emailTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      enum: ['verify_email', 'reset_password'],
      required: true,
      index: true,
    },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
  }
);

// TTL index to automatically purge expired email tokens
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('EmailToken', emailTokenSchema);
