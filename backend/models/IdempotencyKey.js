const { Schema, model } = require('mongoose');

const idempotencyKeySchema = new Schema(
  {
    key: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
    },
    statusCode: { type: Number },
    responseBody: { type: Schema.Types.Mixed },
    lockedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// Unique compound index: prevents duplicate concurrent processing per user per key
idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });

// TTL index: automatically purged after 24 hours
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = model('IdempotencyKey', idempotencyKeySchema);
