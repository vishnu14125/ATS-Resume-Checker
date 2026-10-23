/**
 * Response envelope used by every /api/v1 endpoint:
 *   success → { success: true, data, meta? }
 *   failure → { success: false, error: { code, message, requestId, details? } }  (see errorHandler)
 */
function sendSuccess(res, status, data, meta) {
  const body = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

/** Wraps an async route handler so rejections reach the error handler. */
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

module.exports = { sendSuccess, asyncHandler };
