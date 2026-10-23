const { synthMatch } = require('./support');

/**
 * Certification evaluation.
 *
 * A certification counts only when it is explicitly present in the resume's
 * certifications. It is never inferred from a related skill, tool or project
 * (listing "AWS" as a skill does not establish an AWS certification). An absent
 * certification is `missing` — certifications are explicit, so their absence is a
 * genuine gap rather than merely unknown.
 *
 * @returns {{ assessment, finding }}
 */
function evaluateCertification(requirement, resumeProfile, registry) {
  const { anyOf, rawName } = requirement.params;
  const match = findCertification(resumeProfile.certifications, anyOf, rawName);

  let assessment;
  if (match) {
    const evidenceId = registry.certificationEvidence(match);
    const explanation = `Resume lists "${match.name.value}", matching the required ${requirement.displayName}.`;
    if (evidenceId) {
      assessment = {
        requirementId: requirement.id,
        status: 'met',
        statusReason: explanation,
        credit: 1.0,
        best: synthMatch({ evidenceIds: [evidenceId], strength: 'strong', confidence: 0.9, explanation }),
        alternatives: [],
        details: { kind: 'certification', entryId: match.id, certStatus: match.status },
        confidence: 0.9,
      };
    }
  }

  if (!assessment) {
    assessment = {
      requirementId: requirement.id,
      status: 'missing',
      statusReason: `No certification matching ${requirement.displayName} was found in the resume's certifications.`,
      credit: 0,
      best: null,
      alternatives: [],
      details: { kind: 'certification', entryId: null, certStatus: null },
      confidence: 0.85,
    };
  }

  const finding = requirement.isHardConstraint ? {
    requirementId: requirement.id,
    kind: 'certification',
    severity: 'high',
    // Conservative: a missing certification is not a hard disqualification on its
    // own (it can be obtained), so it is "unknown" for eligibility, not "failed".
    outcome: assessment.status === 'met' ? 'passed' : 'unknown',
    evidenceIds: assessment.best ? assessment.best.evidenceIds : [],
    explanation: assessment.statusReason,
    confidence: assessment.best ? 0.85 : 0.6,
  } : null;

  return { assessment, finding };
}

function findCertification(certifications, anyOf, rawName) {
  if (anyOf.length) {
    const byId = certifications.find((c) => c.certificationId && anyOf.includes(c.certificationId));
    if (byId) return byId;
  }
  // Generic phrase (no known id): require a conservative name-core containment.
  const core = rawName.toLowerCase().replace(/\b(certified|certification|certificate)\b/g, '').replace(/\s+/g, ' ').trim();
  if (core.length >= 3) {
    const found = certifications.find((c) => c.name.value.toLowerCase().includes(core));
    if (found) return found;
  }
  return null;
}

module.exports = { evaluateCertification };
