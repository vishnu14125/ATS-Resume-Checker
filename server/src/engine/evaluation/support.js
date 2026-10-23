/**
 * Shared, deterministic helpers for the Phase 5 evaluators. No clock, no I/O.
 */

/** Degree levels ranked so "resume level >= required level" is a numeric compare. */
const DEGREE_RANK = {
  unknown: 0, certificate: 1, high_school: 1, bootcamp: 2, diploma: 2,
  associate: 2, bachelor: 3, master: 4, doctorate: 5,
};

/**
 * Synthesizes a MatchResult for a non-skill requirement that is satisfied by
 * concrete evidence (experience, degree, certification, language, clearance).
 * `matchedSkillId` is null because the subject is not a taxonomy skill; the match
 * is "directly evidenced", so method is `exact` and no relation/semantic applies.
 */
function synthMatch({ evidenceIds, strength = 'strong', methodFactor = 1.0, strengthFactor = 1.0, confidence, explanation }) {
  return {
    method: 'exact',
    matchedSkillId: null,
    relation: null,
    semantic: null,
    evidenceIds,
    strength,
    methodFactor,
    strengthFactor,
    confidence,
    explanation,
  };
}

/** Absolute inclusive month interval [startAbs, endAbs] for a DateRange, or null. */
function monthInterval(dates) {
  if (!dates || !dates.start) return null;
  const startAbs = dates.start.year * 12 + (dates.start.month || 1);
  if (!dates.end) {
    if (dates.isCurrent && dates.duration) return [startAbs, startAbs + Math.max(0, dates.duration.bestMonths - 1)];
    return null;
  }
  const endAbs = dates.end.year * 12 + (dates.end.month || 12);
  return endAbs >= startAbs ? [startAbs, endAbs] : null;
}

/**
 * Total months covered by a set of inclusive month intervals, merging overlaps
 * so concurrent roles are never double-counted (mirrors the resume parser's
 * totals computation).
 */
function mergeMonths(intervals) {
  const valid = intervals.filter(Boolean).sort((a, b) => a[0] - b[0]);
  if (!valid.length) return 0;
  let total = 0;
  let [curStart, curEnd] = valid[0];
  for (let i = 1; i < valid.length; i += 1) {
    const [s, e] = valid[i];
    if (s <= curEnd + 1) curEnd = Math.max(curEnd, e);
    else { total += curEnd - curStart + 1; [curStart, curEnd] = [s, e]; }
  }
  total += curEnd - curStart + 1;
  return total;
}

module.exports = { DEGREE_RANK, synthMatch, monthInterval, mergeMonths };
