const { AppError } = require('../../shared/errors');
const { AI_TASKS } = require('../../domain/contracts/ai');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const iso = (date) => (date instanceof Date ? date.toISOString() : null);

/** List representation: everything needed for a history row, without the full result. */
function toAnalysisSummary(doc) {
  return {
    id: String(doc._id),
    createdAt: iso(doc.createdAt),
    mode: doc.mode,
    resume: doc.resume,
    job: doc.job,
    summary: doc.summary,
    versions: doc.versions,
  };
}

const AI_UNAVAILABLE = Object.freeze({ status: 'unavailable', provider: null, model: null });

/**
 * Public representation of a stored analysis. Never includes the owner id or
 * database internals. `ai` reports whether AI enrichment is available and the
 * task results generated so far; it is separate from the deterministic `result`.
 */
function toAnalysisView(doc, aiInfo = AI_UNAVAILABLE) {
  const stored = doc.ai || {};
  return {
    ...toAnalysisSummary(doc),
    result: doc.result,
    ai: { ...aiInfo, results: AI_TASKS.map((task) => stored[task]).filter(Boolean) },
  };
}

/**
 * Analysis use cases: run and store an analysis, read one back, list history.
 * Every read is scoped to the calling user by the repository. Running an
 * analysis never calls AI; AI enrichment is requested separately afterwards.
 *
 * @param {{ runAnalysis: Function, analysisRepository: object, describeAi?: () => object }} deps
 */
function createAnalysisService({ runAnalysis, analysisRepository, describeAi = () => AI_UNAVAILABLE }) {
  return {
    /** Runs one analysis pass and persists the result. Nothing is stored if the analysis fails. */
    async create({ userId, input }) {
      const { result, record } = await runAnalysis(input);
      const saved = await analysisRepository.create({ userId, ...record, result });
      return toAnalysisView({ ...record, result, _id: saved._id, createdAt: saved.createdAt }, describeAi());
    },

    /** A missing analysis and another user's analysis are indistinguishable: both are NOT_FOUND. */
    async get({ userId, analysisId }) {
      const doc = await analysisRepository.findOwned({ userId, id: analysisId });
      if (!doc) throw new AppError('NOT_FOUND', { message: 'Analysis not found.' });
      return toAnalysisView(doc, describeAi());
    },

    /** Newest first, cursor-paginated. Loads summaries only, never full results. */
    async list({ userId, limit = DEFAULT_PAGE_SIZE, cursor = null }) {
      const size = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
      const docs = await analysisRepository.listOwned({ userId, limit: size + 1, cursor });
      const page = docs.slice(0, size);
      return {
        items: page.map(toAnalysisSummary),
        nextCursor: docs.length > size ? String(page[page.length - 1]._id) : null,
      };
    },

    /** Permanently deletes the caller's analysis; NOT_FOUND if it is missing or not theirs. */
    async remove({ userId, analysisId }) {
      const deleted = await analysisRepository.deleteOwned({ userId, id: analysisId });
      if (!deleted) throw new AppError('NOT_FOUND', { message: 'Analysis not found.' });
    },
  };
}

module.exports = { createAnalysisService, toAnalysisView, toAnalysisSummary, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
