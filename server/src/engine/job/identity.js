const { ROLE_CUE } = require('../text/lexicons');
const jd = require('../text/jdLexicons');

const refOf = (lineIndex, text, match) => {
  const at = match && typeof text === 'string' ? text.indexOf(match) : -1;
  return at >= 0 ? { lineIndex, start: at, end: at + match.length } : { lineIndex, start: null, end: null };
};

/** Extracts the job title from the lines before the first section heading. */
function extractTitle(lines, titleSection) {
  if (!titleSection) return null;
  for (let i = titleSection.startLine; i <= titleSection.endLine && i < lines.length; i += 1) {
    const text = lines[i].text.trim();
    if (!text || text.length > 80) continue;
    const labelled = /^(job title|title|position|role)\s*:\s*(.+)$/i.exec(text);
    if (labelled) return { value: labelled[2].trim(), ref: refOf(i, text, labelled[2].trim()), confidence: 0.85 };
    const isRole = ROLE_CUE.test(text);
    // The first short line is the title candidate; higher confidence if it reads like a role.
    if (i === titleSection.startLine || isRole) return { value: text, ref: refOf(i, text, null), confidence: isRole ? 0.8 : 0.5 };
  }
  return null;
}

/** Company only when explicitly stated ("Company: X" or "<role> at X"); never inferred. */
function extractCompany(lines, title) {
  for (const line of lines) {
    const labelled = /^(company|organization|employer)\s*:\s*(.+)$/i.exec(line.text);
    if (labelled) return { value: labelled[2].trim(), ref: refOf(line.index, line.text, labelled[2].trim()), confidence: 0.85 };
  }
  if (title && title.ref.lineIndex != null) {
    const line = lines[title.ref.lineIndex];
    const at = line && /\bat\s+([A-Z][A-Za-z0-9&.\- ]{1,40})$/.exec(line.text);
    if (at) return { value: at[1].trim(), ref: refOf(line.index, line.text, at[1].trim()), confidence: 0.7 };
  }
  return null;
}

/** Location and work mode, only from explicit cues. */
function extractLocation(lines) {
  let workMode = 'unknown';
  for (const line of lines) {
    for (const [mode, pattern] of jd.WORK_MODE) if (pattern.test(line.text)) { workMode = mode; break; }
    if (workMode !== 'unknown') break;
  }
  for (const line of lines) {
    const loc = jd.LOCATION_LINE.exec(line.text);
    if (loc) return { raw: loc[1].trim(), workMode, ref: refOf(line.index, line.text, loc[1].trim()) };
  }
  if (workMode !== 'unknown') {
    const line = lines.find((l) => jd.WORK_MODE.some(([, p]) => p.test(l.text)));
    if (line) return { raw: workMode, workMode, ref: refOf(line.index, line.text, null) };
  }
  return null;
}

function detectEmploymentType(lines) {
  const joined = lines.map((l) => l.text).join('\n');
  for (const [type, pattern] of jd.EMPLOYMENT_TYPE) if (pattern.test(joined)) return type;
  return 'unknown';
}

/** Seniority from the title first, then from a general years requirement. */
function deriveSeniority(title, requirements) {
  if (title) {
    for (const [level, pattern] of jd.SENIORITY_TITLE) {
      if (pattern.test(title.value)) return { level, basis: 'title', confidence: 0.8 };
    }
  }
  const years = requirements.find((r) => r.type === 'experience_years' && r.params.scope.kind === 'general');
  if (years) {
    const n = years.params.minYears;
    const level = n >= 8 ? 'staff' : n >= 5 ? 'senior' : n >= 2 ? 'mid' : 'entry';
    return { level, basis: 'years', confidence: 0.6 };
  }
  return { level: 'unknown', basis: 'none', confidence: 0.3 };
}

function extractSoftSkills(statements) {
  const byName = new Map();
  for (const statement of statements) {
    for (const [name, pattern] of jd.SOFT_SKILLS) {
      if (pattern.test(statement.text)) {
        if (!byName.has(name)) byName.set(name, new Set());
        byName.get(name).add(statement.id);
      }
    }
  }
  return [...byName.entries()].map(([name, ids]) => ({ name, statementIds: [...ids] }));
}

module.exports = { extractTitle, extractCompany, extractLocation, detectEmploymentType, deriveSeniority, extractSoftSkills };
