const express = require('express');
const { sendSuccess, asyncHandler } = require('../http/respond');

/** GET /api/v1/me → 200 { user }   401 UNAUTHENTICATED / TOKEN_EXPIRED */
function createMeRouter({ authService, authenticate }) {
  const router = express.Router();

  router.get(
    '/',
    authenticate,
    asyncHandler(async (req, res) => {
      sendSuccess(res, 200, { user: await authService.getProfile(req.auth.userId) });
    })
  );

  return router;
}

module.exports = { createMeRouter };
