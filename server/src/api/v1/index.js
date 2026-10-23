const express = require('express');
const { notFoundHandler } = require('../middleware/errorHandler');
const { createAuthRouter } = require('./auth.routes');
const { createMeRouter } = require('./me.routes');
const { createAnalysesRouter } = require('./analyses.routes');

/**
 * /api/v1 — the versioned API, following the conventions documented in
 * server/src/README.md.
 */
function createV1Router(deps) {
  const router = express.Router();
  router.use('/auth', createAuthRouter(deps));
  router.use('/me', createMeRouter(deps));
  router.use('/analyses', createAnalysesRouter(deps));
  router.use(notFoundHandler);
  return router;
}

module.exports = { createV1Router };
