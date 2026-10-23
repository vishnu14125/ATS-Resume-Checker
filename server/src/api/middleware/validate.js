const { AppError, formatZodIssues } = require('../../shared/errors');

/**
 * Validates request parts against zod schemas at the HTTP boundary.
 *
 * The parsed values become the canonical input for the handler and are exposed
 * as `req.validated.{body,params,query}`. Handlers must read from `req.validated`,
 * never from the raw `req.body` / `req.params` / `req.query`.
 *
 * @param {{ body?: import('zod/v4').ZodType, params?: import('zod/v4').ZodType, query?: import('zod/v4').ZodType }} schemas
 */
function validate(schemas) {
  const parts = Object.keys(schemas);
  return (req, res, next) => {
    const validated = {};
    const issues = [];

    for (const part of parts) {
      const input = part === 'body' && req.body === undefined ? {} : req[part];
      const result = schemas[part].safeParse(input);
      if (result.success) validated[part] = result.data;
      else issues.push(...formatZodIssues(result.error.issues, [part]));
    }

    if (issues.length > 0) {
      return next(new AppError('VALIDATION_ERROR', { details: { issues } }));
    }
    req.validated = { ...(req.validated || {}), ...validated };
    return next();
  };
}

module.exports = { validate };
