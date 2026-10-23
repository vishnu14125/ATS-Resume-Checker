const { z, prefixedId, confidence, nonEmptyText } = require('./primitives');

/**
 * Eligibility — explicit hard constraints in a job (years, degree, certification,
 * clearance, authorization, location, language, must-have technology) evaluated
 * separately from the match score. `unknown` means the resume does not say; it is
 * never treated as a failure.
 */

const KnockoutFindingSchema = z.strictObject({
  id: prefixedId('ko'),
  requirementId: prefixedId('req'),
  kind: z.enum([
    'years_experience', 'degree', 'certification', 'clearance',
    'work_authorization', 'location', 'language', 'required_technology',
  ]),
  severity: z.enum(['critical', 'high']),
  outcome: z.enum(['passed', 'failed', 'at_risk', 'unknown']),
  evidenceIds: z.array(prefixedId('ev')),
  explanation: nonEmptyText,
  confidence,
});

const EligibilityStatusSchema = z.enum(['clear', 'review', 'likely_filtered']);

/** Derives the eligibility status from knockout findings (single source of the rule). */
function deriveEligibilityStatus(findings) {
  const isFailedCritical = (f) => f.severity === 'critical' && f.outcome === 'failed' && f.confidence >= 0.6;
  if (findings.some(isFailedCritical)) return 'likely_filtered';
  const needsReview = findings.some(
    (f) => f.outcome === 'at_risk' || f.outcome === 'failed' || (f.severity === 'critical' && f.outcome === 'unknown')
  );
  return needsReview ? 'review' : 'clear';
}

const EligibilitySchema = z
  .strictObject({
    status: EligibilityStatusSchema,
    reasons: z.array(nonEmptyText),
    findings: z.array(KnockoutFindingSchema),
  })
  .check((ctx) => {
    const { status, findings, reasons } = ctx.value;
    const expected = deriveEligibilityStatus(findings);
    if (status !== expected) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: `status must be "${expected}" for these findings`, path: ['status'] });
    }
    if (status !== 'clear' && reasons.length === 0) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'a non-clear eligibility status must explain its reasons', path: ['reasons'] });
    }
    const ids = new Set();
    findings.forEach((f, i) => {
      if (ids.has(f.id)) ctx.issues.push({ code: 'custom', input: ctx.value, message: `duplicate finding id ${f.id}`, path: ['findings', i, 'id'] });
      ids.add(f.id);
    });
  });

module.exports = { KnockoutFindingSchema, EligibilityStatusSchema, EligibilitySchema, deriveEligibilityStatus };
