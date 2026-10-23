const { z, prefixedId, versionString, nonEmptyText } = require('./primitives');

/**
 * AI enrichment — optional, grounded language generated *from* a completed
 * analysis. It is stored beside the AnalysisResult, never inside it, and never
 * feeds back into parsing, matching, evidence, eligibility, scoring or
 * recommendations.
 *
 * Every output item points at ids that exist in the analysis it was generated
 * from (requirements, evidence, checks, findings, knockouts, recommendations).
 * An AI task can rephrase and explain; it cannot add a requirement, an evidence
 * item or a recommendation.
 */

const AI_TASKS = Object.freeze([
  'resume_explanation', 'job_match_explanation', 'recommendation_wording', 'interview_prep', 'bullet_suggestions',
]);

const text = (max) => nonEmptyText.max(max);
const sourceIds = z.array(z.string().min(1).max(80)).min(1).max(8);
const grounded = z.strictObject({ text: text(400), sourceIds });

const ResumeExplanationSchema = z.strictObject({
  summary: text(700),
  strengths: z.array(grounded).max(6),
  improvements: z.array(z.strictObject({ text: text(400), why: text(300), sourceIds })).max(8),
});

const JobMatchExplanationSchema = z.strictObject({
  summary: text(700),
  matched: z.array(grounded).max(8),
  partial: z.array(grounded).max(8),
  missing: z.array(grounded).max(8),
  insufficientEvidence: z.array(grounded).max(8),
  eligibility: z.array(grounded).max(4),
});

/** Wording only. Priority, category, scope and references stay with the deterministic recommendation. */
const RecommendationWordingSchema = z.strictObject({
  items: z.array(z.strictObject({
    recommendationId: prefixedId('rec'),
    explanation: text(500),
    action: text(500),
    rationale: text(300),
  })).max(15),
});

const InterviewPrepSchema = z.strictObject({
  topics: z.array(z.strictObject({ topic: text(120), why: text(300), sourceIds })).max(8),
  questions: z.array(z.strictObject({
    question: text(400),
    basis: z.discriminatedUnion('type', [
      z.strictObject({ type: z.literal('requirement'), requirementId: prefixedId('req') }),
      z.strictObject({ type: z.literal('resume_evidence'), evidenceId: prefixedId('ev') }),
    ]),
  })).max(15),
});

const BulletSuggestionsSchema = z.strictObject({
  items: z.array(z.strictObject({
    evidenceId: prefixedId('ev'),
    original: text(300),
    suggestion: text(320),
    note: text(240),
  })).max(10),
});

const AI_OUTPUT_SCHEMAS = Object.freeze({
  resume_explanation: ResumeExplanationSchema,
  job_match_explanation: JobMatchExplanationSchema,
  recommendation_wording: RecommendationWordingSchema,
  interview_prep: InterviewPrepSchema,
  bullet_suggestions: BulletSuggestionsSchema,
});

const AiTaskStatusSchema = z.enum(['completed', 'failed', 'unavailable', 'not_applicable']);

/**
 * The outcome of one AI task.
 *   completed      → `output` is the validated, grounded result.
 *   failed         → the model answered but the answer was rejected (or the input was too large).
 *   unavailable    → AI is not configured or the provider could not be reached.
 *   not_applicable → the analysis has no grounded data for this task.
 * `reason` is a machine-readable code whenever the task did not complete.
 */
const AiTaskResultSchema = z
  .strictObject({
    task: z.enum(AI_TASKS),
    status: AiTaskStatusSchema,
    reason: z.string().regex(/^[a-z_]+$/).nullable(),
    provider: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    promptVersion: versionString,
    generatedAt: z.iso.datetime().nullable(),
    output: z.unknown().nullable(),
    /** Items the model produced that were removed because they were not grounded. */
    droppedItems: z.number().int().min(0),
  })
  .check((ctx) => {
    const r = ctx.value;
    const push = (message, path) => ctx.issues.push({ code: 'custom', input: r, message, path });
    if (r.status === 'completed') {
      if (r.reason !== null) push('a completed task has no failure reason', ['reason']);
      if (!r.provider || !r.model || !r.generatedAt) push('a completed task records its provider, model and time', ['provider']);
      const parsed = AI_OUTPUT_SCHEMAS[r.task].safeParse(r.output);
      if (!parsed.success) push(`output does not match the ${r.task} schema`, ['output']);
    } else {
      if (r.reason === null) push(`a ${r.status} task must give a reason`, ['reason']);
      if (r.output !== null) push(`a ${r.status} task has no output`, ['output']);
    }
  });

/** What an analysis exposes about AI: whether it is available, and the completed task results. */
const AiEnrichmentSchema = z.strictObject({
  status: z.enum(['available', 'unavailable']),
  provider: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  results: z.array(AiTaskResultSchema),
});

module.exports = {
  AI_TASKS,
  AI_OUTPUT_SCHEMAS,
  ResumeExplanationSchema,
  JobMatchExplanationSchema,
  RecommendationWordingSchema,
  InterviewPrepSchema,
  BulletSuggestionsSchema,
  AiTaskStatusSchema,
  AiTaskResultSchema,
  AiEnrichmentSchema,
};
