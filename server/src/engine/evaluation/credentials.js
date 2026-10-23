const { synthMatch } = require('./support');

/**
 * Eligibility credentials: language, work authorization and security clearance.
 *
 * Work authorization and clearance are highly sensitive and have no structured
 * resume field, so they are decided ONLY from explicit statements the candidate
 * made in the document. Nothing is inferred from name, location, email, employer,
 * citizenship-adjacent hints or the language the resume is written in. Silence is
 * `unknown` (→ insufficient_evidence, never a knockout). A knockout is produced
 * only when the resume explicitly states the hard requirement is not satisfied.
 */

// Explicit self-statements. Negatives are tested before positives so that
// "No security clearance" is read as a denial, not as "security clearance".
const CLEARANCE_NEGATIVE = /\b(no (?:active |current )?(?:security |secret )?clearance|without (?:a |an |any )?(?:security |secret )?clearance|do(?:es)? not (?:hold|have|possess)[^.]*clearance|not (?:security[- ])?cleared|unable to obtain[^.]*clearance)\b/i;
const CLEARANCE_POSITIVE = /\b(active|current|holds?(?:\s+an?)?|possess(?:es)?)\s+[^.]*?\b(?:secret|top[- ]secret|ts\/sci|security)\s+clearance\b|\b(?:secret|top[- ]secret|ts\/sci)\s+clearance\b|\bcurrently cleared\b|\bclearance:\s*(?:active|current|secret|top secret)\b/i;

const AUTH_NEGATIVE = /\b(require[sd]?|need[s]?|will require)\s+(?:visa\s+)?sponsorship\b|\bnot (?:authorized|eligible) to work\b|\bno work authorization\b/i;
const AUTH_POSITIVE = /\b(authorized to work|work authorization|right to work|eligible to work|permanent resident|green[- ]?card|u\.?s\.? citizen|citizen of the (?:us|u\.?s\.?|united states))\b/i;

/** Finds the first line matching `negative`, then `positive`. */
function scan(normalizedDocument, negative, positive) {
  let positiveLine = null;
  for (const line of normalizedDocument.lines) {
    const text = line.text || line.original || '';
    if (negative.test(text)) return { outcome: 'failed', lineIndex: line.index };
    if (positiveLine === null && positive.test(text)) positiveLine = line.index;
  }
  if (positiveLine !== null) return { outcome: 'passed', lineIndex: positiveLine };
  return { outcome: 'unknown', lineIndex: null };
}

function evaluateLanguage(requirement, resumeProfile, registry) {
  const { language, level } = requirement.params;
  const target = language.toLowerCase();
  const match = resumeProfile.languages.find((l) => l.name.toLowerCase() === target || l.name.toLowerCase().includes(target));

  let assessment;
  if (match) {
    const evidenceId = registry.languageEvidence(match);
    const prof = match.proficiency ? ` (listed proficiency: ${match.proficiency})` : '';
    const explanation = `Resume lists ${match.name}${prof}, satisfying the ${requirement.displayName} requirement.`;
    if (evidenceId) {
      assessment = mk(requirement, { status: 'met', credit: 1.0, statusReason: explanation, best: synthMatch({ evidenceIds: [evidenceId], strength: 'moderate', confidence: 0.8, explanation }), confidence: 0.8 });
    }
  }
  if (!assessment) {
    const reason = `The resume does not explicitly list ${language}${level ? ` (${level})` : ''} proficiency. Spoken-language proficiency is not inferred from the language the resume is written in, so this is reported as insufficient evidence rather than a failure.`;
    assessment = mk(requirement, { status: 'insufficient_evidence', credit: 0, statusReason: reason, best: null, confidence: 0.6 });
  }
  return { assessment, finding: credentialFinding(requirement, 'language', 'high', assessment, match ? 0.75 : 0.6) };
}

function evaluateWorkAuthorization(requirement, normalizedDocument, registry) {
  return evaluateScanned(requirement, normalizedDocument, registry, {
    kind: 'work_authorization',
    label: 'work authorization',
    negative: AUTH_NEGATIVE,
    positive: AUTH_POSITIVE,
    failedReason: 'The resume explicitly indicates the candidate requires sponsorship / is not authorized to work, which conflicts with this requirement.',
    passedReason: 'The resume explicitly states the candidate is authorized to work.',
    unknownReason: 'The resume does not state work-authorization status. This is not inferred from name, location, email or employer, so it is reported as insufficient evidence — not a failure.',
  });
}

function evaluateClearance(requirement, normalizedDocument, registry) {
  return evaluateScanned(requirement, normalizedDocument, registry, {
    kind: 'clearance',
    label: 'security clearance',
    negative: CLEARANCE_NEGATIVE,
    positive: CLEARANCE_POSITIVE,
    failedReason: 'The resume explicitly states the candidate does not hold the required security clearance.',
    passedReason: 'The resume explicitly states the candidate holds an active security clearance.',
    unknownReason: 'The resume does not mention a security clearance. Absence of a clearance statement is not proof the candidate lacks one, so this is reported as insufficient evidence rather than a knockout.',
  });
}

function evaluateScanned(requirement, normalizedDocument, registry, cfg) {
  const { outcome, lineIndex } = scan(normalizedDocument, cfg.negative, cfg.positive);
  const evidenceId = lineIndex !== null ? registry.lineEvidence(lineIndex) : null;

  let assessment;
  if (outcome === 'passed' && evidenceId) {
    assessment = mk(requirement, { status: 'met', credit: 1.0, statusReason: cfg.passedReason, best: synthMatch({ evidenceIds: [evidenceId], strength: 'strong', confidence: 0.85, explanation: cfg.passedReason }), confidence: 0.85 });
  } else if (outcome === 'failed') {
    assessment = mk(requirement, { status: 'missing', credit: 0, statusReason: cfg.failedReason, best: null, confidence: 0.8 });
  } else {
    assessment = mk(requirement, { status: 'insufficient_evidence', credit: 0, statusReason: cfg.unknownReason, best: null, confidence: 0.6 });
  }

  // Clearance and work authorization are genuine hard filters → critical severity.
  const finding = requirement.isHardConstraint ? {
    requirementId: requirement.id,
    kind: cfg.kind,
    severity: 'critical',
    outcome: outcome === 'passed' && !evidenceId ? 'unknown' : outcome,
    evidenceIds: evidenceId ? [evidenceId] : [],
    explanation: assessment.statusReason,
    confidence: outcome === 'unknown' ? 0.6 : 0.8,
  } : null;

  return { assessment, finding };
}

function credentialFinding(requirement, kind, severity, assessment, confidence) {
  if (!requirement.isHardConstraint) return null;
  return {
    requirementId: requirement.id,
    kind,
    severity,
    outcome: assessment.status === 'met' ? 'passed' : 'unknown',
    evidenceIds: assessment.best ? assessment.best.evidenceIds : [],
    explanation: assessment.statusReason,
    confidence,
  };
}

function mk(requirement, { status, credit, statusReason, best, confidence }) {
  return { requirementId: requirement.id, status, statusReason, credit, best, alternatives: [], details: { kind: 'none' }, confidence };
}

module.exports = { evaluateLanguage, evaluateWorkAuthorization, evaluateClearance };
