const { makeId } = require('../text/ids');
const { recognize, displayForSkill } = require('../text/skills');
const { FIELD_OF_STUDY, CERTIFICATIONS } = require('../text/lexicons');
const jd = require('../text/jdLexicons');

const IMPORTANCE_RANK = { required: 3, preferred: 2, contextual: 1 };
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';

/** A section whose heading explicitly signals hard minimum requirements. */
function isHardRequirementsHeading(section) {
  return section && section.type === 'requirements' && /\b(required|requirements|minimum|basic|must)\b/i.test(section.heading || '');
}

/** Resolves a statement's importance from its own modality, then its section. */
function classifyImportance(text, section) {
  if (jd.NEGATION_CUES.test(text)) return { importance: 'preferred', reason: 'Statement marks this as optional/not required.' };
  if (jd.REQUIRED_CUES.test(text)) return { importance: 'required', reason: `Statement uses a required cue ("${(text.match(jd.REQUIRED_CUES) || [])[0]}").` };
  if (jd.PREFERRED_CUES.test(text)) return { importance: 'preferred', reason: `Statement uses a preferred cue ("${(text.match(jd.PREFERRED_CUES) || [])[0]}").` };
  const type = section ? section.type : 'other';
  if (type === 'requirements') {
    return isHardRequirementsHeading(section)
      ? { importance: 'required', reason: `Under the "${section.heading}" section.` }
      : { importance: 'contextual', reason: `Listed under "${section.heading || 'requirements'}" without an explicit required/preferred cue.` };
  }
  if (type === 'preferred') return { importance: 'preferred', reason: `Under the "${section.heading || 'preferred'}" section.` };
  if (type === 'responsibilities') return { importance: 'contextual', reason: 'Appears in the responsibilities section.' };
  return { importance: 'contextual', reason: 'No explicit required/preferred signal.' };
}

/**
 * Extracts and de-duplicates requirements from statements.
 * @param {Array} statements  from buildStatements
 * @param {Map<number, object>} sectionByLine  lineIndex → section instance
 * @returns {{ requirements: object[], unclassifiedStatementIds: string[] }}
 */
function extractRequirements(statements, sectionByLine) {
  const byKey = new Map();
  const classifiedStatements = new Set();

  const upsert = (candidate, statementId) => {
    const existing = byKey.get(candidate.canonicalKey);
    if (!existing) {
      byKey.set(candidate.canonicalKey, { ...candidate, sourceStatementIds: [statementId] });
      classifiedStatements.add(statementId);
      return;
    }
    if (IMPORTANCE_RANK[candidate.importance] > IMPORTANCE_RANK[existing.importance]) {
      existing.importance = candidate.importance;
      existing.importanceReason = candidate.importanceReason;
    }
    existing.isHardConstraint = existing.isHardConstraint || candidate.isHardConstraint;
    existing.confidence = Math.max(existing.confidence, candidate.confidence);
    if (!existing.sourceStatementIds.includes(statementId)) existing.sourceStatementIds.push(statementId);
    classifiedStatements.add(statementId);
  };

  for (const statement of statements) {
    const section = sectionByLine.get(statement.refs[0].lineIndex) || null;
    const { importance, reason } = classifyImportance(statement.text, section);
    const requiredCue = jd.REQUIRED_CUES.test(statement.text);
    const ctx = { statement, section, importance, reason, requiredCue };

    const before = classifiedStatements.size;

    extractSkillRequirements(ctx, upsert);
    extractExperienceRequirement(ctx, upsert);
    extractEducationRequirement(ctx, upsert);
    extractCertificationRequirement(ctx, upsert);
    extractEligibilityRequirements(ctx, upsert);
    if (section && section.type === 'responsibilities') extractResponsibility(ctx, upsert);

    if (classifiedStatements.size === before) { /* nothing extracted from this statement */ }
  }

  const requirements = [...byKey.values()].map(finalizeRequirement);
  const unclassifiedStatementIds = statements
    .filter((s) => !classifiedStatements.has(s.id))
    .filter((s) => { const sec = sectionByLine.get(s.refs[0].lineIndex); return sec && (sec.type === 'requirements' || sec.type === 'preferred'); })
    .map((s) => s.id);

  return { requirements, unclassifiedStatementIds };
}

