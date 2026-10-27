const { Schema, model } = require('mongoose');

// "I visited this" check-ins
const visitSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    photoUrl: {
      type: String,
      validate: {
        validator: function (val) {
          if (!val) return true;
          const { isSecureImageUrl } = require('../utils/imageUrlValidator');
          return isSecureImageUrl(val);
        },
        message: 'Photo URL must be a valid secure image URL without IP literals or local targets',
      },
    },
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
