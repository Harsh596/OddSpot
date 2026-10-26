// backend/services/audit.js
// Audit service for recording administrative, moderation, and security operations.

const AuditLog = require('../models/AuditLog');

async function logAudit({ actorId, action, targetType, targetId, reason, meta = {}, session = null }) {
  try {
    const entry = new AuditLog({
      actorId,
      action,
      targetType,
      targetId,
      reason: reason || '',
      meta,
    });
    const options = session ? { session } : {};
    return await entry.save(options);
  } catch (err) {
    // Non-blocking: log error to console so primary transaction or request is not aborted
    console.error('Failed to write audit log:', err.message);
    return null;
  }
}

module.exports = {
  logAudit,
};
