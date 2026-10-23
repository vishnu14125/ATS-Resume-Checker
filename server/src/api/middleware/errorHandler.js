const { AppError } = require('../../shared/errors');

const STATUS_TO_CODE = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_DOCUMENT',
  429: 'RATE_LIMITED',
};

/**
 * Normalizes anything thrown into an AppError.
 * - AppError: used as-is.
 * - Body-parser errors: malformed JSON → 400, oversized body → 413.
 * - Mongoose ObjectId cast errors (malformed ids) → 404.
 * - Errors carrying an explicit 4xx status keep their message (they were written for clients).
 * - Everything else → 500 INTERNAL_ERROR with a generic message; the original is only logged.
 */
function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err && err.type === 'entity.parse.failed') {
    return new AppError('VALIDATION_ERROR', { message: 'The request body is not valid JSON.' });
  }
  if (err && err.type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE');
  if (err && err.name === 'CastError' && err.kind === 'ObjectId') return new AppError('NOT_FOUND');

  const status = err && Number(err.statusCode || err.status);
  if (status >= 400 && status < 500 && STATUS_TO_CODE[status]) {
    return new AppError(STATUS_TO_CODE[status], { message: err.expose === false ? undefined : err.message });
  }
  return new AppError('INTERNAL_ERROR', { cause: err });
}

function createErrorHandler({ logger, exposeDebug = false }) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    const appError = toAppError(err);
    const logFields = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: appError.status,
      code: appError.code,
      error: err,
    };
    if (appError.status >= 500) logger.error('http.error', logFields);
    else logger.debug('http.client_error', { ...logFields, error: undefined, message: appError.message });

    if (res.headersSent) return next(err);

    const body = { code: appError.code, message: appError.message, requestId: req.id || null };
    if (appError.details !== null) body.details = appError.details;
    if (exposeDebug && appError.status >= 500 && err) body.debug = { name: err.name, message: err.message, stack: err.stack };
    return res.status(appError.status).json({ success: false, error: body });
  };
}

/** Terminal handler for unmatched routes. */
function notFoundHandler(req, res, next) {
  next(new AppError('NOT_FOUND', { message: `Route ${req.method} ${req.originalUrl.split('?')[0]} does not exist.` }));
}

module.exports = { createErrorHandler, notFoundHandler, toAppError };
