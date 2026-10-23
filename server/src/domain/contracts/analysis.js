const { z, schemaVersion, versionString, prefixedId, objectIdString, sha256Hex, unitInterval, nonEmptyText } = require('./primitives');
const { EvidenceSchema } = require('./evidence');
const { RequirementSchema } = require('./requirement');
const { RequirementAssessmentSchema } = require('./match');
const { EligibilitySchema } = require('./eligibility');
const { ScoreBreakdownSchema } = require('./score');
const { ResumeHealthReportSchema } = require('./resumeHealth');
const { RecommendationSchema } = require('./recommendation');

/**
 * AnalysisRequest and AnalysisResult.
 *
 * A job description is OPTIONAL. The two modes are explicit:
 *   - resume_only: resume version, no job → resume health + general recommendations.
 *   - job_match:   resume version + job   → resume health + job match + job recommendations.
 * The absence of a job is a valid state, never an error.
 */

const JOB_TEXT_MAX_CHARS = 30000;

const AnalysisRequestSchema = z
  .strictObject({
    resumeVersionId: objectIdString,
    jobId: objectIdString.optional(),
    job: z
      .strictObject({
        text: z.string().trim().min(1).max(JOB_TEXT_MAX_CHARS),
        title: z.string().trim().min(1).max(200).optional(),
        company: z.string().trim().min(1).max(200).optional(),
      })
      .optional(),
  })
  .check((ctx) => {
    if (ctx.value.jobId !== undefined && ctx.value.job !== undefined) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'Provide either jobId or job, not both', path: ['job'] });
    }
  });

/** The analysis mode implied by a validated request. */
function resolveAnalysisMode(request) {
  return request.jobId !== undefined || request.job !== undefined ? 'job_match' : 'resume_only';
}

const EngineInfoSchema = z.strictObject({
  version: versionString,
  parserVersion: versionString,
  taxonomyVersion: versionString,
  scoringModelVersion: versionString,
  recommendationsVersion: versionString,
  /** null in resume_only mode (no job was parsed). */
  jobParserVersion: versionString.nullable(),
});

const DiagnosticsSchema = z.strictObject({
  timingsMs: z.record(z.string(), z.number().min(0)),
  warnings: z.array(nonEmptyText),
});

/**
 * `resumeVersionId` / `jobId` identify a stored resume version or job. They are
 * null when the document was analysed directly without being stored; the text
 * hash then identifies the content.
 */
const ResumeInputSchema = z.strictObject({ resumeVersionId: objectIdString.nullable(), resumeTextHash: sha256Hex });

const JobMatchReportSchema = z.strictObject({
  requirements: z.array(RequirementSchema),
  assessments: z.array(RequirementAssessmentSchema),
  eligibility: EligibilitySchema,
  score: ScoreBreakdownSchema,
  keywordCoverage: z.strictObject({ required: unitInterval.nullable(), preferred: unitInterval.nullable() }),
  projectRelevance: z.array(
    z.strictObject({
      projectId: prefixedId('proj'),
      requirementIds: z.array(prefixedId('req')),
      evidenceIds: z.array(prefixedId('ev')),
      summary: nonEmptyText,
    })
  ),
});

const sharedResultShape = {
  schemaVersion,
  engine: EngineInfoSchema,
  referenceDate: z.iso.date(),
  resume: ResumeInputSchema,
  evidence: z.array(EvidenceSchema),
  resumeHealth: ResumeHealthReportSchema,
  recommendations: z.array(RecommendationSchema),
  diagnostics: DiagnosticsSchema,
};

const ResumeOnlyResultSchema = z.strictObject({
  ...sharedResultShape,
  mode: z.literal('resume_only'),
  job: z.null(),
  jobMatch: z.null(),
});

const JobMatchResultSchema = z.strictObject({
  ...sharedResultShape,
  mode: z.literal('job_match'),
  job: z.strictObject({ jobId: objectIdString.nullable(), jobTextHash: sha256Hex, jobProfileRevision: z.number().int().min(1) }),
  jobMatch: JobMatchReportSchema,
});

const AnalysisResultSchema = z
  .discriminatedUnion('mode', [ResumeOnlyResultSchema, JobMatchResultSchema])
  .check((ctx) => checkReferentialIntegrity(ctx.value, (message, path) =>
    ctx.issues.push({ code: 'custom', input: ctx.value, message, path })));