function finalizeRequirement(req) {
  const { canonicalKey, ...rest } = req;
  return {
    id: makeId('req', canonicalKey),
    canonicalKey,
    ...rest,
    extractedBy: 'rules',
  };
}

function base(ctx, { type, canonicalKey, displayName, params, category = null, isHardConstraint, confidence = 0.9 }) {
  return {
    type,
    canonicalKey,
    displayName,
    category,
    importance: ctx.importance,
    importanceReason: ctx.reason,
    isHardConstraint,
    params,
    sourceText: ctx.statement.text.slice(0, 300),
    confidence,
  };
}

function extractSkillRequirements(ctx, upsert) {
  const mentions = recognize(ctx.statement.text);
  const seen = new Set();
  for (const m of mentions) {
    if (m.ambiguous && ctx.section && ctx.section.type !== 'requirements' && ctx.section.type !== 'preferred') continue;
    if (seen.has(m.skillId)) continue;
    seen.add(m.skillId);
    const hard = ctx.requiredCue || isHardRequirementsHeading(ctx.section);
    upsert(base(ctx, {
      type: 'skill',
      canonicalKey: `skill:${m.skillId}`,
      displayName: displayForSkill(m.skillId),
      params: { kind: 'skill', skillId: m.skillId },
      isHardConstraint: Boolean(hard && ctx.importance === 'required'),
      confidence: m.confidence,
    }), ctx.statement.id);
  }
}

function extractExperienceRequirement(ctx, upsert) {
  const text = ctx.statement.text;
  let minYears = null;
  let maxYears = null;

  const range = jd.YEARS_RANGE.exec(text);
  if (range) { minYears = Number(range[1]); maxYears = Number(range[2]); }
  else if (jd.YEARS_MIN.exec(text)) minYears = Number(jd.YEARS_MIN.exec(text)[1]);
  else if (jd.YEARS_PLUS.exec(text)) minYears = Number(jd.YEARS_PLUS.exec(text)[1]);
  else if (jd.YEARS_WORD.exec(text)) minYears = jd.matchNumberWord(jd.YEARS_WORD.exec(text)[1]);
  else if (jd.ENTRY_LEVEL.test(text)) minYears = 0;
  else if (jd.YEARS_SIMPLE.exec(text) && /experience/i.test(text)) minYears = Number(jd.YEARS_SIMPLE.exec(text)[1]);

  if (minYears === null) return;
  if (maxYears !== null && maxYears < minYears) maxYears = null;

  // Scope: "...experience in/with <X>".
  let scope = { kind: 'general', skillIds: [], text: null };
  const scopeMatch = jd.EXP_SCOPE_AFTER.exec(text);
  if (scopeMatch) {
    const phrase = scopeMatch[1].trim();
    const skills = recognize(phrase).filter((m) => !m.ambiguous).map((m) => m.skillId);
    if (skills.length) scope = { kind: 'skill', skillIds: [...new Set(skills)], text: phrase };
    else scope = { kind: 'domain', skillIds: [], text: phrase };
  }
  const key = scope.kind === 'skill' ? `years:skill:${scope.skillIds[0]}` : scope.kind === 'domain' ? `years:domain:${slug(scope.text)}` : 'years:general';
  const display = scope.text ? `${minYears}+ years of experience in ${scope.text}` : `${minYears}+ years of experience`;

  upsert(base(ctx, {
    type: 'experience_years',
    canonicalKey: key,
    displayName: display,
    params: { kind: 'experience_years', minYears, maxYears, scope },
    isHardConstraint: ctx.importance === 'required',
    confidence: 0.9,
  }), ctx.statement.id);
}

