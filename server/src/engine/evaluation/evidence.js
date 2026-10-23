const { EvidenceSchema } = require('../../domain/contracts/evidence');
const { parseContract } = require('../../domain/contracts');
const { evidenceIdFor, strengthOf } = require('../matching/matchSkills');
const { makeId } = require('../text/ids');

/**
 * Evidence engine — turns real resume content into addressable, verbatim Evidence.
 *
 * Nothing becomes evidence unless it points at actual document lines and quotes
 * them. The engine never invents text and never derives a snippet from anything
 * but the NormalizedDocument the resume was parsed from. A taxonomy relationship
 * (e.g. PostgreSQL → SQL) can support a match, but the evidence still points at
 * what the resume literally says ("PostgreSQL"), never at the inferred concept.
 *
 * Ids are deterministic and reuse the matcher's `evidenceIdFor`, so the evidence
 * built here lines up exactly with the evidence ids Phase 4 match results already
 * reference — referential integrity holds by construction, not by luck.
 */

const RECENT_MONTHS = 24;

/** Evidence.kind for a skill mention, from where in the resume it was found. */
function skillEvidenceKind(mention) {
  if (mention.bulletId) return 'bullet';
  switch (mention.section) {
    case 'skills': return 'skills_list';
    case 'summary': return 'summary';
    case 'projects': return 'tech_stack';
    case 'experience': return 'entry_header';
    case 'certifications': return 'certification';
    case 'education': return 'education';
    default: return 'skills_list';
  }
}

