const { Schema, model } = require('mongoose');

const placeSchema = new Schema(
  { city: String, state: String, country: String },
  { _id: false }
);

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 24 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: String,
    bio: { type: String, maxlength: 300 },
    homePlace: placeSchema,
    role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },

    // Customization blobs. Validate/sanitize in the API layer; cap size here.
    theme: { type: Schema.Types.Mixed, default: {} },       // colors, fonts, neon, preset name
    profileLayout: { type: Schema.Types.Mixed, default: {} }, // widget order (later)
    feedConfig: {
      mode: { type: String, enum: ['default', 'rules'], default: 'default' },
      rules: { type: Schema.Types.Mixed, default: {} },     // sandboxed rule builder JSON
    },

    stats: {
      posts: { type: Number, default: 0 },
      visits: { type: Number, default: 0 },
    },
    badges: [String],
    onboardingDone: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
