/**
 * The scoring model: every weight and threshold the two scores use, in one place.
 * Scores are deterministic ATS-analysis metrics — not hiring probabilities.
 */

const SCORING_MODEL_VERSION = '6.0.0-phase6';

// ── Job Match ────────────────────────────────────────────────────────────────

/** Which score component a requirement type is scored under (null = not scored). */
const COMPONENT_FOR_TYPE = {
  experience_years: 'experience',
  education: 'education',
  certification: 'certifications',
  responsibility: 'responsibilities',
  // Eligibility-only types: reported through Eligibility, never through the score.
  language: null,
  work_authorization: null,
  clearance: null,
  location: null,
};

/** Relative weight of one requirement of each type. */
const TYPE_WEIGHT = {
  skill: 1, skill_group: 1, experience_years: 2, education: 1.5, certification: 1, responsibility: 1,
};

/** Required requirements dominate; preferred are secondary; contextual are near-informational. */
const IMPORTANCE_WEIGHT = { required: 1, preferred: 0.3, contextual: 0.15 };

/** How much a matched skill counts, by where the resume shows it. */
const EVIDENCE_STRENGTH_FACTOR = { strong: 1, moderate: 0.9, weak: 0.8 };

/**
 * Credit for an `insufficient_evidence` requirement that has no measurable
 * quantity: above `missing` (0), below every partial match. Experience is
 * measured instead (demonstrated ÷ required months).
 */
const INSUFFICIENT_EVIDENCE_CREDIT = 0.25;

// ── Resume Health ────────────────────────────────────────────────────────────

const HEALTH_COMPONENT_WEIGHTS = {
  parseability: 0.25,
  structure: 0.2,
  technical_content: 0.25,
  impact: 0.15,
  completeness: 0.15,
};

const CHECK_CREDIT = { pass: 1, warn: 0.5, fail: 0 };

const HEALTH = {
  unreadableWords: 20,
  thinWords: 100,
  longWords: 1400,
  longPages: 3,
  encodingFailRatio: 0.005,
  skillsFull: 8,
  skillsFair: 4,
  demonstratedShare: 0.5,
  metricShare: 0.3,
  actionVerbShare: 0.6,
};

// ── Rounding ─────────────────────────────────────────────────────────────────

/** Half-up rounding to `places` decimals, stable for the values scoring produces. */
function round(value, places) {
  const f = 10 ** places;
  return Math.round((value + Number.EPSILON) * f) / f;
}

module.exports = {
  SCORING_MODEL_VERSION,
  COMPONENT_FOR_TYPE,
  TYPE_WEIGHT,
  IMPORTANCE_WEIGHT,
  EVIDENCE_STRENGTH_FACTOR,
  INSUFFICIENT_EVIDENCE_CREDIT,
  HEALTH_COMPONENT_WEIGHTS,
  CHECK_CREDIT,
  HEALTH,
  round,
};
