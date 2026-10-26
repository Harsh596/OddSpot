// backend/services/mailer.js
// Pluggable mail transport.
// In test: saves sent emails to an in-memory queue.
// In dev: outputs a readable formatted email block to console.
// Production: pluggable transport for external provider (e.g. SMTP / Resend).

const sentMailQueue = [];

async function sendMail({ to, subject, text, html }) {
  const mailItem = {
    to,
    subject,
    text,
    html,
    sentAt: new Date(),
  };

  if (process.env.NODE_ENV === 'test') {
    sentMailQueue.push(mailItem);
    return { success: true, id: `test-mail-${sentMailQueue.length}` };
  }

  // Console transport for local development
  console.log('\n================== [OUTGOING EMAIL] ==================');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log('------------------------------------------------------');
  console.log(text || html);
  console.log('======================================================\n');

  return { success: true, id: `console-mail-${Date.now()}` };
}

// Test inspection helpers
function __getSentMail() {
  return [...sentMailQueue];
}

function __clearSentMail() {
  sentMailQueue.length = 0;
}

module.exports = {
  sendMail,
  __getSentMail,
  __clearSentMail,
};
