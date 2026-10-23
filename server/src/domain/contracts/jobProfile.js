const {
  z, schemaVersion, versionString, prefixedId, confidence, nonEmptyText, TextRefSchema, field, WarningSchema,
} = require('./primitives');
const { RequirementSchema, WorkModeSchema } = require('./requirement');

/**
 * JobProfile — "what the job asks for". Resume-independent structure extracted
 * from a job description. A job is optional for an analysis; when present, this
 * is its canonical representation.
 */

const JobSectionTypeSchema = z.enum([
  'title', 'about_company', 'summary', 'responsibilities', 'requirements', 'preferred',
  'benefits', 'location', 'eeo', 'other',
]);

const StatementSchema = z.strictObject({
  id: prefixedId('stm'),
  section: JobSectionTypeSchema,
  text: nonEmptyText,
  refs: z.array(TextRefSchema).min(1),
});

const JobProfileSchema = z
  .strictObject({
    schemaVersion,
    parserVersion: versionString,
    title: field(nonEmptyText).nullable(),
    company: field(nonEmptyText).nullable(),
    seniority: z.strictObject({
      level: z.enum(['intern', 'entry', 'mid', 'senior', 'staff', 'principal', 'lead', 'manager', 'director', 'unknown']),
      basis: z.enum(['title', 'years', 'text', 'none']),
      confidence,
    }),
    location: z.strictObject({ raw: nonEmptyText, workMode: WorkModeSchema, ref: TextRefSchema }).nullable(),
    employmentType: z.enum(['full_time', 'internship', 'part_time', 'contract', 'unknown']),
    sections: z.array(
      z.strictObject({
        id: prefixedId('sec'),
        type: JobSectionTypeSchema,
        heading: z.string().min(1).nullable(),
        startLine: z.number().int().min(0),
        endLine: z.number().int().min(0),
      })
    ),
    statements: z.array(StatementSchema),
    requirements: z.array(RequirementSchema),
    softSkills: z.array(z.strictObject({ name: nonEmptyText, statementIds: z.array(prefixedId('stm')) })),
    interpretation: z.strictObject({
      rulesVersion: versionString,
      ai: z.strictObject({
        status: z.enum(['not_requested', 'completed', 'failed', 'skipped']),
        model: z.string().min(1).nullable(),
        promptVersion: z.string().min(1).nullable(),
        proposedCount: z.number().int().min(0),
        acceptedCount: z.number().int().min(0),
      }),
    }),
    revision: z.number().int().min(1),
    diagnostics: z.strictObject({
      unclassifiedStatementIds: z.array(prefixedId('stm')),
      warnings: z.array(WarningSchema),
    }),
  })
  .check((ctx) => {
    const job = ctx.value;
    const push = (message, path) => ctx.issues.push({ code: 'custom', input: job, message, path });

    const statementIds = new Set(job.statements.map((s) => s.id));
    const requirementIds = new Set();
    const canonicalKeys = new Set();

    job.requirements.forEach((req, i) => {
      if (requirementIds.has(req.id)) push(`duplicate requirement id ${req.id}`, ['requirements', i, 'id']);
      requirementIds.add(req.id);
      if (canonicalKeys.has(req.canonicalKey)) push(`duplicate canonicalKey ${req.canonicalKey}; requirements must be de-duplicated`, ['requirements', i, 'canonicalKey']);
      canonicalKeys.add(req.canonicalKey);
      req.sourceStatementIds.forEach((sid, j) => {
        if (!statementIds.has(sid)) push(`requirement references unknown statement ${sid}`, ['requirements', i, 'sourceStatementIds', j]);
      });
    });

    job.softSkills.forEach((s, i) => s.statementIds.forEach((sid, j) => {
      if (!statementIds.has(sid)) push(`soft skill references unknown statement ${sid}`, ['softSkills', i, 'statementIds', j]);
    }));

    const ai = job.interpretation.ai;
    if (ai.acceptedCount > ai.proposedCount) push('acceptedCount cannot exceed proposedCount', ['interpretation', 'ai', 'acceptedCount']);
  });

module.exports = { JobSectionTypeSchema, StatementSchema, JobProfileSchema };
