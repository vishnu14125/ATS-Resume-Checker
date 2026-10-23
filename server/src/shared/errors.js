/**
 * Canonical error model. Every error that reaches an API client is an AppError
 * with a stable, machine-readable code from ERROR_CODES.
 */

const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: { status: 400, message: 'The request is invalid.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Invalid email or password.' },
  TOKEN_EXPIRED: { status: 401, message: 'Your session has expired. Please sign in again.' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action.' },
  NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
  EMAIL_TAKEN: { status: 409, message: 'An account with this email already exists.' },
  CONFLICT: { status: 409, message: 'The request conflicts with the current state of the resource.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'The request payload is too large.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'The content type is not supported.' },
  UNPROCESSABLE_DOCUMENT: { status: 422, message: 'The document could not be processed.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please try again later.' },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
  NOT_READY: { status: 503, message: 'The service is not ready.' },
});

class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {{ message?: string, details?: unknown, cause?: unknown }} [options]
   */
  constructor(code, { message, details, cause } = {}) {
    const definition = ERROR_CODES[code];
    if (!definition) throw new Error(`Unknown error code: ${code}`);
    super(message || definition.message);
    this.name = 'AppError';
    this.code = code;
    this.status = definition.status;
    this.details = details === undefined ? null : details;
    if (cause) this.cause = cause;
  }
}

/** Converts zod issues into a client-safe list of { path, message, code }. */
function formatZodIssues(issues, prefix = []) {
  return issues.map((issue) => ({
    path: [...prefix, ...issue.path].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

module.exports = { AppError, ERROR_CODES, formatZodIssues };
