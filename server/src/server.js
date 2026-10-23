const { loadConfig } = require('./config/env');
const { createLogger } = require('./shared/logger');
const { connectDatabase, disconnectDatabase } = require('./infrastructure/db/connection');
const { createApp } = require('./app');

const SHUTDOWN_TIMEOUT_MS = 10000;

/**
 * Bootstrap: validate config → connect MongoDB → build app → listen → handle shutdown.
 * Fails fast (exit code 1) on invalid config or an unreachable database.
 */
async function start(env = process.env) {
  let config;
  try {
    config = loadConfig(env);
  } catch (err) {
    // The logger's level comes from config, so configuration errors go straight to stderr.
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  const logger = createLogger({ level: config.logLevel });
  config.warnings.forEach((message) => logger.warn('config.warning', { message }));

  try {
    await connectDatabase(config.mongo, logger);
  } catch (err) {
    logger.error('db.connect_failed', { error: { name: err.name, message: err.message } });
    process.exit(1);
  }

  const app = createApp({ config, logger });
  const server = app.listen(config.port, () => {
    logger.info('server.started', { port: config.port, env: config.env });
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('server.shutdown_started', { signal });
    setTimeout(() => {
      logger.error('server.shutdown_timeout', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      logger.info('server.shutdown_complete');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('process.unhandled_rejection', { error: reason }));

  return { app, server, config, logger };
}

module.exports = { start };
