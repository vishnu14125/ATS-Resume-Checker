const { buildBreakdown } = require('./breakdown');
const {
  SCORING_MODEL_VERSION, COMPONENT_FOR_TYPE, TYPE_WEIGHT, IMPORTANCE_WEIGHT,
  EVIDENCE_STRENGTH_FACTOR, INSUFFICIENT_EVIDENCE_CREDIT, round,
} = require('./model');

/**
 * Job Match Score — "how strongly does the available resume evidence match the
 * explicit requirements of this job?". Requirement-driven: every scored
 * requirement is exactly one item in exactly one component, weighted by its type
 * and importance, and credited from its Phase 4/5 assessment. Pure: no DB,
 * network, clock or LLM. It is never computed without a job.
 */

const COMPONENTS = [
  { id: 'required_skills', label: 'required skill' },
  { id: 'preferred_skills', label: 'preferred or contextual skill' },
  { id: 'experience', label: 'experience' },
  { id: 'education', label: 'education' },
  { id: 'certifications', label: 'certification' },
  { id: 'responsibilities', label: 'responsibility' },
];

const isSkillType = (type) => type === 'skill' || type === 'skill_group';

function componentFor(requirement) {
  if (isSkillType(requirement.type)) return requirement.importance === 'required' ? 'required_skills' : 'preferred_skills';
  return COMPONENT_FOR_TYPE[requirement.type] ?? null;
}

/** Credit, deduction cause and message for one assessed requirement. */
function creditFor(requirement, assessment) {
  const name = requirement.displayName;
  const skill = isSkillType(requirement.type);

  if (assessment.status === 'met' || assessment.status === 'partially_met') {
    const strength = skill ? EVIDENCE_STRENGTH_FACTOR[assessment.best.strength] : 1;
    const credit = assessment.credit * strength;
    if (assessment.status === 'partially_met') {
      const implied = skill && assessment.best.method === 'implied';
      return { credit, cause: implied ? 'implied_only' : 'partial', message: `${name}: ${assessment.statusReason}` };
    }
    if (strength < 1) {
      return { credit, cause: 'weak_evidence', message: `${name} is matched, but its supporting evidence is ${assessment.best.strength} (not demonstrated in a role). ${assessment.best.explanation}` };
    }
    return { credit, cause: 'partial', message: `${name}: ${assessment.statusReason}` };
  }

  if (assessment.status === 'insufficient_evidence') {
    // Experience is a measured quantity: credit the share of the required
    // duration that explicit dates establish. Anything else gets the fixed
    // neutral credit — more than `missing`, less than any partial match.
    const d = assessment.details;
    const credit = d.kind === 'years'
      ? (d.requiredMonths > 0 ? Math.min(1, d.demonstrated.bestMonths / d.requiredMonths) : 1)
      : INSUFFICIENT_EVIDENCE_CREDIT;
    return { credit, cause: 'insufficient_evidence', message: `${name}: ${assessment.statusReason}` };
  }

  return { credit: 0, cause: 'missing', message: `${name}: ${assessment.statusReason}` };
}

/**
 * @param {{ jobProfile, assessments, eligibility }} input  Phase 3 job, Phase 5 assessments and eligibility
 * @returns {{ scoringModelVersion, score, keywordCoverage, gate, summary }}
 */
