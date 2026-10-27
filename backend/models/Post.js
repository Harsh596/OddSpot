const { Schema, model } = require('mongoose');

const imageSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      validate: {
        validator: function (val) {
          if (!val) return true;
          const { isSecureImageUrl } = require('../utils/imageUrlValidator');
          return isSecureImageUrl(val);
        },
        message: 'Image URL must be a valid secure image URL without IP literals or local targets',
      },
    },
    width: Number,
    height: Number,
  },
  { _id: false }
);

const postSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    communityId: { type: Schema.Types.ObjectId, ref: 'Community' },

    type: { type: String, enum: ['find', 'identify'], default: 'find' },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, maxlength: 10000 }, // markdown, sanitize on render
    images: { type: [imageSchema], validate: (v) => v.length <= 6 }, // URLs only, never binaries

    // Exact coordinates, GeoJSON [lng, lat]
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    // Feed coordinates (fuzzed when hideExact: true, exact when false) for direct $geoNear indexing
    feedLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] },
    },
    hideExact: { type: Boolean, default: false }, // API returns a fuzzed point when true

    // Reverse geocoded ONCE at creation, never at read time
    place: {
      city: { type: String, required: true },
      cityKey: { type: String, index: true },
      state: String,
      country: { type: String, required: true },
      countryCode: { type: String, index: true },
    },

    tags: [String],
    warnings: [{ type: String, enum: ['private_property', 'walking_required', 'unsafe_night', 'other'] }],

    // Scaling: city -> country. Room to add 'state' later.
    tier: { type: String, enum: ['city', 'state', 'country'], default: 'city' },

    // Denormalized counters, updated atomically on each reaction
    meter: {
      score: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      dislikes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      visits: { type: Number, default: 0 },
      reactions: { type: Number, default: 0 },
    },
    lastEngagedAt: { type: Date, default: Date.now },

    spotStatus: { type: String, enum: ['still_there', 'gone', 'changed'], default: 'still_there' },
    solved: { type: Boolean, default: false }, // for 'identify' posts
    bestCommentId: { type: Schema.Types.ObjectId, ref: 'Comment' },

    editedAt: { type: Date },
    editHistory: [
      {
        title: String,
        body: String,
        tags: [String],
        editedAt: { type: Date, default: Date.now },
      },
    ],
    updates: [
      {
        body: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    hotScore: { type: Number, default: 0, index: true },
    underReview: { type: Boolean, default: false },
    velocityFrozen: { type: Boolean, default: false, index: true },
    shadowBannedAuthor: { type: Boolean, default: false, index: true },
    removed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Geo indices
postSchema.index({ location: '2dsphere' });
postSchema.index({ feedLocation: '2dsphere' });

// City feed compound indexes (new, top, hot with cursor _id pagination)
postSchema.index({ 'place.cityKey': 1, 'place.countryCode': 1, createdAt: -1, _id: -1 });
postSchema.index({ 'place.cityKey': 1, 'place.countryCode': 1, 'meter.score': -1, _id: -1 });
postSchema.index({ 'place.cityKey': 1, 'place.countryCode': 1, hotScore: -1, _id: -1 });

// Country feed compound indexes (new, top, hot with cursor _id pagination)
postSchema.index({ tier: 1, 'place.countryCode': 1, createdAt: -1, _id: -1 });
postSchema.index({ tier: 1, 'place.countryCode': 1, 'meter.score': -1, _id: -1 });
postSchema.index({ tier: 1, 'place.countryCode': 1, hotScore: -1, _id: -1 });

// Legacy city/country indexes for backward compatibility
postSchema.index({ 'place.city': 1, 'place.country': 1, createdAt: -1 });
postSchema.index({ 'place.city': 1, 'place.country': 1, 'meter.score': -1 });
postSchema.index({ tier: 1, 'place.country': 1, 'meter.score': -1 });

// Community page
postSchema.index({ communityId: 1, createdAt: -1 });
// Profile page
postSchema.index({ authorId: 1, createdAt: -1 });

// Automatically keep feedLocation, cityKey, and countryCode synchronized
const { fuzzLocation } = require('../utils/fuzzLocation');
const { toCityKey, resolveCountry } = require('../utils/place');

postSchema.pre('save', function (next) {
  if (this.location && Array.isArray(this.location.coordinates)) {
    if (
      !this.feedLocation ||
      !Array.isArray(this.feedLocation.coordinates) ||
      this.isModified('hideExact') ||
      this.isModified('location')
    ) {
      if (this.hideExact) {
        this.feedLocation = {
          type: 'Point',
          coordinates: fuzzLocation(this.location.coordinates, this._id ? this._id.toString() : ''),
        };
      } else {
        this.feedLocation = {
          type: 'Point',
          coordinates: this.location.coordinates,
        };
      }
    }
  }

  if (this.place) {
    if (this.place.city && (!this.place.cityKey || this.isModified('place.city'))) {
      this.place.cityKey = toCityKey(this.place.city);
    }
    if (this.place.country && (!this.place.countryCode || this.isModified('place.country'))) {
      const resolved = resolveCountry(this.place.country);
      this.place.countryCode = resolved ? resolved.code : 'XX';
    }
  }

  if (this.hotScore === undefined || this.isModified('meter.score')) {
    const s = this.meter?.score || 0;
    const order = Math.log10(Math.max(Math.abs(s), 1));
    const sign = s > 0 ? 1 : s < 0 ? -1 : 0;
    const t = new Date(this.createdAt || Date.now()).getTime() / 1000;
    const seconds = t - 1700000000;
    this.hotScore = Number((sign * order + seconds / 45000).toFixed(7));
  }

  if (typeof next === 'function') next();
});

module.exports = model('Post', postSchema);
