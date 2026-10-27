const { Schema, model } = require('mongoose');

const placeSchema = new Schema(
  { city: String, state: String, country: String },
  { _id: false }
);

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 24 },
    usernameLower: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailLower: { type: String, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: {
      type: String,
      validate: {
        validator: function (val) {
          if (!val) return true;
          const { isSecureImageUrl } = require('../utils/imageUrlValidator');
          return isSecureImageUrl(val);
        },
        message: 'Avatar URL must be a valid secure image URL without IP literals or local targets',
      },
    },
    bio: { type: String, maxlength: 300 },
    homePlace: placeSchema,
    role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },

    // Verification and Password Reset
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    ageConfirmedAt: { type: Date },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Account-level lockout, session invalidation and trust
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    passwordChangedAt: { type: Date },
    shadowBanned: { type: Boolean, default: false, index: true },
    trust: {
      type: Schema.Types.Mixed,
      default: 0,
    },
    lastPostLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number],
    },

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

// Keep lowercase normalized keys in sync
userSchema.pre('validate', function () {
  if (this.username) {
    this.usernameLower = (this.username || '').toLowerCase().trim();
  }
  if (this.email) {
    this.emailLower = (this.email || '').toLowerCase().trim();
  }
});

module.exports = model('User', userSchema);
