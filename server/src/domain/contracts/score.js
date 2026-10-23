const { z, versionString, unitInterval, confidence, confidenceLabel, nonEmptyText } = require('./primitives');

/**
 * ScoreBreakdown — explainable scoring used by both scores:
 *   - `resume_health`: resume-only quality (format + technical content), always present.
 *   - `job_match`: fit against a job description, present only when a job is supplied.
 *
 * Invariants (validated below):
 *   - Only `evaluated` components carry weight; their effective weights sum to 1.
 *   - Components that do not apply are excluded (never awarded free points).
 *   - score = Σ contributions, and score + Σ deductions.pointsLost = 100.
 *   - score is null only when nothing could be evaluated, and then a reason is required.
 */

const COMPONENT_IDS = Object.freeze({
  resume_health: ['parseability', 'structure', 'technical_content', 'impact', 'completeness'],
  job_match: ['required_skills', 'preferred_skills', 'experience', 'education', 'certifications', 'responsibilities'],
});

const TOLERANCE = 0.15;

const ScoreItemSchema = z.strictObject({
  /** The requirement (job_match) or check/finding (resume_health) this item scores. */
  subjectId: z.string().min(1),
  itemWeight: z.number().positive(),
  credit: unitInterval,
  pointsLost: z.number().min(0).max(100),
});

const ScoreComponentSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z_]+$/),
    status: z.enum(['evaluated', 'not_applicable', 'not_evaluated']),
    statusReason: nonEmptyText,
    baseWeight: unitInterval,
    effectiveWeight: unitInterval,
    rawScore: unitInterval.nullable(),
    contribution: z.number().min(0).max(100),
    maxContribution: z.number().min(0).max(100),
    items: z.array(ScoreItemSchema),
    confidence,
  })
  .check((ctx) => {
    const c = ctx.value;
    const push = (message, path) => ctx.issues.push({ code: 'custom', input: c, message, path });
    if (c.status === 'evaluated') {
      if (c.rawScore === null) push('an evaluated component needs a rawScore', ['rawScore']);
      if (Math.abs(c.maxContribution - c.effectiveWeight * 100) > TOLERANCE) push('maxContribution must equal effectiveWeight × 100', ['maxContribution']);
      if (c.rawScore !== null && Math.abs(c.contribution - c.effectiveWeight * c.rawScore * 100) > TOLERANCE) {
        push('contribution must equal effectiveWeight × rawScore × 100', ['contribution']);
      }
    } else {
      if (c.effectiveWeight !== 0 || c.contribution !== 0 || c.maxContribution !== 0) {
        push(`a ${c.status} component carries no weight or points`, ['effectiveWeight']);
      }
      if (c.rawScore !== null) push(`a ${c.status} component has no rawScore`, ['rawScore']);
      if (c.items.length > 0) push(`a ${c.status} component has no scored items`, ['items']);
    }
  });

const DeductionSchema = z.strictObject({
  componentId: z.string().regex(/^[a-z_]+$/),
  subjectId: z.string().min(1),
  pointsLost: z.number().positive().max(100),
  cause: z.enum(['missing', 'partial', 'weak_evidence', 'implied_only', 'insufficient_evidence', 'failed_check', 'warning_check']),
  message: nonEmptyText,
});

const ScoreBreakdownSchema = z
  .strictObject({
    kind: z.enum(['resume_health', 'job_match']),
    scoringModelVersion: versionString,
    /** 0–100 with one decimal, or null when nothing could be evaluated. */
    score: z.number().min(0).max(100).nullable(),
    scoreReason: z.string().min(1).nullable(),
    confidence: z.strictObject({ label: confidenceLabel, reasons: z.array(nonEmptyText) }),
    components: z.array(ScoreComponentSchema).min(1),
    /** Sorted by pointsLost, descending. */
    deductions: z.array(DeductionSchema),
  })
  .check((ctx) => {
    const s = ctx.value;
    const push = (message, path) => ctx.issues.push({ code: 'custom', input: s, message, path });
    const allowed = COMPONENT_IDS[s.kind];

    const seen = new Set();
    s.components.forEach((c, i) => {
      if (!allowed.includes(c.id)) push(`"${c.id}" is not a ${s.kind} component (allowed: ${allowed.join(', ')})`, ['components', i, 'id']);
      if (seen.has(c.id)) push(`duplicate component ${c.id}`, ['components', i, 'id']);
      seen.add(c.id);
    });

    const evaluated = s.components.filter((c) => c.status === 'evaluated');
    if (s.score === null) {
      if (!s.scoreReason) push('a null score must explain why (scoreReason)', ['scoreReason']);
      if (evaluated.length > 0) push('score cannot be null when components were evaluated', ['score']);
      return;
    }

    if (evaluated.length === 0) push('a numeric score requires at least one evaluated component', ['components']);
    const weightSum = evaluated.reduce((sum, c) => sum + c.effectiveWeight, 0);
    if (evaluated.length > 0 && Math.abs(weightSum - 1) > 0.001) push('effective weights of evaluated components must sum to 1', ['components']);

    const contributionSum = evaluated.reduce((sum, c) => sum + c.contribution, 0);
    if (Math.abs(contributionSum - s.score) > TOLERANCE) push('score must equal the sum of component contributions', ['score']);

    const lost = s.deductions.reduce((sum, d) => sum + d.pointsLost, 0);
    if (Math.abs(s.score + lost - 100) > TOLERANCE) push('score + Σ deductions.pointsLost must equal 100', ['deductions']);

    s.deductions.forEach((d, i) => {
      if (!seen.has(d.componentId)) push(`deduction references unknown component ${d.componentId}`, ['deductions', i, 'componentId']);
      if (i > 0 && d.pointsLost > s.deductions[i - 1].pointsLost) push('deductions must be sorted by pointsLost, descending', ['deductions', i, 'pointsLost']);
    });
  });

module.exports = { COMPONENT_IDS, ScoreItemSchema, ScoreComponentSchema, DeductionSchema, ScoreBreakdownSchema };