/** Builds a registry that validates, de-duplicates and collects Evidence. */
function createEvidenceRegistry({ normalizedDocument, resumeProfile, referenceDate }) {
  const lines = normalizedDocument.lines;
  const refMonth = referenceDate.getUTCFullYear() * 12 + (referenceDate.getUTCMonth() + 1);
  const byId = new Map();

  // entryId → the owning resume entry (experience/project/education/certification).
  const entryIndex = new Map();
  for (const e of resumeProfile.experience) entryIndex.set(e.id, e);
  for (const p of resumeProfile.projects) entryIndex.set(p.id, p);
  for (const ed of resumeProfile.education) entryIndex.set(ed.id, ed);
  for (const c of resumeProfile.certifications) entryIndex.set(c.id, c);

  // bulletId → bullet (for quantified-outcome detection).
  const bulletIndex = new Map();
  for (const e of [...resumeProfile.experience, ...resumeProfile.projects]) {
    for (const b of e.bullets) bulletIndex.set(b.id, b);
  }

  /** Verbatim line text for a ref, trimmed and capped; null when the line is blank. */
  function snippetForLine(lineIndex, fallback = null) {
    const line = lines[lineIndex];
    const raw = line ? (line.original || line.text || '') : '';
    const text = raw.trim().slice(0, 300);
    if (text) return text;
    const fb = (fallback || '').trim().slice(0, 300);
    return fb || null;
  }

  /** The resume section type that covers a line (for grounding scanned lines). */
  function sectionAt(lineIndex) {
    for (const s of resumeProfile.sections) {
      if (lineIndex >= s.startLine && lineIndex <= s.endLine) return s.type;
    }
    return 'other';
  }

  function isRecent(dates) {
    if (!dates) return false;
    if (dates.isCurrent) return true;
    if (!dates.end) return false;
    const endMonth = dates.end.year * 12 + (dates.end.month || 12);
    return refMonth - endMonth <= RECENT_MONTHS;
  }

  function add(evidence) {
    const parsed = parseContract(EvidenceSchema, evidence, 'Evidence');
    if (!byId.has(parsed.id)) byId.set(parsed.id, parsed);
    return parsed.id;
  }

  /** Strength factors for a skill mention, from its kind and its entry context. */
  function skillFactors(mention, entry, kind) {
    const factors = [];
    if (kind === 'bullet') {
      factors.push(mention.section === 'projects' ? 'applied_in_project' : 'applied_in_role');
      const bullet = mention.bulletId ? bulletIndex.get(mention.bulletId) : null;
      if (bullet && bullet.metrics.length) factors.push('quantified_outcome');
    } else if (kind === 'entry_header') factors.push('applied_in_role');
    else if (kind === 'tech_stack') factors.push('declared_stack');
    else if (kind === 'summary') factors.push('summary_claim');
    else if (kind === 'certification') factors.push('credential');
    else factors.push('listed_only');

    const dates = entry && entry.dates ? entry.dates : null;
    if (dates) {
      factors.push('dated');
      if (isRecent(dates)) factors.push('recent');
    }
    return [...new Set(factors)];
  }

  return {
    /** Grounds one resume skill mention. Id matches the matcher's `evidenceIdFor`. */
    skillEvidence(mention) {
      const kind = skillEvidenceKind(mention);
      const entry = mention.entryId ? entryIndex.get(mention.entryId) : null;
      const snippet = snippetForLine(mention.ref.lineIndex, mention.surface);
      if (!snippet) return null;
      return add({
        id: evidenceIdFor(mention),
        kind,
        section: mention.section,
        entryId: mention.entryId,
        refs: [mention.ref],
        snippet,
        skillIds: [mention.skillId],
        dates: entry && entry.dates ? entry.dates : null,
        strength: strengthOf(mention),
        strengthFactors: skillFactors(mention, entry, kind),
      });
    },

    /** Grounds an experience/project entry (its header line) as evidence. */
    entryEvidence(entry, { skillIds = [] } = {}) {
      const ref = entry.headerRefs[0] || (entry.bullets[0] && entry.bullets[0].ref) || null;
      if (!ref) return null;
      const snippet = snippetForLine(ref.lineIndex);
      if (!snippet) return null;
      const kind = entry.id.startsWith('proj') ? 'tech_stack' : 'entry_header';
      return add({
        id: makeId('ev', 'entry', entry.id),
        kind,
        section: entry.id.startsWith('proj') ? 'projects' : 'experience',
        entryId: entry.id,
        refs: [ref],
        snippet,
        skillIds,
        dates: entry.dates || null,
        strength: entry.id.startsWith('proj') ? 'moderate' : 'strong',
        strengthFactors: skillFactors({ section: entry.id.startsWith('proj') ? 'projects' : 'experience' }, entry, kind),
      });
    },

    /** Grounds an education entry. */
    educationEvidence(edu) {
      const ref = (edu.degree && edu.degree.ref) || edu.refs[0] || null;
      if (!ref) return null;
      const snippet = snippetForLine(ref.lineIndex, edu.degree ? edu.degree.raw : null);
      if (!snippet) return null;
      return add({
        id: makeId('ev', 'edu', edu.id),
        kind: 'education',
        section: 'education',
        entryId: edu.id,
        refs: [ref],
        snippet,
        skillIds: [],
        dates: edu.dates || null,
        strength: 'strong',
        strengthFactors: edu.dates ? ['dated'] : ['listed_only'],
      });
    },

    /** Grounds a certification entry. */
    certificationEvidence(cert) {
      const ref = cert.name.ref;
      const snippet = snippetForLine(ref.lineIndex, cert.name.value);
      if (!snippet) return null;
      return add({
        id: makeId('ev', 'cert', cert.id),
        kind: 'certification',
        section: 'certifications',
        entryId: cert.id,
        refs: [ref],
        snippet,
        skillIds: [],
        dates: null,
        strength: 'strong',
        strengthFactors: ['credential'],
      });
    },

    /** Grounds a declared language. */
    languageEvidence(language) {
      const snippet = snippetForLine(language.ref.lineIndex, language.name);
      if (!snippet) return null;
      return add({
        id: makeId('ev', 'lang', String(language.ref.lineIndex), language.name.toLowerCase()),
        kind: 'skills_list',
        section: 'languages',
        entryId: null,
        refs: [language.ref],
        snippet,
        skillIds: [],
        dates: null,
        strength: 'moderate',
        strengthFactors: ['listed_only'],
      });
    },

    /**
     * Grounds a single scanned document line (used for clearance / work
     * authorization statements, which have no structured resume field).
     */
    lineEvidence(lineIndex, { factor = 'credential' } = {}) {
      const snippet = snippetForLine(lineIndex);
      if (!snippet) return null;
      return add({
        id: makeId('ev', 'line', String(lineIndex)),
        kind: 'summary',
        section: sectionAt(lineIndex),
        entryId: null,
        refs: [{ lineIndex, start: null, end: null }],
        snippet,
        skillIds: [],
        dates: null,
        strength: 'strong',
        strengthFactors: [factor],
      });
    },

    list() {
      return [...byId.values()];
    },
    has(id) {
      return byId.has(id);
    },
  };
}

module.exports = { createEvidenceRegistry, skillEvidenceKind };
