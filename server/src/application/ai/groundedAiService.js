const { AppError } = require('../../shared/errors');
const { AiTaskResultSchema, AI_TASKS } = require('../../domain/contracts/ai');
const { AiProviderError } = require('./aiProvider');
const { TASKS, UngroundedOutputError } = require('./tasks');
const { userMessageFor } = require('./prompts');

const DEFAULT_LIMITS = Object.freeze({ maxInputChars: 24000, maxOutputTokens: 4096, maxOutputChars: 60000 });

const PROVIDER_REASONS = {
  timeout: 'provider_timeout',
  rate_limited: 'provider_rate_limited',
  auth: 'provider_auth_failed',
  rejected: 'provider_rejected_request',
  empty: 'provider_empty_response',
  unavailable: 'provider_unavailable',
};

/** Accepts a JSON object, optionally inside a single ```json fence. Nothing else is parsed. */
function parseModelJson(raw, maxChars) {
  if (typeof raw !== 'string' || raw.length > maxChars) return null;
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  try {
    const value = JSON.parse(fenced ? fenced[1] : trimmed);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Grounded AI enrichment for a stored analysis.
 *
 * AI is an optional edge service that runs strictly after the deterministic
 * analysis and only reads it. This service never touches scores, assessments,
 * eligibility or recommendations, and every failure mode ends in an explicit
 * task status rather than an error: the analysis itself is unaffected.
 *
 * One task = at most one model request (plus the provider's bounded retry).
 * A completed result is stored and reused; it is regenerated only on request.
 *
 * @param {object} deps
 * @param {import('./aiProvider').AiProvider|null} deps.provider  null when AI is not configured
 * @param {object} deps.analysisRepository
 * @param {object} [deps.logger]
 * @param {() => Date} [deps.now]
 * @param {Partial<typeof DEFAULT_LIMITS>} [deps.limits]
 */
function createGroundedAiService({ provider, analysisRepository, logger = null, now = () => new Date(), limits = {} }) {
  const { maxInputChars, maxOutputTokens, maxOutputChars } = { ...DEFAULT_LIMITS, ...limits };

  /** Whether AI is available, and through which provider/model. Never includes credentials. */
  const describe = () => (provider
    ? { status: 'available', provider: provider.name, model: provider.model }
    : { status: 'unavailable', provider: null, model: null });

  const outcome = (task, status, fields = {}) => AiTaskResultSchema.parse({
    task,
    status,
    reason: null,
    provider: provider ? provider.name : null,
    model: provider ? provider.model : null,
    promptVersion: TASKS[task].promptVersion,
    generatedAt: null,
    output: null,
    droppedItems: 0,
    ...fields,
  });

  async function generate(task, analysisResult) {
    const definition = TASKS[task];
    const context = definition.buildContext(analysisResult);
    if (context.notApplicable) return outcome(task, 'not_applicable', { reason: context.notApplicable });

    const user = userMessageFor(context.input);
    if (user.length > maxInputChars) return outcome(task, 'failed', { reason: 'input_too_large' });

    let raw;
    try {
      raw = await provider.generateJson({ system: definition.system, user, schemaName: task, jsonSchema: definition.jsonSchema, maxOutputTokens });
    } catch (err) {
      const reason = err instanceof AiProviderError ? PROVIDER_REASONS[err.kind] || 'provider_error' : 'provider_error';
      return outcome(task, 'unavailable', { reason });
    }

    const json = parseModelJson(raw, maxOutputChars);
    const shaped = json && definition.modelSchema.safeParse(json);
    if (!shaped || !shaped.success) return outcome(task, 'failed', { reason: 'invalid_output' });

    let grounded;
    try {
      grounded = definition.ground(shaped.data, context);
    } catch (err) {
      if (err instanceof UngroundedOutputError) return outcome(task, 'failed', { reason: 'ungrounded_output', droppedItems: err.dropped });
      throw err;
    }

    const completed = AiTaskResultSchema.safeParse({
      task,
      status: 'completed',
      reason: null,
      provider: provider.name,
      model: provider.model,
      promptVersion: definition.promptVersion,
      generatedAt: now().toISOString(),
      output: grounded.output,
      droppedItems: grounded.dropped,
    });
    return completed.success ? completed.data : outcome(task, 'failed', { reason: 'invalid_output' });
  }

  return {
    describe,

    /**
     * Runs (or returns the stored result of) one AI task for the caller's analysis.
     * @returns {Promise<object>} an AiTaskResult; only `completed` results are stored
     */
    async runTask({ userId, analysisId, task, regenerate = false }) {
      if (!AI_TASKS.includes(task)) throw new AppError('VALIDATION_ERROR', { message: 'Unknown AI task.' });
      const analysis = await analysisRepository.findOwned({ userId, id: analysisId });
      if (!analysis) throw new AppError('NOT_FOUND', { message: 'Analysis not found.' });

      if (!provider) return outcome(task, 'unavailable', { reason: 'not_configured' });

      const stored = analysis.ai ? analysis.ai[task] : null;
      if (stored && stored.status === 'completed' && !regenerate) return stored; // no model call

      const startedAt = Date.now();
      const result = await generate(task, analysis.result);
      if (logger) {
        logger.info('ai.task', {
          task, status: result.status, reason: result.reason, provider: provider.name, model: provider.model,
          droppedItems: result.droppedItems, durationMs: Date.now() - startedAt,
        });
      }
      if (result.status === 'completed') await analysisRepository.saveAiResult({ userId, id: analysisId, result });
      return result;
    },
  };
}

module.exports = { createGroundedAiService, parseModelJson, DEFAULT_LIMITS };