/** Every id referenced anywhere in the result must exist in the result. */
function checkReferentialIntegrity(result, push) {
  const evidenceIds = new Set();
  result.evidence.forEach((e, i) => {
    if (evidenceIds.has(e.id)) push(`duplicate evidence id ${e.id}`, ['evidence', i, 'id']);
    evidenceIds.add(e.id);
  });
  const requireEvidence = (ids, path) => ids.forEach((id, j) => {
    if (!evidenceIds.has(id)) push(`unknown evidence id ${id}`, [...path, j]);
  });

  const healthIds = new Set([
    ...result.resumeHealth.checks.map((c) => c.id),
    ...result.resumeHealth.findings.map((f) => f.id),
  ]);
  result.resumeHealth.findings.forEach((f, i) => requireEvidence(f.evidenceIds, ['resumeHealth', 'findings', i, 'evidenceIds']));

  const isJob = result.mode === 'job_match';
  if (isJob !== (result.engine.jobParserVersion !== null)) {
    push('engine.jobParserVersion must be set exactly when a job was analyzed', ['engine', 'jobParserVersion']);
  }

  const requirementIds = new Set();
  const knockoutIds = new Set();
  if (isJob) {
    const { requirements, assessments, eligibility, score, projectRelevance } = result.jobMatch;
    requirements.forEach((r, i) => {
      if (requirementIds.has(r.id)) push(`duplicate requirement id ${r.id}`, ['jobMatch', 'requirements', i, 'id']);
      requirementIds.add(r.id);
    });

    const assessed = new Map();
    assessments.forEach((a, i) => {
      const path = ['jobMatch', 'assessments', i];
      if (!requirementIds.has(a.requirementId)) push(`assessment for unknown requirement ${a.requirementId}`, [...path, 'requirementId']);
      if (assessed.has(a.requirementId)) push(`requirement ${a.requirementId} assessed more than once`, [...path, 'requirementId']);
      assessed.set(a.requirementId, true);
      if (a.best) requireEvidence(a.best.evidenceIds, [...path, 'best', 'evidenceIds']);
      a.alternatives.forEach((m, k) => requireEvidence(m.evidenceIds, [...path, 'alternatives', k, 'evidenceIds']));
    });
    requirements.forEach((r, i) => {
      if (!assessed.has(r.id)) push(`requirement ${r.id} has no assessment`, ['jobMatch', 'requirements', i, 'id']);
    });

    eligibility.findings.forEach((f, i) => {
      knockoutIds.add(f.id);
      if (!requirementIds.has(f.requirementId)) push(`knockout references unknown requirement ${f.requirementId}`, ['jobMatch', 'eligibility', 'findings', i, 'requirementId']);
      requireEvidence(f.evidenceIds, ['jobMatch', 'eligibility', 'findings', i, 'evidenceIds']);
    });

    if (score.kind !== 'job_match') push('the job match score must have kind "job_match"', ['jobMatch', 'score', 'kind']);
    score.components.forEach((c, i) => c.items.forEach((item, j) => {
      if (!requirementIds.has(item.subjectId)) push(`score item references unknown requirement ${item.subjectId}`, ['jobMatch', 'score', 'components', i, 'items', j, 'subjectId']);
    }));

    projectRelevance.forEach((p, i) => {
      p.requirementIds.forEach((id, j) => {
        if (!requirementIds.has(id)) push(`unknown requirement id ${id}`, ['jobMatch', 'projectRelevance', i, 'requirementIds', j]);
      });
      requireEvidence(p.evidenceIds, ['jobMatch', 'projectRelevance', i, 'evidenceIds']);
    });
  }

  result.recommendations.forEach((r, i) => {
    const path = ['recommendations', i];
    if (!isJob && r.scope === 'job') push('job-scoped recommendations require a job (mode "job_match")', [...path, 'scope']);
    r.requirementIds.forEach((id, j) => {
      if (!requirementIds.has(id)) push(`unknown requirement id ${id}`, [...path, 'requirementIds', j]);
    });
    requireEvidence(r.evidenceIds, [...path, 'evidenceIds']);
    r.findingIds.forEach((id, j) => {
      if (!healthIds.has(id) && !knockoutIds.has(id)) push(`unknown finding id ${id}`, [...path, 'findingIds', j]);
    });
  });
}

module.exports = {
  JOB_TEXT_MAX_CHARS,
  AnalysisRequestSchema,
  resolveAnalysisMode,
  EngineInfoSchema,
  JobMatchReportSchema,
  ResumeOnlyResultSchema,
  JobMatchResultSchema,
  AnalysisResultSchema,
};
