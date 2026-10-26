const mongoose = require('mongoose');

const jobLockSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    lockedUntil: {
      type: Date,
      default: null,
      index: true,
    },
    owner: {
      type: String,
      default: null,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'joblocks',
    timestamps: false,
  }
);

module.exports = mongoose.model('JobLock', jobLockSchema);
