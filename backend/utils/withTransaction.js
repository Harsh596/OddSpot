// backend/utils/withTransaction.js
// Utility helper to execute multi-document MongoDB operations inside a managed transaction.

const { mongoose } = require('../db');

/**
 * Executes an async callback within a MongoDB multi-document transaction.
 * - If an existing session is passed, executes the callback with that session.
 * - Otherwise, initiates a new Mongoose session, runs withTransaction, and cleans up.
 *
 * @param {Function} fn - async (session) => Promise<any>
 * @param {ClientSession|null} externalSession - optional active transaction session
 * @returns {Promise<any>}
 */
async function withTransaction(fn, externalSession = null) {
  if (externalSession) {
    return await fn(externalSession);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  withTransaction,
};
