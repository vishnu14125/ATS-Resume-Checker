const express = require('express');
const { validate } = require('../middleware/validate');
const { createDocumentUpload } = require('../middleware/upload');
const { sendSuccess, asyncHandler } = require('../http/respond');
const {
  CreateAnalysisBodySchema, AnalysisParamsSchema, ListAnalysesQuerySchema, RunAiTaskBodySchema, buildAnalysisInput,
} = require('./schemas/analyses.schemas');

/**
 * POST /api/v1/analyses              → 201 { analysis }   400 / 413 / 415 / 422 / 429
 *   multipart: file `resume` (or field `resumeText`), optional file `job` (or field `jobText`)
 *   JSON:      { resumeText, jobText? }
 * GET  /api/v1/analyses              → 200 { items, nextCursor }   ?limit&cursor
 * GET  /api/v1/analyses/:analysisId  → 200 { analysis }   404 NOT_FOUND
 * DELETE /api/v1/analyses/:analysisId → 204 (no body)    404 NOT_FOUND
 * POST /api/v1/analyses/:analysisId/ai → 200 { ai }      body { task, regenerate? }
 *
 * All routes require authentication and only ever expose the caller's own analyses.
 */
function createAnalysesRouter({ analysisService, aiService, authenticate, analysisRateLimiter, aiRateLimiter }) {
  const router = express.Router();
  // Authentication and the rate limit run first, so a rejected upload is never buffered.
  const uploadDocuments = createDocumentUpload({ fields: ['resume', 'job'] });

  router.post(
    '/',
    authenticate,
    analysisRateLimiter,
    uploadDocuments,
    validate({ body: CreateAnalysisBodySchema }),
    asyncHandler(async (req, res) => {
      const input = buildAnalysisInput(req.validated.body, req.files);
      sendSuccess(res, 201, { analysis: await analysisService.create({ userId: req.auth.userId, input }) });
    })
  );

  router.get(
    '/',
    authenticate,
    validate({ query: ListAnalysesQuerySchema }),
    asyncHandler(async (req, res) => {
      sendSuccess(res, 200, await analysisService.list({ userId: req.auth.userId, ...req.validated.query }));
    })
  );

  router.get(
    '/:analysisId',
    authenticate,
    validate({ params: AnalysisParamsSchema }),
    asyncHandler(async (req, res) => {
      const { analysisId } = req.validated.params;
      sendSuccess(res, 200, { analysis: await analysisService.get({ userId: req.auth.userId, analysisId }) });
    })
  );

  router.delete(
    '/:analysisId',
    authenticate,
    validate({ params: AnalysisParamsSchema }),
    asyncHandler(async (req, res) => {
      await analysisService.remove({ userId: req.auth.userId, analysisId: req.validated.params.analysisId });
      res.status(204).end();
    })
  );

  // On-demand AI enrichment of a stored analysis. Always answers 200 with an
  // explicit task status: an unavailable or failing AI provider is not an API
  // error and never affects the analysis itself.
  router.post(
    '/:analysisId/ai',
    authenticate,
    aiRateLimiter,
    validate({ params: AnalysisParamsSchema, body: RunAiTaskBodySchema }),
    asyncHandler(async (req, res) => {
      const { task, regenerate } = req.validated.body;
      const ai = await aiService.runTask({ userId: req.auth.userId, analysisId: req.validated.params.analysisId, task, regenerate });
      sendSuccess(res, 200, { ai });
    })
  );

  return router;
}

module.exports = { createAnalysesRouter };
