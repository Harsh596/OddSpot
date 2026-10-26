const mongoose = require('mongoose');

const rateLimitSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    hits: {
      type: Number,
      required: true,
      default: 1,
    },
    resetAt: {
      type: Date,
      required: true,
      expires: 0, // TTL index
    },
  },
  {
    collection: 'ratelimits',
    timestamps: true,
  }
);

module.exports = mongoose.model('RateLimit', rateLimitSchema);
