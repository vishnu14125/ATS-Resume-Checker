const { z, versionString, prefixedId, nonEmptyText, TextRefSchema } = require('./primitives');
const { ScoreBreakdownSchema } = require('./score');

/**
 * ResumeHealthReport — the job-independent assessment of a resume: can ATS
 * software read it (parseability checks) and is the content strong (findings).
 * Always present in an analysis, with or without a job description.
 */

const PARSEABILITY_CHECK_IDS = [
  'text_layer', 'reading_order', 'standard_headings', 'contact_email', 'contact_phone', 'dated_roles',
  'entry_structure', 'encoding', 'icon_glyphs', 'header_footer_content', 'length', 'embedded_instructions',
];

const ParseabilityCheckSchema = z.strictObject({
  id: prefixedId('chk'),
  checkId: z.enum(PARSEABILITY_CHECK_IDS),
  result: z.enum(['pass', 'warn', 'fail', 'not_applicable']),
  evidence: nonEmptyText,
  fix: z.string().min(1).nullable(),
  refs: z.array(TextRefSchema),
});

const ContentFindingSchema = z.strictObject({
  id: prefixedId('fnd'),
  ruleId: z.string().regex(/^[A-Z][A-Z0-9-]{1,63}$/),
  area: z.enum(['format', 'technical_content', 'impact', 'completeness', 'language']),
  severity: z.enum(['high', 'medium', 'low']),
  message: nonEmptyText,
  suggestion: nonEmptyText,
  refs: z.array(TextRefSchema),
  evidenceIds: z.array(prefixedId('ev')),
});

const ResumeHealthReportSchema = z
  .strictObject({
    version: versionString,
    sourceKind: z.enum(['pdf', 'docx', 'txt', 'paste']),
    readability: z.enum(['good', 'fair', 'poor', 'unreadable']),
    checks: z.array(ParseabilityCheckSchema),
    findings: z.array(ContentFindingSchema),
    score: ScoreBreakdownSchema,
    limitations: z.array(nonEmptyText),
  })
  .check((ctx) => {
    const r = ctx.value;
    if (r.score.kind !== 'resume_health') {
      ctx.issues.push({ code: 'custom', input: r, message: 'resume health must use a resume_health score', path: ['score', 'kind'] });
    }
    if (r.readability === 'unreadable' && r.score.score !== null) {
      ctx.issues.push({ code: 'custom', input: r, message: 'an unreadable resume cannot have a numeric health score', path: ['score', 'score'] });
    }
    const checkIds = new Set();
    r.checks.forEach((c, i) => {
      if (checkIds.has(c.checkId)) ctx.issues.push({ code: 'custom', input: r, message: `check ${c.checkId} reported twice`, path: ['checks', i, 'checkId'] });
      checkIds.add(c.checkId);
    });
  });

module.exports = { PARSEABILITY_CHECK_IDS, ParseabilityCheckSchema, ContentFindingSchema, ResumeHealthReportSchema };
