const { z, prefixedId, confidence, nonEmptyText } = require('./primitives');

/**
 * Recommendation — an actionable improvement produced deterministically from
 * findings. `scope: 'resume'` recommendations come from resume health and apply
 * without a job; `scope: 'job'` recommendations exist only when a job is supplied.
 */

const RecommendationSchema = z
  .strictObject({
    id: prefixedId('rec'),
    ruleId: z.string().regex(/^REC-[A-Z0-9-]{2,60}$/),
    scope: z.enum(['resume', 'job']),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.enum([
      'format', 'parseability', 'technical_content', 'content_quality', 'completeness',
      'skills', 'keywords', 'experience', 'education', 'certifications', 'eligibility',
    ]),
    issue: nonEmptyText,
    action: nonEmptyText,
    rationale: nonEmptyText,
    requirementIds: z.array(prefixedId('req')),
    evidenceIds: z.array(prefixedId('ev')),
    findingIds: z.array(z.string().regex(/^(fnd|chk|ko)_[A-Za-z0-9]{1,64}$/)),
    expectedImpact: z.strictObject({
      scoreDelta: z.number().min(0).max(100).nullable(),
      scoreKind: z.enum(['resume_health', 'job_match']).nullable(),
      description: nonEmptyText,
    }),
    /** Set whenever the action suggests adding content, e.g. "Only add this if it is true." */
    integrityNote: z.string().min(1).nullable(),
    confidence,
  })
  .check((ctx) => {
    const r = ctx.value;
    const push = (message, path) => ctx.issues.push({ code: 'custom', input: r, message, path });
    if (r.scope === 'resume' && r.requirementIds.length > 0) push('resume-scope recommendations cannot reference job requirements', ['requirementIds']);
    if (r.scope === 'resume' && r.category === 'eligibility') push('eligibility recommendations are job-scoped', ['category']);
    if ((r.expectedImpact.scoreDelta === null) !== (r.expectedImpact.scoreKind === null)) {
      push('scoreDelta and scoreKind must both be set or both be null', ['expectedImpact', 'scoreKind']);
    }
    if (r.scope === 'resume' && r.expectedImpact.scoreKind === 'job_match') push('resume-scope recommendations cannot claim job-match impact', ['expectedImpact', 'scoreKind']);
  });

module.exports = { RecommendationSchema };
