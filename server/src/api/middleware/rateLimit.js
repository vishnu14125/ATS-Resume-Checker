const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../../shared/errors');

/** A rate limiter whose rejections use the standard error envelope (429 RATE_LIMITED). */
function createRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new AppError('RATE_LIMITED')),
  });
}

module.exports = { createRateLimiter };
