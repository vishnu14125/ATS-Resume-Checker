const taxonomy = require('../taxonomy/taxonomy');

/**
 * Job-scope recommendation rules. One requirement produces at most one
 * recommendation, chosen from its Phase 5 assessment and (if any) its knockout
 * finding — never from the job text alone.
 *
 * Truthful-edit rule: a recommendation either improves the presentation of
 * evidence that exists, or asks the user to add evidence *only if it is true*.
 * It never tells the user to add a skill, credential, date or figure.
 *
 * `order` ranks rules within the same priority (lower first).
 */

const ELIGIBILITY_TYPES = new Set(['clearance', 'work_authorization', 'language', 'location']);
const isSkillType = (type) => type === 'skill' || type === 'skill_group';
const importanceWord = (importance) => (importance === 'contextual' ? 'mentioned' : importance);

const WEIGHT_RATIONALE = {
  required: 'Required requirements carry the most weight in the Job Match Score.',
  preferred: 'Preferred requirements are optional and carry a small weight; they are not mandatory.',
  contextual: 'This appears in the job description without a required or preferred signal, so it carries very little weight.',
};

function eligibilityLabel(requirement) {
  if (requirement.type === 'clearance') return 'a security clearance';
  if (requirement.type === 'work_authorization') return 'work authorization';
  if (requirement.type === 'language') return `${requirement.params.language} language proficiency`;
  return requirement.displayName;
}

/**
 * @returns {null | { ruleId, order, priority, category, issue, action, rationale, integrityNote, evidenceIds }}
 */
