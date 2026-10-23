const { z, prefixedId, confidence, nonEmptyText, DegreeLevelSchema } = require('./primitives');
const { skillId } = require('./resumeProfile');

/**
 * Requirement — one representation for every JD requirement. The shape of
 * `params` is determined by `type` (a discriminated union on `params.kind`,
 * which must equal `type`).
 *
 * Evidence rules (which sections count, how strength applies) are defined once
 * per requirement type by the evaluation layer, never per requirement.
 */

const REQUIREMENT_TYPES = [
  'skill', 'skill_group', 'experience_years', 'education', 'certification',
  'language', 'work_authorization', 'clearance', 'location', 'responsibility',
];

const RequirementTypeSchema = z.enum(REQUIREMENT_TYPES);
const ImportanceSchema = z.enum(['required', 'preferred', 'contextual']);
const WorkModeSchema = z.enum(['onsite', 'hybrid', 'remote', 'unknown']);

const RequirementParamsSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('skill'), skillId }),
  z
    .strictObject({
      kind: z.literal('skill_group'),
      anyOf: z.array(skillId).min(2),
      minCount: z.number().int().min(1),
      label: z.string().min(1).nullable(),
      categoryId: z.string().min(1).nullable(),
    })
    .check((ctx) => {
      if (ctx.value.minCount > ctx.value.anyOf.length) {
        ctx.issues.push({ code: 'custom', input: ctx.value, message: 'minCount cannot exceed anyOf.length', path: ['minCount'] });
      }
    }),
  z
    .strictObject({
      kind: z.literal('experience_years'),
      minYears: z.number().min(0).max(50),
      maxYears: z.number().min(0).max(50).nullable(),
      scope: z.strictObject({
        kind: z.enum(['general', 'skill', 'domain', 'role']),
        skillIds: z.array(skillId),
        text: z.string().min(1).nullable(),
      }),
    })
    .check((ctx) => {
      const { minYears, maxYears, scope } = ctx.value;
      if (maxYears !== null && maxYears < minYears) {
        ctx.issues.push({ code: 'custom', input: ctx.value, message: 'maxYears must be >= minYears', path: ['maxYears'] });
      }
      if (scope.kind === 'skill' && scope.skillIds.length === 0) {
        ctx.issues.push({ code: 'custom', input: ctx.value, message: 'skill-scoped years requirements need at least one skillId', path: ['scope', 'skillIds'] });
      }
    }),
  z.strictObject({
    kind: z.literal('education'),
    minLevel: DegreeLevelSchema,
    fieldIds: z.array(z.string().min(1)),
    relatedFieldsAccepted: z.boolean(),
    equivalentExperienceYears: z.number().min(0).max(50).nullable(),
  }),
  z.strictObject({ kind: z.literal('certification'), anyOf: z.array(z.string().min(1)), rawName: nonEmptyText }),
  z.strictObject({ kind: z.literal('language'), language: nonEmptyText, level: z.string().min(1).nullable() }),
  z.strictObject({ kind: z.literal('work_authorization'), text: nonEmptyText }),
  z.strictObject({ kind: z.literal('clearance'), text: nonEmptyText }),
  z.strictObject({ kind: z.literal('location'), workMode: WorkModeSchema, places: z.array(nonEmptyText) }),
  z.strictObject({ kind: z.literal('responsibility'), text: nonEmptyText }),
]);

const RequirementSchema = z
  .strictObject({
    id: prefixedId('req'),
    type: RequirementTypeSchema,
    canonicalKey: z.string().min(1).max(200),
    displayName: nonEmptyText,
    category: z.string().min(1).nullable(),
    importance: ImportanceSchema,
    importanceReason: nonEmptyText,
    isHardConstraint: z.boolean(),
    params: RequirementParamsSchema,
    sourceStatementIds: z.array(prefixedId('stm')).min(1),
    sourceText: nonEmptyText,
    extractedBy: z.enum(['rules', 'ai', 'user']),
    confidence,
  })
  .check((ctx) => {
    if (ctx.value.params.kind !== ctx.value.type) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value,
        message: `params.kind "${ctx.value.params.kind}" must equal type "${ctx.value.type}"`,
        path: ['params', 'kind'],
      });
    }
  });

module.exports = {
  REQUIREMENT_TYPES,
  RequirementTypeSchema,
  ImportanceSchema,
  WorkModeSchema,
  RequirementParamsSchema,
  RequirementSchema,
};
