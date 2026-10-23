const express = require('express');
const { validate } = require('../middleware/validate');
const { sendSuccess, asyncHandler } = require('../http/respond');
const { RegisterBodySchema, LoginBodySchema } = require('./schemas/auth.schemas');

/**
 * POST /api/v1/auth/register  → 201 { user, accessToken }   409 EMAIL_TAKEN
 * POST /api/v1/auth/login     → 200 { user, accessToken }   401 INVALID_CREDENTIALS
 * Both are rate limited (429 RATE_LIMITED).
 */
function createAuthRouter({ authService, authRateLimiter }) {
  const router = express.Router();

  router.post(
    '/register',
    authRateLimiter,
    validate({ body: RegisterBodySchema }),
    asyncHandler(async (req, res) => {
      sendSuccess(res, 201, await authService.register(req.validated.body));
    })
  );

  router.post(
    '/login',
    authRateLimiter,
    validate({ body: LoginBodySchema }),
    asyncHandler(async (req, res) => {
      sendSuccess(res, 200, await authService.login(req.validated.body));
    })
  );

  return router;
}

module.exports = { createAuthRouter };
