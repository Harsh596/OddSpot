const mongoose = require('mongoose');

const schemaVersionSchema = new mongoose.Schema(
  {
    version: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'schemaversions',
    timestamps: false,
  }
);

module.exports = mongoose.model('SchemaVersion', schemaVersionSchema);
