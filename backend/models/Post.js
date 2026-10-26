const { Schema, model } = require('mongoose');

const imageSchema = new Schema(
  { url: { type: String, required: true }, width: Number, height: Number },
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
    hideExact: { type: Boolean, default: false }, // API returns a fuzzed point when true

    // Reverse geocoded ONCE at creation, never at read time
    place: {
      city: { type: String, required: true },
      state: String,
      country: { type: String, required: true },
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

    removed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Nearby feed
postSchema.index({ location: '2dsphere' });
// City feed, newest and hottest
postSchema.index({ 'place.city': 1, 'place.country': 1, createdAt: -1 });
postSchema.index({ 'place.city': 1, 'place.country': 1, 'meter.score': -1 });
// Country feed + Random tab
postSchema.index({ tier: 1, 'place.country': 1, 'meter.score': -1 });
// Community page
postSchema.index({ communityId: 1, createdAt: -1 });
// Profile page
postSchema.index({ authorId: 1, createdAt: -1 });

module.exports = model('Post', postSchema);
