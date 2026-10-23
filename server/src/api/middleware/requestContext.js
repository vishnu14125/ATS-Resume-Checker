const crypto = require('crypto');

const INCOMING_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Assigns every request an id (reusing a well-formed incoming X-Request-Id),
 * echoes it in the response header, and logs one `http.request` event per
 * response. The query string is never logged.
 */
function requestContext(logger) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && INCOMING_ID.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info('http.request', {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - startedAt) / 1000000n),
        userId: req.auth ? req.auth.userId : undefined,
      });
    });
    next();
  };
}

module.exports = { requestContext };
