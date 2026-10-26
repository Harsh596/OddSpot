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
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: String,
    bio: { type: String, maxlength: 300 },
    homePlace: placeSchema,
    role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },

    // Verification and Password Reset
    emailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Account-level lockout and session invalidation
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    passwordChangedAt: { type: Date },

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

// Keep lowercase normalized key in sync
userSchema.pre('validate', function () {
  if (this.username) {
    this.usernameLower = (this.username || '').toLowerCase().trim();
  }
});

module.exports = model('User', userSchema);
