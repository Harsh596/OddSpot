// backend/models/AuditLog.js
// Audit log model recording administrative, moderator, and security actions.

const { Schema, model } = require('mongoose');

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true, enum: ['post', 'comment', 'user', 'report', 'config'] },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    reason: { type: String, trim: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = model('AuditLog', auditLogSchema);
