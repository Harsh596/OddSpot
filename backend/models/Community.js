const { Schema, model } = require('mongoose');

const communitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, maxlength: 500 },
    iconUrl: {
      type: String,
      validate: {
        validator: function (val) {
          if (!val) return true;
          const { isSecureImageUrl } = require('../utils/imageUrlValidator');
          return isSecureImageUrl(val);
        },
        message: 'Icon URL must be a valid secure image URL without IP literals or local targets',
      },
    },
    scope: { type: String, enum: ['city', 'country', 'interest'], default: 'city' },
    place: { city: String, state: String, country: String }, // for local communities
    center: { type: { type: String, enum: ['Point'] }, coordinates: [Number] }, // optional, for "nearby"
    rules: [String],
    flairs: [String],
    memberCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

communitySchema.index({ 'place.city': 1, 'place.country': 1 });
// sparse so communities without a center don't break the geo index
communitySchema.index({ center: '2dsphere' }, { sparse: true });
communitySchema.index({ name: 'text', description: 'text' });

module.exports = model('Community', communitySchema);