function ruleFor(requirement, assessment, finding) {
  const name = requirement.displayName;
  const required = requirement.importance === 'required';
  const word = importanceWord(requirement.importance);
  const rationale = WEIGHT_RATIONALE[requirement.importance];
  const evidenceIds = assessment.best ? assessment.best.evidenceIds : [];
  const { status } = assessment;

  if (status === 'not_evaluated') return null;

  // ── Eligibility (never scored; never "fixed" by rewording) ─────────────────
  if (ELIGIBILITY_TYPES.has(requirement.type)) {
    const label = eligibilityLabel(requirement);
    if (status === 'met') return null;
    if (finding && finding.severity === 'critical' && finding.outcome === 'failed') {
      return {
        ruleId: 'REC-ELIGIBILITY-KNOCKOUT', order: 10, priority: 'critical', category: 'eligibility',
        issue: `The job requires ${label}, and the resume explicitly states that this is not met.`,
        action: 'Review this requirement and confirm your eligibility before applying. Rewording the resume cannot resolve an eligibility requirement.',
        rationale: 'A mandatory eligibility requirement that is explicitly not met is likely to filter the application regardless of the match score.',
        integrityNote: `Do not state ${label} that you do not hold.`,
        evidenceIds: finding.evidenceIds,
      };
    }
    if (status === 'missing') {
      return {
        ruleId: 'REC-ELIGIBILITY-NOT-MET', order: 55, priority: 'low', category: 'eligibility',
        issue: `The job lists ${label} as ${word}, and the resume states that this is not met.`,
        action: 'No resume change is needed. Take this into account when deciding whether to apply.',
        rationale,
        integrityNote: `Do not state ${label} that you do not hold.`,
        evidenceIds: [],
      };
    }
    return {
      ruleId: 'REC-ELIGIBILITY-UNCONFIRMED', order: 30, priority: requirement.isHardConstraint ? 'high' : 'low', category: 'eligibility',
      issue: `The job lists ${label} as ${word}. The resume does not say whether this is satisfied, so it could not be confirmed. This is not a failure.`,
      action: `Verify your eligibility. If you do hold ${label}, state it explicitly on the resume.`,
      rationale: 'Eligibility is never inferred from a name, location or employer; only an explicit statement counts.',
      integrityNote: `State ${label} only if you actually hold it.`,
      evidenceIds: [],
    };
  }

  // ── Skills ──────────────────────────────────────────────────────────────────
  if (isSkillType(requirement.type)) {
    if (status === 'missing') {
      const confusable = /^Not matched/.test(assessment.statusReason) ? ` ${assessment.statusReason}` : '';
      return {
        ruleId: required ? 'REC-SKILL-MISSING' : 'REC-SKILL-OPTIONAL-MISSING', order: required ? 20 : 50, priority: required ? 'high' : 'low', category: 'skills',
        issue: `${name} is a ${word} skill in the job description, but no supporting evidence was found in the resume.${confusable}`,
        action: `If you have genuine ${name} experience, state it explicitly in your skills and in the role or project where you used it. If you do not, leave it out; consider learning it, or weigh this gap when deciding whether to apply.`,
        rationale,
        integrityNote: `Only add ${name} if it truthfully reflects your experience.`,
        evidenceIds: [],
      };
    }
    if (status === 'partially_met') {
      const from = assessment.best.matchedSkillId ? taxonomy.displayForSkill(assessment.best.matchedSkillId) : 'a related skill';
      return {
        ruleId: 'REC-SKILL-RELATED-ONLY', order: 45, priority: required ? 'medium' : 'low', category: 'skills',
        issue: `The job description lists ${name} as ${word}. The resume shows ${from}, which is related and gives partial coverage, but ${name} itself is not stated.`,
        action: `If you have direct ${name} experience, name it explicitly alongside ${from}.`,
        rationale,
        integrityNote: `Only name ${name} if you have actually used it.`,
        evidenceIds,
      };
    }
    if (status === 'met' && assessment.best.strength === 'weak') {
      return {
        ruleId: 'REC-SKILL-WEAK-EVIDENCE', order: 60, priority: required ? 'medium' : 'low', category: 'skills',
        issue: `${name} is ${word} and is matched, but the resume only lists it; it is not shown in use in any role or project.`,
        action: `Mention ${name} in the role or project where you used it and say what you did with it.`,
        rationale: 'A skill shown in use is stronger evidence than the same skill appearing only in a list.',
        integrityNote: `Attach ${name} to a role or project only if you used it there.`,
        evidenceIds,
      };
    }
    return null;
  }

  // ── Experience ──────────────────────────────────────────────────────────────
  if (requirement.type === 'experience_years') {
    if (status !== 'insufficient_evidence') return null;
    const d = assessment.details;
    const have = d.kind === 'years' ? d.demonstrated.bestMonths : 0;
    const shown = have > 0
      ? `the resume's dated roles establish about ${(have / 12).toFixed(1)} years`
      : 'no dated roles in the resume could be attributed to it';
    return {
      ruleId: 'REC-EXPERIENCE-EVIDENCE', order: 30, priority: required ? 'high' : 'low', category: 'experience',
      issue: `The job asks for ${name} (${word}); ${shown}.`,
      action: 'If you have additional relevant experience, add those roles with clear start and end dates and what you did. If you do not, the gap is real and should be weighed when deciding whether to apply.',
      rationale: 'Experience duration is established only from explicit employment dates, never from the number of roles or projects.',
      integrityNote: 'Dates and roles must be accurate. Do not extend dates.',
      evidenceIds,
    };
  }

  // ── Education ───────────────────────────────────────────────────────────────
  if (requirement.type === 'education') {
    if (status === 'insufficient_evidence') {
      return {
        ruleId: 'REC-EDUCATION-EVIDENCE', order: 30, priority: required ? 'high' : 'low', category: 'education',
        issue: `The job lists ${name} as ${word}, but no degree information was found in the resume.`,
        action: 'If you hold this qualification, add an Education entry stating the degree, field and institution.',
        rationale,
        integrityNote: 'List only qualifications you hold or are currently pursuing.',
        evidenceIds,
      };
    }
    if (status === 'partially_met') {
      return {
        ruleId: 'REC-EDUCATION-PARTIAL', order: 45, priority: required ? 'medium' : 'low', category: 'education',
        issue: `The job lists ${name} as ${word}. ${assessment.statusReason}`,
        action: 'If your degree does meet this requirement, make its level and field explicit. Otherwise check whether the employer accepts equivalent experience.',
        rationale,
        integrityNote: 'State your degree level and field exactly as awarded.',
        evidenceIds,
      };
    }
    return null;
  }

  // ── Certifications ──────────────────────────────────────────────────────────
  if (requirement.type === 'certification' && status === 'missing') {
    return {
      ruleId: required ? 'REC-CERTIFICATION-MISSING' : 'REC-CERTIFICATION-OPTIONAL-MISSING', order: required ? 20 : 50, priority: required ? 'high' : 'low', category: 'certifications',
      issue: `The job lists ${name} as ${word}, but it does not appear among the resume's certifications.`,
      action: `If you hold ${name}, add it to a Certifications section. If you do not, leave it out; a related skill is not a substitute for the certification.`,
      rationale,
      integrityNote: `List ${name} only if you hold it.`,
      evidenceIds: [],
    };
  }

  return null;
}

module.exports = { ruleFor };
