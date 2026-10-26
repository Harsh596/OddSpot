const { Schema, model } = require('mongoose');

const idempotencyKeySchema = new Schema(
  {
    key: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    route: { type: String },
    endpoint: {
      type: String,
      default: function () {
        return this.route || '';
      },
    },
    requestHash: { type: String, required: true },
    inProgress: { type: Boolean, default: true },
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

idempotencyKeySchema.pre('validate', function (next) {
  if (this.route && !this.endpoint) {
    this.endpoint = this.route;
  } else if (this.endpoint && !this.route) {
    this.route = this.endpoint;
  }
  next();
});

// Unique compound index: prevents duplicate concurrent processing per user per key
idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });

// TTL index: automatically purged after 24 hours
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = model('IdempotencyKey', idempotencyKeySchema);
