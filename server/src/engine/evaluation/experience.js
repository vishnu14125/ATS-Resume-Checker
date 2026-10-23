const { synthMatch, monthInterval, mergeMonths } = require('./support');

/**
 * Experience-duration evaluation.
 *
 * Duration is established ONLY from explicit employment date ranges — never from
 * the number of jobs or projects, skill-mention counts, or graduation dates.
 * Overlapping roles are merged, not summed. When the dates cannot defensibly
 * establish the required duration, the result is `insufficient_evidence` (a
 * neutral "cannot tell"), never a failure — absence of evidence is not evidence
 * of failure.
 *
 * @returns {{ assessment, finding }}
 */
function evaluateExperience(requirement, resumeProfile, registry) {
  const { minYears, scope } = requirement.params;
  const requiredMonths = Math.round(minYears * 12);

  let entries;
  let basis;
  if (scope.kind === 'skill') {
    entries = resumeProfile.experience.filter((e) => scope.skillIds.some((id) => e.skillIds.includes(id)));
    basis = 'skill_attributed';
  } else {
    entries = resumeProfile.experience.filter((e) => e.employmentType !== 'internship');
    basis = 'total_experience';
  }

  const dated = entries.filter((e) => monthInterval(e.dates));
  const totalMonths = mergeMonths(dated.map((e) => monthInterval(e.dates)));
  const demonstrated = { minMonths: totalMonths, bestMonths: totalMonths, maxMonths: totalMonths };
  const contributingEntryIds = dated.map((e) => e.id);
  const details = { kind: 'years', requiredMonths, demonstrated, contributingEntryIds, basis };

  const scopeText = scope.text ? ` in ${scope.text}` : '';
  const meets = totalMonths >= requiredMonths;
  const evidenceIds = dated.map((e) => registry.entryEvidence(e, { skillIds: scope.skillIds })).filter(Boolean);

  let assessment;
  if (meets && evidenceIds.length) {
    const years = (totalMonths / 12).toFixed(1);
    const explanation = `Employment dates establish ~${years} years${scopeText} (requirement: ${minYears}+). Overlapping roles are merged, not summed.`;
    assessment = base(requirement, {
      status: 'met',
      credit: 1.0,
      statusReason: explanation,
      best: synthMatch({ evidenceIds, confidence: 0.85, explanation }),
      details,
      confidence: 0.85,
    });
  } else {
    const reason = totalMonths > 0
      ? `Employment dates show ~${(totalMonths / 12).toFixed(1)} years${scopeText}, which does not defensibly establish the required ${minYears}+ years. Reported as insufficient evidence rather than a failure.`
      : `No dated employment could be attributed${scopeText || ' to this requirement'}, so the required ${minYears}+ years cannot be established from the resume.`;
    assessment = base(requirement, {
      status: 'insufficient_evidence', credit: 0, statusReason: reason, best: null, details, confidence: 0.6,
    });
  }

  const finding = requirement.isHardConstraint ? {
    requirementId: requirement.id,
    kind: 'years_experience',
    severity: 'high',
    outcome: meets && evidenceIds.length ? 'passed' : 'unknown',
    evidenceIds: assessment.best ? assessment.best.evidenceIds : [],
    explanation: assessment.statusReason,
    confidence: assessment.best ? 0.8 : 0.6,
  } : null;

  return { assessment, finding };
}

function base(requirement, fields) {
  return { requirementId: requirement.id, alternatives: [], ...fields };
}

module.exports = { evaluateExperience };
