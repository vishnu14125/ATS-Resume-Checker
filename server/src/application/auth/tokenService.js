const jwt = require('jsonwebtoken');
const { AppError } = require('../../shared/errors');

const ALGORITHM = 'HS256';

/**
 * Issues and verifies access tokens.
 *
 * The payload is `{ id, email }`, signed with JWT_SECRET (HS256 only).
 */
function createTokenService({ secret, expiresIn }) {
  if (!secret) throw new Error('Token service requires a secret');

  return {
    sign(user) {
      return jwt.sign({ id: String(user._id), email: user.email }, secret, { algorithm: ALGORITHM, expiresIn });
    },

    /** @returns {{ userId: string, email: string|null }} */
    verify(token) {
      let payload;
      try {
        payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) throw new AppError('TOKEN_EXPIRED');
        throw new AppError('UNAUTHENTICATED', { message: 'Invalid access token.' });
      }
      if (!payload || typeof payload.id !== 'string' || !/^[a-f\d]{24}$/i.test(payload.id)) {
        throw new AppError('UNAUTHENTICATED', { message: 'Invalid access token.' });
      }
      return { userId: payload.id, email: typeof payload.email === 'string' ? payload.email : null };
    },
  };
}

module.exports = { createTokenService };
