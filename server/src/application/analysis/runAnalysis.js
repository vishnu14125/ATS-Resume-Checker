const { performance } = require('perf_hooks');
const { AppError } = require('../../shared/errors');
const { parseContract } = require('../../domain/contracts');
const { AnalysisResultSchema, JOB_TEXT_MAX_CHARS } = require('../../domain/contracts/analysis');
const { ingestFile, ingestPastedText } = require('../../documents/ingest');
const { parseResume } = require('../../engine/resume/parseResume');
const { parseJob } = require('../../engine/job/parseJob');
const { matchRequirements } = require('../../engine/matching/matchRequirements');
const { evaluateEligibility } = require('../../engine/evaluation/evaluate');
const { assessResumeHealth } = require('../../engine/scoring/resumeHealth');
const { scoreJobMatch } = require('../../engine/scoring/jobMatch');
const { buildRecommendations } = require('../../engine/recommendations/recommend');
const { TAXONOMY_VERSION } = require('../../engine/taxonomy/version');
const { ENGINE_VERSION } = require('../../engine/version');

/**
 * The canonical analysis workflow: documents in, one validated AnalysisResult out.
 *
 *   resume ─► ingest ─► ResumeProfile ─────────────────────────► Resume Health ─┐
 *   job?   ─► ingest ─► JobProfile ─► match ─► evidence/eligibility ─► Job Match ─┼─► recommendations ─► AnalysisResult
 *
 * This module only coordinates: every analytical decision is made by the Phase
 * 2–7 engine modules. It has no database, HTTP or AI dependency, parses each
 * document exactly once, and passes input text to ingestion untouched.
 *
 * A job is optional. Without one the result is `resume_only`: no JobProfile, no
 * Job Match Score and no job-scoped recommendations are produced.
 */

const RESUME_TEXT_MAX_CHARS = 100000;
const DOCUMENT_NAMES = { resume: 'resume', job: 'job description' };
const MAX_CHARS = { resume: RESUME_TEXT_MAX_CHARS, job: JOB_TEXT_MAX_CHARS };

const DEFAULT_PIPELINE = Object.freeze({
  ingestFile, ingestPastedText, parseResume, parseJob, matchRequirements,
  evaluateEligibility, assessResumeHealth, scoreJobMatch, buildRecommendations,
});

/** A document source is either `{ file: { buffer, filename } }` or `{ text }`. */
const isFile = (source) => Boolean(source && source.file);

function tooLarge(label) {
  return new AppError('PAYLOAD_TOO_LARGE', {
    message: `The ${DOCUMENT_NAMES[label]} is too long (limit: ${MAX_CHARS[label].toLocaleString('en-US')} characters).`,
    details: { document: label },
  });
}

/** Display name only: no path, no control characters, bounded length. */
function displayName(filename) {
  const name = String(filename || '').replace(/[\u0000-\u001f]/g, '').split(/[\\/]/).pop().trim().slice(0, 200);
  return name || null;
}

/**
 * @param {{ pipeline?: object, now?: () => Date, elapsedMs?: () => number }} [deps]
 *   `pipeline` replaces individual stages (tests); `now` supplies the reference date.
 */
