const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const mongoose = require('mongoose');

let cached = null;

function extractDbName(uri) {
  if (!uri || typeof uri !== 'string') return '';
  try {
    const withoutQuery = uri.split('?')[0];
    const slashIdx = withoutQuery.lastIndexOf('/');
    return slashIdx !== -1 ? withoutQuery.slice(slashIdx + 1) : '';
  } catch {
    return '';
  }
}

async function connect(customUri) {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const uri = customUri || (isTestEnv && process.env.MONGODB_TEST_URI) || process.env.MONGODB_URI;

  if (!uri) throw new Error('MONGODB_URI is not set');

  const dbName = extractDbName(uri);
  if (isTestEnv && dbName.toLowerCase() === 'oddspot') {
    throw new Error(
      "Safety violation: Refusing to run with NODE_ENV=test against the production database 'oddspot'. " +
        "Use mongodb-memory-server or a dedicated 'oddspot_test' database."
    );
  }

  // If already connected with the same URI, reuse connection
  if (cached && mongoose.connection.readyState === 1) {
    return cached;
  }

  mongoose.set('strictQuery', true);
  cached = await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
  });
  return cached;
}

async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  cached = null;
}

module.exports = { connect, disconnect, extractDbName, mongoose };
