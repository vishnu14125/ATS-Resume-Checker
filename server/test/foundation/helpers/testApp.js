const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { loadConfig } = require('../../../src/config/env');
const { createApp } = require('../../../src/app');
const { createLogger } = require('../../../src/shared/logger');

const TEST_JWT_SECRET = 'foundation-test-secret-0123456789abcdef';

/** Starts an isolated in-memory MongoDB for one test file (never touches a developer database). */
async function startMemoryDb() {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { serverSelectionTimeoutMS: 10000 });
  return {
    uri: server.getUri(),
    async clear() {
      const collections = await mongoose.connection.db.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    },
    async stop() {
      await mongoose.disconnect();
      await server.stop();
    },
  };
}

function buildConfig(env = {}) {
  return loadConfig({ NODE_ENV: 'test', JWT_SECRET: TEST_JWT_SECRET, AUTH_RATE_LIMIT_MAX: '1000', ANALYSIS_RATE_LIMIT_MAX: '1000', ...env });
}

/** Captures log lines so tests can assert on logging behaviour. */
function createCaptureLogger(level = 'debug') {
  const lines = [];
  const logger = createLogger({ level, write: (line) => lines.push(JSON.parse(line)) });
  return { logger, lines };
}

function buildApp({ env, logger, overrides } = {}) {
  const config = buildConfig(env);
  return createApp({ config, logger: logger || createLogger({ level: 'silent' }), overrides });
}

module.exports = { TEST_JWT_SECRET, startMemoryDb, buildConfig, buildApp, createCaptureLogger };
