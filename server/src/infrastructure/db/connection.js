const mongoose = require('mongoose');

/** Host part of a Mongo URI, without credentials, for logging. */
function describeUri(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  return match ? match[1] : 'unknown';
}

let listenersAttached = false;

/**
 * Connects Mongoose. Rejects if the server cannot be selected within the
 * configured timeout, so the caller can fail fast instead of serving requests
 * without a database.
 */
async function connectDatabase({ uri, serverSelectionTimeoutMs }, logger) {
  mongoose.set('strictQuery', true);

  if (!listenersAttached) {
    listenersAttached = true;
    mongoose.connection.on('disconnected', () => logger.warn('db.disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('db.reconnected'));
    mongoose.connection.on('error', (err) => logger.error('db.error', { error: { name: err.name, message: err.message } }));
  }

  const startedAt = Date.now();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: serverSelectionTimeoutMs });
  logger.info('db.connected', { host: describeUri(uri), durationMs: Date.now() - startedAt });
  return mongoose.connection;
}

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, isDatabaseReady, describeUri };
