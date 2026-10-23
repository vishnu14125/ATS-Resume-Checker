const { SKILLS, CATEGORIES } = require('./data');
const { TAXONOMY_VERSION } = require('./version');

/**
 * Compiles the skill data into fast lookup structures and exposes deterministic
 * recognition, canonicalization and relationship queries. No I/O, no network,
 * no randomness. This is the single source of skill identity for the engine.
 */

const ID_SET = new Set();
const DISPLAY_BY_ID = new Map();
const CATEGORY_BY_ID = new Map();
const IMPLIES_BY_ID = new Map(); // id → [{ id, weight }]
const CONFLICTS = new Set(); // unordered pairs encoded as "a\u0001b" (a<b)
const SURFACES = []; // { id, surface, recognition, ambiguous, confidence }
const SURFACE_TO_ID = new Map(); // normalized surface → { id, recognition, ambiguous, confidence }

const conflictKey = (a, b) => (a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`);
const recognitionFor = (name, surface) => (surface === name.toLowerCase() ? 'canonical' : 'normalized');
const confidenceFor = (recognition, ambiguous) => (recognition === 'alias' ? 0.9 : ambiguous ? 0.8 : 0.98);

for (const skill of SKILLS) {
  ID_SET.add(skill.id);
  DISPLAY_BY_ID.set(skill.id, skill.name);
  CATEGORY_BY_ID.set(skill.id, skill.category);
  if (skill.implies) IMPLIES_BY_ID.set(skill.id, skill.implies);
  for (const other of skill.conflictsWith || []) CONFLICTS.add(conflictKey(skill.id, other));

  const register = (surface, recognition) => {
    const entry = { id: skill.id, surface, recognition, ambiguous: Boolean(skill.ambiguous), confidence: confidenceFor(recognition, skill.ambiguous) };
    SURFACES.push(entry);
    if (!SURFACE_TO_ID.has(surface)) SURFACE_TO_ID.set(surface, entry);
  };
  for (const s of skill.exact) register(s.toLowerCase(), recognitionFor(skill.name, s.toLowerCase()));
  for (const s of skill.aliases) register(s.toLowerCase(), 'alias');
}
SURFACES.sort((a, b) => b.surface.length - a.surface.length);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Token boundaries that keep C distinct from C++/C#: no identifier char (incl. + and #) on either side.
function surfaceRegex(surface) {
  return new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegex(surface)}(?![A-Za-z0-9+#])`, 'gi');
}
const REGEX_CACHE = new Map();
function regexFor(surface) {
  if (!REGEX_CACHE.has(surface)) REGEX_CACHE.set(surface, surfaceRegex(surface));
  return REGEX_CACHE.get(surface);
}

/**
 * Finds skill mentions in a line of text. Longest surfaces win and matches never
 * overlap, so "C" never matches inside "C++" and "React" never inside "React Native".
 * @returns {Array<{ skillId, surface, start, end, recognition, ambiguous, confidence }>}
 */
function recognize(text) {
  if (!text) return [];
  const candidates = [];
  for (const entry of SURFACES) {
    const re = regexFor(entry.surface);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      candidates.push({ skillId: entry.id, surface: m[0], start: m.index, end: m.index + m[0].length, recognition: entry.recognition, ambiguous: entry.ambiguous, confidence: entry.confidence });
    }
  }
  candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = [];
  const seenSkills = new Set();
  let lastEnd = -1;
  for (const c of candidates) {
    if (c.start < lastEnd) continue;
    if (seenSkills.has(c.skillId)) { lastEnd = Math.max(lastEnd, c.end); continue; }
    kept.push(c);
    seenSkills.add(c.skillId);
    lastEnd = c.end;
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * Canonicalizes a single skill token (e.g. "NodeJS", "React.js") to its identity.
 * @returns {{ id, recognition }|null}
 */
function resolve(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  const direct = SURFACE_TO_ID.get(normalized);
  if (direct) return { id: direct.id, recognition: direct.recognition };
  // Punctuation-insensitive retry (e.g. "node js" vs "node.js" is covered by surfaces;
  // this catches stray spacing like "react .js").
  const collapsed = normalized.replace(/\s+/g, ' ').trim();
  const alt = SURFACE_TO_ID.get(collapsed);
  return alt ? { id: alt.id, recognition: alt.recognition } : null;
}

const displayForSkill = (id) => DISPLAY_BY_ID.get(id) || id;
const categoryOf = (id) => CATEGORY_BY_ID.get(id) || null;
const impliesFor = (id) => IMPLIES_BY_ID.get(id) || [];
const isKnown = (id) => ID_SET.has(id);
const areForbidden = (a, b) => CONFLICTS.has(conflictKey(a, b));

/** Structural self-check used by tests and startup: catches data mistakes early. */
function validateTaxonomy() {
  const errors = [];
  const idRegex = /^[a-z0-9][a-z0-9.+#/-]{0,63}$/;
  const aliasOwners = new Map();

  for (const skill of SKILLS) {
    if (!idRegex.test(skill.id)) errors.push(`invalid id "${skill.id}"`);
    if (!CATEGORIES.includes(skill.category)) errors.push(`${skill.id}: unknown category "${skill.category}"`);
    for (const s of [...skill.exact, ...skill.aliases]) {
      const key = s.toLowerCase();
      if (aliasOwners.has(key) && aliasOwners.get(key) !== skill.id) {
        errors.push(`surface "${key}" maps to both ${aliasOwners.get(key)} and ${skill.id}`);
      }
      aliasOwners.set(key, skill.id);
    }
    for (const imp of skill.implies || []) {
      if (!ID_SET.has(imp.id)) errors.push(`${skill.id} implies unknown skill ${imp.id}`);
      if (imp.weight <= 0 || imp.weight > 1) errors.push(`${skill.id}→${imp.id} weight out of range`);
      if (areForbidden(skill.id, imp.id)) errors.push(`${skill.id} both implies and conflicts with ${imp.id}`);
    }
    for (const other of skill.conflictsWith || []) {
      if (!ID_SET.has(other)) errors.push(`${skill.id} conflicts with unknown skill ${other}`);
    }
  }
  return errors;
}

module.exports = {
  TAXONOMY_VERSION,
  CATEGORIES,
  recognize,
  resolve,
  displayForSkill,
  categoryOf,
  impliesFor,
  isKnown,
  areForbidden,
  validateTaxonomy,
  skillCount: ID_SET.size,
};
