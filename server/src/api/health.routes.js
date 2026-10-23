const express = require('express');
const { sendSuccess } = require('./http/respond');
const { AppError } = require('../shared/errors');

/**
 * GET /api/health        simple liveness response
 * GET /api/health/live   the process is up
 * GET /api/health/ready  the database is connected (503 NOT_READY otherwise)
 */
function createHealthRouter({ isDatabaseReady }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Health check passed!', timestamp: new Date().toISOString() });
  });

  router.get('/live', (req, res) => sendSuccess(res, 200, { status: 'live' }));

  router.get('/ready', (req, res, next) => {
    if (!isDatabaseReady()) {
      return next(new AppError('NOT_READY', { details: { checks: { database: 'down' } } }));
    }
    return sendSuccess(res, 200, { status: 'ready', checks: { database: 'up' } });
  });

  return router;
}

module.exports = { createHealthRouter };