function createAnalysisRunner({ pipeline = DEFAULT_PIPELINE, now = () => new Date(), elapsedMs = () => performance.now() } = {}) {
  const stages = { ...DEFAULT_PIPELINE, ...pipeline };

  async function ingest(source, label) {
    if (!isFile(source)) {
      if (typeof source.text !== 'string' || !source.text.trim()) {
        throw new AppError('UNPROCESSABLE_DOCUMENT', { message: `No ${DOCUMENT_NAMES[label]} text was provided.`, details: { reason: 'no_text_layer', document: label } });
      }
      if (source.text.length > MAX_CHARS[label]) throw tooLarge(label);
    }
    let document;
    try {
      document = isFile(source)
        ? await stages.ingestFile(source.file.buffer, { filename: source.file.filename })
        : await stages.ingestPastedText(source.text);
    } catch (err) {
      // Say which of the two documents was rejected; the code and message are kept.
      if (err instanceof AppError) {
        throw new AppError(err.code, { message: err.message, details: { ...(err.details || {}), document: label }, cause: err.cause });
      }
      throw err;
    }
    if (document.stats.charCount > MAX_CHARS[label]) throw tooLarge(label);
    return document;
  }

  /**
   * @param {{ resume: object, job?: object|null }} input  document sources
   * @returns {Promise<{ result: object, record: object }>} the validated AnalysisResult and
   *   the metadata stored beside it (mode, document descriptors, summary, versions)
   */
  return async function runAnalysis({ resume, job = null }) {
    const timingsMs = {};
    const startedAt = elapsedMs();
    const timed = async (name, fn) => {
      const start = elapsedMs();
      try { return await fn(); } finally { timingsMs[name] = Math.max(0, Math.round((elapsedMs() - start) * 100) / 100); }
    };

    // The reference date is a calendar day (UTC), recorded in the result, so the
    // same inputs on the same day always produce the same analysis.
    const today = now();
    const referenceDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    const resumeDocument = await timed('ingestResume', () => ingest(resume, 'resume'));
    const jobDocument = job ? await timed('ingestJob', () => ingest(job, 'job')) : null;

    const resumeProfile = await timed('parseResume', () => stages.parseResume(resumeDocument, { referenceDate }));
    const resumeHealth = await timed('resumeHealth', () => stages.assessResumeHealth({ normalizedDocument: resumeDocument, resumeProfile }));

    let jobProfile = null;
    let jobMatch = null;
    let evidence = [];
    let gate = null;
    const versions = { matcher: null, evaluator: null };

    if (jobDocument) {
      jobProfile = await timed('parseJob', () => stages.parseJob(jobDocument));
      const matched = await timed('match', () => stages.matchRequirements(resumeProfile, jobProfile));
      const evaluated = await timed('evaluate', () => stages.evaluateEligibility({
        normalizedDocument: resumeDocument, resumeProfile, jobProfile, assessments: matched.assessments, referenceDate,
      }));
      const scored = await timed('jobMatch', () => stages.scoreJobMatch({ jobProfile, assessments: evaluated.assessments, eligibility: evaluated.eligibility }));

      evidence = evaluated.evidence;
      gate = scored.gate;
      versions.matcher = matched.matcherVersion;
      versions.evaluator = evaluated.evaluatorVersion;
      jobMatch = {
        requirements: jobProfile.requirements,
        assessments: evaluated.assessments,
        eligibility: evaluated.eligibility,
        score: scored.score,
        keywordCoverage: scored.keywordCoverage,
        projectRelevance: [],
      };
    }

    const { recommendations, recommendationsVersion } = await timed('recommendations', () => stages.buildRecommendations({ resumeHealth, jobMatch, evidence }));
    timingsMs.total = Math.max(0, Math.round((elapsedMs() - startedAt) * 100) / 100);

    const warnings = [...new Set([
      ...resumeDocument.warnings.map((w) => w.message),
      ...resumeProfile.diagnostics.warnings.map((w) => w.message),
      ...(jobDocument ? jobDocument.warnings.map((w) => w.message) : []),
      ...(jobProfile ? jobProfile.diagnostics.warnings.map((w) => w.message) : []),
    ])];

    const result = parseContract(AnalysisResultSchema, {
      schemaVersion: '1',
      mode: jobMatch ? 'job_match' : 'resume_only',
      engine: {
        version: ENGINE_VERSION,
        parserVersion: resumeProfile.parserVersion,
        taxonomyVersion: TAXONOMY_VERSION,
        scoringModelVersion: resumeHealth.version,
        recommendationsVersion,
        jobParserVersion: jobProfile ? jobProfile.parserVersion : null,
      },
      referenceDate: referenceDate.toISOString().slice(0, 10),
      resume: { resumeVersionId: null, resumeTextHash: resumeDocument.textHash },
      job: jobMatch ? { jobId: null, jobTextHash: jobDocument.textHash, jobProfileRevision: jobProfile.revision } : null,
      jobMatch,
      evidence,
      resumeHealth,
      recommendations,
      diagnostics: { timingsMs, warnings },
    }, 'AnalysisResult');

    const describe = (source, document) => ({
      kind: document.source.kind,
      fileName: isFile(source) ? displayName(source.file.filename) : null,
      sizeBytes: isFile(source) ? source.file.buffer.length : null,
      textHash: document.textHash,
    });
    const countPriority = (priority) => result.recommendations.filter((r) => r.priority === priority).length;

    return {
      result,
      record: {
        mode: result.mode,
        resume: describe(resume, resumeDocument),
        job: jobMatch ? {
          ...describe(job, jobDocument),
          title: jobProfile.title ? jobProfile.title.value : null,
          company: jobProfile.company ? jobProfile.company.value : null,
        } : null,
        summary: {
          resumeHealth: { score: result.resumeHealth.score.score, readability: result.resumeHealth.readability },
          // Score and eligibility answer different questions and are stored side by side;
          // a knockout never changes the score.
          jobMatch: jobMatch ? { score: jobMatch.score.score, eligibility: gate.eligibilityStatus, hardKnockout: gate.hardKnockout } : null,
          recommendations: { total: result.recommendations.length, critical: countPriority('critical'), high: countPriority('high') },
        },
        versions: {
          schema: result.schemaVersion,
          engine: result.engine.version,
          parser: result.engine.parserVersion,
          jobParser: result.engine.jobParserVersion,
          taxonomy: result.engine.taxonomyVersion,
          matcher: versions.matcher,
          evaluator: versions.evaluator,
          scoringModel: result.engine.scoringModelVersion,
          recommendations: result.engine.recommendationsVersion,
        },
      },
    };
  };
}

module.exports = { createAnalysisRunner, RESUME_TEXT_MAX_CHARS, DEFAULT_PIPELINE };
