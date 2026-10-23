const { z, prefixedId, entryId, nonEmptyText, TextRefSchema, DateRangeSchema, SectionTypeSchema } = require('./primitives');
const { skillId } = require('./resumeProfile');

/**
 * Evidence — an addressable piece of the resume (bullet, entry header, tech-stack
 * line, skills-list line, summary, certification or education line). Nothing
 * counts as evidence unless it points at real lines and quotes them verbatim.
 */

const EvidenceStrengthSchema = z.enum(['strong', 'moderate', 'weak']);

const EvidenceSchema = z.strictObject({
  id: prefixedId('ev'),
  kind: z.enum(['bullet', 'entry_header', 'tech_stack', 'skills_list', 'summary', 'certification', 'education']),
  section: SectionTypeSchema,
  entryId: entryId.nullable(),
  refs: z.array(TextRefSchema).min(1),
  /** Verbatim original text, at most 300 characters. */
  snippet: nonEmptyText.max(300),
  skillIds: z.array(skillId),
  dates: DateRangeSchema.nullable(),
  strength: EvidenceStrengthSchema,
  strengthFactors: z.array(
    z.enum([
      'applied_in_role', 'applied_in_project', 'quantified_outcome', 'recent', 'dated',
      'declared_stack', 'listed_only', 'credential', 'summary_claim',
    ])
  ),
});

module.exports = { EvidenceStrengthSchema, EvidenceSchema };
