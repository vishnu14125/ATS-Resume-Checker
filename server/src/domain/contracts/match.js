const { z, prefixedId, confidence, unitInterval, nonEmptyText, entryId, DurationRangeSchema } = require('./primitives');
const { skillId } = require('./resumeProfile');
const { EvidenceStrengthSchema } = require('./evidence');

/**
 * MatchResult — one way a requirement relates to resume evidence.
 * RequirementAssessment — the single verdict for a requirement (best match,
 * alternatives, status and the credit that scoring reads).
 */

const MatchMethodSchema = z.enum(['exact', 'normalized', 'alias', 'implied', 'category', 'semantic']);

const MatchResultSchema = z
  .strictObject({
    method: MatchMethodSchema,
    matchedSkillId: skillId.nullable(),
    relation: z
      .strictObject({
        type: z.enum(['implies', 'is_a']),
        from: skillId,
        to: z.string().min(1),
        weight: unitInterval,
      })
      .nullable(),
    semantic: z
      .strictObject({
        model: z.string().min(1),
        similarity: z.number().min(-1).max(1),
        threshold: z.number().min(-1).max(1),
        band: z.enum(['strong', 'moderate']),
        calibrationId: z.string().min(1),
      })
      .nullable(),
    evidenceIds: z.array(prefixedId('ev')).min(1),
    strength: EvidenceStrengthSchema,
    methodFactor: unitInterval,
    strengthFactor: unitInterval,
    confidence,
    explanation: nonEmptyText,
  })
  .check((ctx) => {
    const m = ctx.value;
    const push = (message, path) => ctx.issues.push({ code: 'custom', input: m, message, path });
    if ((m.method === 'implied' || m.method === 'category') && m.relation === null) {
      push(`${m.method} matches must describe the taxonomy relation used`, ['relation']);
    }
    if (m.method !== 'implied' && m.method !== 'category' && m.relation !== null) {
      push('relation is only allowed for implied or category matches', ['relation']);
    }
    if (m.method === 'semantic' && m.semantic === null) push('semantic matches must include similarity details', ['semantic']);
    if (m.method !== 'semantic' && m.semantic !== null) push('semantic details are only allowed for semantic matches', ['semantic']);
  });

const RequirementStatusSchema = z.enum(['met', 'partially_met', 'missing', 'insufficient_evidence', 'not_evaluated']);

const AssessmentDetailsSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('years'),
    requiredMonths: z.number().min(0),
    demonstrated: DurationRangeSchema,
    contributingEntryIds: z.array(entryId),
    basis: z.enum(['total_experience', 'skill_attributed']),
  }),
  z.strictObject({
    kind: z.literal('education'),
    bestEntryId: prefixedId('edu').nullable(),
    levelMet: z.boolean(),
    fieldMatch: z.enum(['exact', 'related', 'unknown', 'none']),
    viaEquivalentExperience: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('certification'),
    entryId: prefixedId('cert').nullable(),
    certStatus: z.enum(['active', 'in_progress', 'expired', 'unknown']).nullable(),
  }),
  z.strictObject({ kind: z.literal('none') }),
]);

const RequirementAssessmentSchema = z
  .strictObject({
    requirementId: prefixedId('req'),
    status: RequirementStatusSchema,
    statusReason: nonEmptyText,
    /** 0..1 — the only number scoring reads from an assessment. */
    credit: unitInterval,
    best: MatchResultSchema.nullable(),
    alternatives: z.array(MatchResultSchema).max(10),
    details: AssessmentDetailsSchema,
    confidence,
  })
  .check((ctx) => {
    const a = ctx.value;
    const push = (message, path) => ctx.issues.push({ code: 'custom', input: a, message, path });
    if ((a.status === 'met' || a.status === 'partially_met') && a.best === null) {
      push(`a "${a.status}" assessment must reference its best match`, ['best']);
    }
    if ((a.status === 'missing' || a.status === 'insufficient_evidence' || a.status === 'not_evaluated') && a.credit !== 0) {
      push(`a "${a.status}" assessment must have credit 0`, ['credit']);
    }
    if (a.status === 'not_evaluated' && a.best !== null) push('a not_evaluated assessment cannot have a match', ['best']);
  });

module.exports = {
  MatchMethodSchema,
  MatchResultSchema,
  RequirementStatusSchema,
  AssessmentDetailsSchema,
  RequirementAssessmentSchema,
};
