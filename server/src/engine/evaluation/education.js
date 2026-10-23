const { synthMatch, DEGREE_RANK, monthInterval, mergeMonths } = require('./support');

/**
 * Education evaluation.
 *
 * Inspects parsed education records only. A degree is never inferred from a job
 * title, project, skill or institution name. When the resume carries no degree
 * information, the result is `insufficient_evidence` rather than a guess or a
 * failure. Field-of-study matching is conservative: a different field is a
 * partial match, not an equivalence.
 *
 * @returns {{ assessment, finding }}
 */
function evaluateEducation(requirement, resumeProfile, registry) {
  const { minLevel, fieldIds, relatedFieldsAccepted, equivalentExperienceYears } = requirement.params;
  const requiredRank = DEGREE_RANK[minLevel] ?? 0;

  const degreeEntries = resumeProfile.education.filter((e) => e.degree);
  const bestEntry = degreeEntries.reduce((best, e) => {
    const rank = DEGREE_RANK[e.degree.level] ?? 0;
    return !best || rank > (DEGREE_RANK[best.degree.level] ?? 0) ? e : best;
  }, null);
  const bestRank = bestEntry ? (DEGREE_RANK[bestEntry.degree.level] ?? 0) : 0;
  const levelMet = bestEntry !== null && bestRank >= requiredRank;
  const fieldMatch = resolveFieldMatch(degreeEntries, fieldIds, relatedFieldsAccepted);

  const professionalMonths = mergeMonths(
    resumeProfile.experience.filter((e) => e.employmentType !== 'internship').map((e) => monthInterval(e.dates))
  );
  const viaEquivalentExperience = !levelMet
    && equivalentExperienceYears !== null
    && professionalMonths >= Math.round(equivalentExperienceYears * 12)
    && professionalMonths > 0;

  const details = {
    kind: 'education',
    bestEntryId: bestEntry ? bestEntry.id : null,
    levelMet,
    fieldMatch,
    viaEquivalentExperience,
  };

  const { status, credit, reason } = decide({ bestEntry, levelMet, fieldMatch, viaEquivalentExperience, minLevel, requirement });

  let best = null;
  if (status === 'met' || status === 'partially_met') {
    const evidenceIds = groundEvidence({ bestEntry, viaEquivalentExperience, resumeProfile, registry });
    if (evidenceIds.length) best = synthMatch({ evidenceIds, strength: 'strong', methodFactor: credit, confidence: 0.85, explanation: reason });
  }

  // Cannot claim met/partially_met without groundable evidence.
  const resolved = (status === 'met' || status === 'partially_met') && !best
    ? { status: 'insufficient_evidence', credit: 0 }
    : { status, credit };

  const assessment = {
    requirementId: requirement.id,
    status: resolved.status,
    statusReason: reason,
    credit: resolved.credit,
    best,
    alternatives: [],
    details,
    confidence: resolved.status === 'insufficient_evidence' ? 0.6 : 0.85,
  };

  const finding = requirement.isHardConstraint ? {
    requirementId: requirement.id,
    kind: 'degree',
    severity: 'high',
    outcome: outcomeFor(resolved.status),
    evidenceIds: best ? best.evidenceIds : [],
    explanation: reason,
    confidence: best ? 0.8 : 0.6,
  } : null;

  return { assessment, finding };
}

function resolveFieldMatch(degreeEntries, fieldIds, relatedFieldsAccepted) {
  if (fieldIds.length === 0) return 'unknown'; // no field constraint
  const fields = degreeEntries.map((e) => (e.fieldOfStudy ? e.fieldOfStudy.fieldId : null));
  if (fields.some((f) => f && fieldIds.includes(f))) return 'exact';
  const hasKnownField = fields.some((f) => f !== null);
  if (relatedFieldsAccepted && hasKnownField) return 'related';
  if (!hasKnownField) return 'unknown'; // has degrees, but field could not be determined
  return 'none';
}

function decide({ bestEntry, levelMet, fieldMatch, viaEquivalentExperience, minLevel, requirement }) {
  const need = requirement.displayName;
  if (!bestEntry) {
    if (viaEquivalentExperience) return { status: 'met', credit: 1.0, reason: `No degree is listed, but the resume's professional experience satisfies the "or equivalent experience" allowance for ${need}.` };
    return { status: 'insufficient_evidence', credit: 0, reason: `No degree information was found in the resume, so the ${need} requirement cannot be established. Reported as insufficient evidence rather than a failure.` };
  }
  const have = bestEntry.degree.raw;
  if (levelMet) {
    if (fieldMatch === 'exact' || fieldMatch === 'unknown' && requirement.params.fieldIds.length === 0) {
      return { status: 'met', credit: 1.0, reason: `Degree "${have}" meets the required ${minLevel} level and field.` };
    }
    if (fieldMatch === 'related') return { status: 'met', credit: 0.9, reason: `Degree "${have}" meets the required ${minLevel} level in a related field (related fields are accepted).` };
    if (fieldMatch === 'unknown') return { status: 'partially_met', credit: 0.7, reason: `Degree "${have}" meets the required ${minLevel} level, but its field of study could not be determined from the resume.` };
    return { status: 'partially_met', credit: 0.5, reason: `Degree "${have}" meets the required ${minLevel} level but is not in the required field.` };
  }
  if (viaEquivalentExperience) return { status: 'met', credit: 1.0, reason: `Degree level is below ${minLevel}, but professional experience satisfies the "or equivalent experience" allowance.` };
  return { status: 'partially_met', credit: 0.4, reason: `Degree "${have}" is below the required ${minLevel} level.` };
}

function groundEvidence({ bestEntry, viaEquivalentExperience, resumeProfile, registry }) {
  if (bestEntry) {
    const id = registry.educationEvidence(bestEntry);
    if (id) return [id];
  }
  if (viaEquivalentExperience) {
    return resumeProfile.experience
      .filter((e) => e.employmentType !== 'internship' && monthInterval(e.dates))
      .map((e) => registry.entryEvidence(e))
      .filter(Boolean);
  }
  return [];
}

function outcomeFor(status) {
  if (status === 'met') return 'passed';
  if (status === 'partially_met') return 'at_risk';
  return 'unknown';
}

module.exports = { evaluateEducation };
