const { Schema, model } = require('mongoose');

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    communityId: { type: Schema.Types.ObjectId, ref: 'Community', required: true },
    role: { type: String, enum: ['member', 'moderator', 'owner'], default: 'member' },
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, communityId: 1 }, { unique: true });
membershipSchema.index({ communityId: 1 });

module.exports = model('Membership', membershipSchema);
