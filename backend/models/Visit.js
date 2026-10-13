const { Schema, model } = require('mongoose');

// "I visited this" check-ins
const visitSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    photoUrl: String,
    note: { type: String, maxlength: 500 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    verified: { type: Boolean, default: false }, // GPS within visitRadiusMeters of the post
    spotStatus: { type: String, enum: ['still_there', 'gone', 'changed'] },
  },
  { timestamps: true }
);

visitSchema.index({ postId: 1, userId: 1 }, { unique: true });
visitSchema.index({ userId: 1, createdAt: -1 }); // personal map

module.exports = model('Visit', visitSchema);