function extractEducationRequirement(ctx, upsert) {
  const text = ctx.statement.text;
  let minLevel = null;
  for (const [level, pattern] of jd.DEGREE_REQ) { if (pattern.test(text)) { minLevel = level; break; } }
  if (!minLevel) return;

  const fieldIds = [];
  const fieldMatch = jd.DEGREE_FIELD.exec(text);
  if (fieldMatch) {
    for (const [id, pattern] of FIELD_OF_STUDY) if (pattern.test(fieldMatch[1])) fieldIds.push(id);
  }
  const equivalent = jd.EQUIVALENT_EXP.test(text);

  upsert(base(ctx, {
    type: 'education',
    canonicalKey: `education:${minLevel}`,
    displayName: fieldMatch ? `${capitalize(minLevel)} degree in ${fieldMatch[1].trim()}` : `${capitalize(minLevel)} degree`,
    params: {
      kind: 'education',
      minLevel,
      fieldIds: [...new Set(fieldIds)],
      relatedFieldsAccepted: jd.RELATED_FIELD.test(text),
      equivalentExperienceYears: equivalent ? 0 : null,
    },
    isHardConstraint: ctx.importance === 'required',
    confidence: 0.85,
  }), ctx.statement.id);
}

function extractCertificationRequirement(ctx, upsert) {
  const text = ctx.statement.text;
  let id = null;
  let rawName = null;
  for (const [certId, pattern] of CERTIFICATIONS) {
    const m = pattern.exec(text);
    if (m) { id = certId; rawName = m[0].trim(); break; }
  }
  if (!id) {
    const generic = jd.CERT_PHRASE.exec(text);
    if (generic) rawName = generic[0].trim();
  }
  if (!rawName) return;

  upsert(base(ctx, {
    type: 'certification',
    canonicalKey: `certification:${id || slug(rawName)}`,
    displayName: rawName,
    params: { kind: 'certification', anyOf: id ? [id] : [], rawName },
    isHardConstraint: ctx.importance === 'required',
    confidence: id ? 0.85 : 0.6,
  }), ctx.statement.id);
}

function extractEligibilityRequirements(ctx, upsert) {
  const text = ctx.statement.text;

  const lang = jd.LANGUAGE_REQ.exec(text);
  if (lang && jd.SPOKEN_LANGUAGES.has(lang[2].toLowerCase())) {
    const language = lang[2][0].toUpperCase() + lang[2].slice(1).toLowerCase();
    upsert(base(ctx, {
      type: 'language',
      canonicalKey: `language:${lang[2].toLowerCase()}`,
      displayName: `${language} (${lang[1].toLowerCase()})`,
      params: { kind: 'language', language, level: lang[1].toLowerCase() },
      isHardConstraint: ctx.importance === 'required',
      confidence: 0.7,
    }), ctx.statement.id);
  }
  if (jd.WORK_AUTH.test(text)) {
    upsert(base(ctx, {
      type: 'work_authorization',
      canonicalKey: 'work_authorization',
      displayName: 'Work authorization',
      params: { kind: 'work_authorization', text: text.slice(0, 200) },
      isHardConstraint: true,
      confidence: 0.75,
    }), ctx.statement.id);
  }
  if (jd.CLEARANCE.test(text)) {
    upsert(base(ctx, {
      type: 'clearance',
      canonicalKey: 'clearance',
      displayName: 'Security clearance',
      params: { kind: 'clearance', text: text.slice(0, 200) },
      isHardConstraint: true,
      confidence: 0.8,
    }), ctx.statement.id);
  }
}

function extractResponsibility(ctx, upsert) {
  upsert(base(ctx, {
    type: 'responsibility',
    canonicalKey: `responsibility:${makeId('r', ctx.statement.id)}`,
    displayName: ctx.statement.text.slice(0, 120),
    params: { kind: 'responsibility', text: ctx.statement.text.slice(0, 300) },
    isHardConstraint: false,
    confidence: 0.8,
  }), ctx.statement.id);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { extractRequirements, classifyImportance };