function scoreJobMatch({ jobProfile, assessments, eligibility }) {
  const assessmentById = new Map();
  for (const a of assessments) if (!assessmentById.has(a.requirementId)) assessmentById.set(a.requirementId, a);

  const buckets = new Map(COMPONENTS.map((c) => [c.id, { items: [], confidences: [], weight: 0, present: 0 }]));
  const counts = { scored: 0, insufficientEvidence: 0, notEvaluated: 0, eligibilityOnly: 0 };
  const seenKeys = new Set();

  for (const requirement of jobProfile.requirements) {
    if (seenKeys.has(requirement.canonicalKey)) continue; // a duplicate requirement is scored once
    seenKeys.add(requirement.canonicalKey);

    const componentId = componentFor(requirement);
    if (!componentId) { counts.eligibilityOnly += 1; continue; }
    const bucket = buckets.get(componentId);
    bucket.present += 1;

    const assessment = assessmentById.get(requirement.id);
    if (!assessment || assessment.status === 'not_evaluated') { counts.notEvaluated += 1; continue; }

    const itemWeight = TYPE_WEIGHT[requirement.type] * IMPORTANCE_WEIGHT[requirement.importance];
    const { credit, cause, message } = creditFor(requirement, assessment);
    bucket.items.push({ subjectId: requirement.id, itemWeight, credit, cause, message });
    bucket.confidences.push(assessment.confidence);
    bucket.weight += itemWeight;
    counts.scored += 1;
    if (assessment.status === 'insufficient_evidence') counts.insufficientEvidence += 1;
  }

  const components = COMPONENTS.map(({ id, label }) => {
    const b = buckets.get(id);
    const n = b.items.length;
    return {
      id,
      weight: b.weight,
      items: b.items,
      emptyStatus: b.present > 0 ? 'not_evaluated' : 'not_applicable',
      emptyReason: b.present > 0
        ? `${b.present} ${label} requirement${b.present === 1 ? ' was' : 's were'} not evaluated, so ${b.present === 1 ? 'it is' : 'they are'} excluded from the score rather than counted as failures.`
        : `The job has no ${label} requirement.`,
      statusReason: `${n} ${label} requirement${n === 1 ? '' : 's'} scored.`,
      confidence: n ? round(b.confidences.reduce((s, c) => s + c, 0) / n, 2) : 1,
    };
  });

  const gate = buildGate(eligibility);
  const score = buildBreakdown({
    kind: 'job_match',
    components,
    confidence: buildConfidence(counts, gate),
    nullReason: jobProfile.requirements.length === 0
      ? 'The job description has no extractable requirements, so there is nothing to score against.'
      : 'None of the job requirements could be scored (they are eligibility-only or not evaluated).',
  });

  return {
    scoringModelVersion: SCORING_MODEL_VERSION,
    score,
    keywordCoverage: {
      required: coverage(jobProfile.requirements, assessmentById, 'required'),
      preferred: coverage(jobProfile.requirements, assessmentById, 'preferred'),
    },
    gate,
    summary: { totalRequirements: jobProfile.requirements.length, ...counts },
  };
}

/**
 * The eligibility gate that accompanies the score. A knockout never changes the
 * number (the score stays an honest measure of evidence against requirements);
 * instead the gate states plainly that a hard eligibility issue applies. Unknown
 * eligibility is `review`, never a knockout.
 */
function buildGate(eligibility) {
  const knockouts = eligibility.findings.filter((f) => f.severity === 'critical' && f.outcome === 'failed' && f.confidence >= 0.6);
  const hardKnockout = eligibility.status === 'likely_filtered';
  let message = null;
  if (hardKnockout) message = 'A hard eligibility requirement is explicitly not met. The candidate is likely to be filtered regardless of the match score.';
  else if (eligibility.status === 'review') message = 'Eligibility could not be fully confirmed from the resume and needs review. This is not a failure and does not lower the score.';
  return {
    eligibilityStatus: eligibility.status,
    hardKnockout,
    knockoutRequirementIds: hardKnockout ? knockouts.map((f) => f.requirementId) : [],
    message,
  };
}

function buildConfidence(counts, gate) {
  const reasons = [];
  if (counts.scored < 3) reasons.push(`Only ${counts.scored} requirement${counts.scored === 1 ? '' : 's'} could be scored.`);
  if (counts.insufficientEvidence > 0) reasons.push(`${counts.insufficientEvidence} requirement${counts.insufficientEvidence === 1 ? '' : 's'} had insufficient evidence in the resume.`);
  if (counts.notEvaluated > 0) reasons.push(`${counts.notEvaluated} requirement${counts.notEvaluated === 1 ? ' was' : 's were'} not evaluated and excluded from the score.`);
  if (gate.message) reasons.push(gate.message);

  let label = 'high';
  if (counts.scored < 3) label = 'low';
  else if (counts.insufficientEvidence > 0 || counts.scored < 5) label = 'medium';
  return { label, reasons };
}

/** Share of skill requirements of one importance that are met or partially met. */
function coverage(requirements, assessmentById, importance) {
  const skills = requirements.filter((r) => isSkillType(r.type) && r.importance === importance);
  if (!skills.length) return null;
  const hit = skills.filter((r) => {
    const a = assessmentById.get(r.id);
    return a && (a.status === 'met' || a.status === 'partially_met');
  }).length;
  return round(hit / skills.length, 4);
}

module.exports = { scoreJobMatch };
