const { makeId } = require('../text/ids');
const taxonomy = require('../taxonomy/taxonomy');

/**
 * Deterministic skill matching against the canonical taxonomy.
 *
 * Phase 4 scope: match method (exact / alias / implied) and canonical identity.
 * Each MatchResult carries a minimal evidence reference (a deterministic ev id
 * derived from the resume mention's location) so later phases can explain the
 * source; the full Evidence record (snippet, strengthFactors) is built in Phase 5.
 */

// Where a skill was found, as provisional evidence strength. Phase 5 refines this
// with the full evidence model; here it only records "where it came from".
const SECTION_STRENGTH = { experience: 'strong', projects: 'moderate', certifications: 'moderate', education: 'weak', skills: 'weak', summary: 'weak', header: 'weak', other: 'weak' };
const SECTION_PRIORITY = { experience: 6, projects: 5, certifications: 4, education: 3, skills: 2, summary: 1, header: 0, other: 0 };

/** Builds a lookup of the resume's canonical skills → their best supporting mention. */
function buildResumeSkillIndex(resumeProfile) {
  const index = new Map(); // skillId → { skillId, mentions:[], best }
  for (const mention of resumeProfile.skillMentions || []) {
    if (!taxonomy.isKnown(mention.skillId)) continue;
    if (!index.has(mention.skillId)) index.set(mention.skillId, { skillId: mention.skillId, mentions: [], best: null });
    const bucket = index.get(mention.skillId);
    bucket.mentions.push(mention);
    const priority = SECTION_PRIORITY[mention.section] ?? 0;
    if (!bucket.best || priority > (SECTION_PRIORITY[bucket.best.section] ?? 0)) bucket.best = mention;
  }
  return index;
}

/** Deterministic evidence id for a resume skill mention (stable across runs). */
function evidenceIdFor(mention) {
  return makeId('ev', mention.skillId, String(mention.ref.lineIndex), String(mention.ref.start ?? ''));
}

function strengthOf(mention) {
  return SECTION_STRENGTH[mention.section] || 'weak';
}

function methodFromRecognition(recognition) {
  return recognition === 'canonical' ? 'exact' : recognition === 'normalized' ? 'normalized' : 'alias';
}

/**
 * Matches a single required skill id against the resume index.
 * @returns {{ status, credit, best, alternatives, confidence, statusReason }}
 */
function matchSkill(requiredSkillId, resumeIndex) {
  // 1. Direct canonical match (exact / normalized / alias).
  const direct = resumeIndex.get(requiredSkillId);
  if (direct) {
    const mention = direct.best;
    const method = methodFromRecognition(mention.recognition);
    const best = {
      method,
      matchedSkillId: requiredSkillId,
      relation: null,
      semantic: null,
      evidenceIds: [evidenceIdFor(mention)],
      strength: strengthOf(mention),
      methodFactor: 1.0,
      strengthFactor: 1.0,
      confidence: mention.confidence,
      explanation: explainDirect(requiredSkillId, mention, method),
    };
    return { status: 'met', credit: 1.0, best, alternatives: [], confidence: mention.confidence, statusReason: best.explanation };
  }

  // 2. Implied match: a resume skill whose taxonomy "implies" edge points at the requirement.
  const impliedMatches = [];
  for (const bucket of resumeIndex.values()) {
    if (taxonomy.areForbidden(bucket.skillId, requiredSkillId)) continue; // never bridge forbidden pairs
    const edge = taxonomy.impliesFor(bucket.skillId).find((e) => e.id === requiredSkillId);
    if (!edge) continue;
    const mention = bucket.best;
    impliedMatches.push({
      method: 'implied',
      matchedSkillId: bucket.skillId,
      relation: { type: 'implies', from: bucket.skillId, to: requiredSkillId, weight: edge.weight },
      semantic: null,
      evidenceIds: [evidenceIdFor(mention)],
      strength: strengthOf(mention),
      methodFactor: edge.weight,
      strengthFactor: 1.0,
      confidence: Number((mention.confidence * edge.weight).toFixed(2)),
      explanation: `${taxonomy.displayForSkill(bucket.skillId)} implies ${taxonomy.displayForSkill(requiredSkillId)} (partial match, weight ${edge.weight}); ${taxonomy.displayForSkill(requiredSkillId)} is not stated directly.`,
    });
  }
  if (impliedMatches.length) {
    impliedMatches.sort((a, b) => b.methodFactor - a.methodFactor);
    const [best, ...alternatives] = impliedMatches;
    return { status: 'partially_met', credit: best.methodFactor, best, alternatives: alternatives.slice(0, 10), confidence: best.confidence, statusReason: best.explanation };
  }

  // 3. Missing — with an explanation that names a confusable sibling if present.
  const forbiddenSibling = [...resumeIndex.keys()].find((id) => taxonomy.areForbidden(id, requiredSkillId));
  const reason = forbiddenSibling
    ? `Not matched: ${taxonomy.displayForSkill(forbiddenSibling)} is not ${taxonomy.displayForSkill(requiredSkillId)}.`
    : `No ${taxonomy.displayForSkill(requiredSkillId)} skill was found in the resume.`;
  return { status: 'missing', credit: 0, best: null, alternatives: [], confidence: 0.9, statusReason: reason };
}

function explainDirect(skillId, mention, method) {
  const name = taxonomy.displayForSkill(skillId);
  if (method === 'alias') return `Matched through alias "${mention.surface}" → ${name} (found in ${mention.section}).`;
  if (method === 'normalized') return `Matched "${mention.surface}" → ${name} (found in ${mention.section}).`;
  return `Exact canonical skill match: ${name} (found in ${mention.section}).`;
}

/**
 * Matches a skill_group requirement (anyOf): matched if at least one alternative
 * matches. A direct match wins over an implied one.
 */
function matchSkillGroup(anyOf, resumeIndex) {
  const results = anyOf.map((id) => ({ id, ...matchSkill(id, resumeIndex) }));
  const met = results.filter((r) => r.status === 'met');
  const partial = results.filter((r) => r.status === 'partially_met');

  if (met.length) {
    const alternatives = [...met.slice(1), ...partial].map((r) => r.best).filter(Boolean).slice(0, 10);
    const names = met.map((r) => taxonomy.displayForSkill(r.id)).join(', ');
    return { status: 'met', credit: 1.0, best: met[0].best, alternatives, confidence: met[0].confidence, statusReason: `Matched group alternative: ${names}.` };
  }
  if (partial.length) {
    partial.sort((a, b) => b.credit - a.credit);
    const alternatives = partial.slice(1).map((r) => r.best).filter(Boolean).slice(0, 10);
    return { status: 'partially_met', credit: partial[0].credit, best: partial[0].best, alternatives, confidence: partial[0].confidence, statusReason: `Partial group match via ${partial[0].best.explanation}` };
  }
  return { status: 'missing', credit: 0, best: null, alternatives: [], confidence: 0.9, statusReason: `None of the group alternatives (${anyOf.map((id) => taxonomy.displayForSkill(id)).join(', ')}) were found.` };
}

module.exports = { buildResumeSkillIndex, matchSkill, matchSkillGroup, evidenceIdFor, strengthOf, SECTION_STRENGTH };
