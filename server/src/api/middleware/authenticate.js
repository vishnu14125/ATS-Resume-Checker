const { AppError } = require('../../shared/errors');

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Requires a valid `Authorization: Bearer <token>` header and exposes the caller
 * as `req.auth = { userId, email }`. Ownership checks use `req.auth.userId`.
 */
function createAuthenticate(tokenService) {
  return (req, res, next) => {
    const header = req.get('authorization');
    if (!header) return next(new AppError('UNAUTHENTICATED'));
    const match = BEARER.exec(header);
    if (!match) return next(new AppError('UNAUTHENTICATED', { message: 'Use the Authorization: Bearer <token> scheme.' }));
    try {
      req.auth = tokenService.verify(match[1]);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { createAuthenticate };
