const { ResumeProfileSchema } = require('../../domain/contracts/resumeProfile');
const { parseContract } = require('../../domain/contracts');
const { detectSections } = require('./sections');
const { extractContact } = require('./contact');
const { buildExperience, buildProjects, buildEducation, buildCertifications } = require('./entries');
const { recognize } = require('../text/skills');

const PARSER_VERSION = '2.0.0-phase2';
const SKILL_DELIMITER = /[,;|•·]|\s+\/\s+|\s{2,}/;
const CATEGORY_LABEL = /^[A-Za-z][A-Za-z /&+]{0,30}:\s*/;

const contentItems = (lines, section) => {
  const items = [];
  for (let i = section.startLine + 1; i <= section.endLine; i += 1) items.push({ line: lines[i], index: i });
  return items;
};

/**
 * Parses a NormalizedDocument into a validated ResumeProfile.
 *
 * Extraction only; nothing is invented. Fields that cannot be confidently found
 * are null/empty and surfaced through diagnostics, never fabricated.
 *
 * @param {object} normalizedDocument  a validated NormalizedDocument
 * @param {{ referenceDate?: Date }} [options]
 */
function parseResume(normalizedDocument, { referenceDate = new Date() } = {}) {
  const { lines } = normalizedDocument;
  const sections = detectSections(lines);
  const sectionByLine = mapSectionsToLines(lines, sections);

  const headerSection = sections.find((s) => s.type === 'header');
  const headerLines = headerSection ? rangeItems(lines, headerSection.startLine, headerSection.endLine) : [];
  const contact = extractContact(lines, headerLines, normalizedDocument.links);

  const experience = concatByType(sections, 'experience', (content) => buildExperience(content, referenceDate), lines);
  const projects = concatByType(sections, 'projects', (content) => buildProjects(content, referenceDate), lines);
  const education = concatByType(sections, 'education', (content) => buildEducation(content, referenceDate), lines);
  const certifications = concatByType(sections, 'certifications', buildCertifications, lines);
  const summary = buildSummary(sections, lines);

  // Map each line to its owning entry/bullet so skill mentions carry context.
  const lineContext = buildLineContext(lines, sectionByLine, experience, projects, education, certifications);
  const skillMentions = buildSkillMentions(lines, lineContext);

  backfillSkills(experience, skillMentions);
  backfillSkills(projects, skillMentions);
  applyProjectTechStack(projects);
  const skillsSection = buildSkillsSection(sections, lines);

  const totals = computeTotals(experience);
  const diagnostics = buildDiagnostics(lines, sections, { experience, education, skillMentions, contact, skillsSection });

  const profile = {
    schemaVersion: '1',
    parserVersion: PARSER_VERSION,
    contact,
    sections: sections.map((s) => ({ id: s.id, type: s.type, heading: s.heading, startLine: s.startLine, endLine: s.endLine, confidence: s.confidence })),
    summary,
    experience: experience.map(stripInternals),
    projects: projects.map(stripInternals),
    education,
    certifications,
    skillMentions,
    skillsSection,
    achievements: buildAchievements(sections, lines),
    languages: buildLanguages(sections, lines),
    totals,
    diagnostics,
  };

  return parseContract(ResumeProfileSchema, profile, 'ResumeProfile');
}

function stripInternals(entry) {
  const { _lineRange, _techText, ...rest } = entry;
  return rest;
}

function rangeItems(lines, start, end) {
  const items = [];
  for (let i = start; i <= end && i < lines.length; i += 1) items.push({ line: lines[i], index: i });
  return items;
}

function concatByType(sections, type, builder, lines) {
  const out = [];
  for (const section of sections.filter((s) => s.type === type)) out.push(...builder(contentItems(lines, section)));
  return out;
}

function mapSectionsToLines(lines, sections) {
  const map = new Array(lines.length).fill('other');
  for (const section of sections) {
    for (let i = section.startLine; i <= section.endLine; i += 1) map[i] = section.type;
  }
  return map;
}

function buildSummary(sections, lines) {
  const section = sections.find((s) => s.type === 'summary');
  if (!section) return null;
  const items = contentItems(lines, section);
  const text = items.map((i) => i.line.text).join(' ').trim();
  if (!text) return null;
  return { text, refs: items.map((i) => ({ lineIndex: i.index, start: null, end: null })) };
}

function buildLineContext(lines, sectionByLine, experience, projects, education, certifications) {
  const context = lines.map((_, index) => ({ section: normalizeSectionType(sectionByLine[index]), entryId: null, bulletId: null }));
  const assign = (entries) => {
    for (const entry of entries) {
      if (entry._lineRange) {
        for (let i = entry._lineRange.start; i <= entry._lineRange.end; i += 1) if (context[i]) context[i].entryId = entry.id;
      }
      for (const bullet of entry.bullets || []) {
        const idx = bullet.ref.lineIndex;
        if (context[idx]) { context[idx].entryId = entry.id; context[idx].bulletId = bullet.id; }
      }
    }
  };
  assign(experience);
  assign(projects);
  for (const edu of education) for (const r of edu.refs) if (context[r.lineIndex]) context[r.lineIndex].entryId = edu.id;
  for (const cert of certifications) { const idx = cert.name.ref.lineIndex; if (context[idx]) context[idx].entryId = cert.id; }
  return context;
}

function normalizeSectionType(type) {
  const valid = ['header', 'summary', 'experience', 'projects', 'education', 'certifications', 'skills', 'achievements', 'publications', 'volunteering', 'languages', 'interests'];
  return valid.includes(type) ? type : 'other';
}

function buildSkillMentions(lines, lineContext) {
  const mentions = [];
  lines.forEach((line, index) => {
    const found = recognize(line.text);
    const hasUnambiguous = found.some((m) => !m.ambiguous);
    const ctx = lineContext[index];
    for (const m of found) {
      // Ambiguous single-letter/common terms are only kept with supporting context.
      if (m.ambiguous && ctx.section !== 'skills' && !hasUnambiguous) continue;
      mentions.push({
        skillId: m.skillId,
        surface: m.surface,
        ref: { lineIndex: index, start: m.start, end: m.end },
        section: ctx.section,
        entryId: ctx.entryId,
        bulletId: ctx.bulletId,
        recognition: m.recognition,
        ambiguous: m.ambiguous,
        confidence: m.confidence,
      });
    }
  });
  return mentions;
}

function backfillSkills(entries, mentions) {
  for (const entry of entries) {
    const ids = new Set();
    for (const m of mentions) if (m.entryId === entry.id) ids.add(m.skillId);
    entry.skillIds = [...ids];
    for (const bullet of entry.bullets || []) {
      const bulletIds = new Set();
      for (const m of mentions) if (m.bulletId === bullet.id) bulletIds.add(m.skillId);
      bullet.skillIds = [...bulletIds];
    }
  }
}

function applyProjectTechStack(projects) {
  for (const project of projects) {
    const ids = new Set();
    if (project._techText) for (const m of recognize(project._techText)) if (!m.ambiguous) ids.add(m.skillId);
    project.techStack = [...ids];
  }
}

function buildSkillsSection(sections, lines) {
  const items = [];
  const seen = new Set();
  for (const section of sections.filter((s) => s.type === 'skills')) {
    const texts = [];
    if (section.inlineContent) texts.push({ text: section.inlineContent, index: section.startLine });
    for (const item of contentItems(lines, section)) texts.push({ text: item.line.text, index: item.index });
    for (const { text, index } of texts) {
      const withoutLabel = text.replace(CATEGORY_LABEL, '');
      for (const raw of withoutLabel.split(SKILL_DELIMITER).map((s) => s.trim()).filter(Boolean)) {
        if (raw.length > 60 || seen.has(`${index}:${raw}`)) continue;
        seen.add(`${index}:${raw}`);
        const recognized = recognize(raw);
        items.push({ raw, skillId: recognized.length ? recognized[0].skillId : null, ref: { lineIndex: index, start: null, end: null } });
      }
    }
  }
  return items;
}

function buildAchievements(sections, lines) {
  const out = [];
  for (const section of sections.filter((s) => s.type === 'achievements')) {
    for (const item of contentItems(lines, section)) if (item.line.text.trim()) out.push({ text: item.line.text, ref: { lineIndex: item.index, start: null, end: null } });
  }
  return out;
}

function buildLanguages(sections, lines) {
  const out = [];
  for (const section of sections.filter((s) => s.type === 'languages')) {
    for (const item of contentItems(lines, section)) {
      for (const raw of item.line.text.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)) {
        const m = /^([A-Za-z ]+?)(?:\s*[(:-]\s*(.+?)\)?)?$/.exec(raw);
        if (m) out.push({ name: m[1].trim(), proficiency: m[2] ? m[2].trim() : null, ref: { lineIndex: item.index, start: null, end: null } });
      }
    }
  }
  return out;
}

function computeTotals(experience) {
  const toInterval = (dates) => {
    if (!dates || !dates.start) return null;
    const startAbs = dates.start.year * 12 + (dates.start.month || 1);
    // A current role has end:null by contract; use its computed duration for the endpoint.
    if (!dates.end) {
      if (dates.isCurrent && dates.duration) return [startAbs, startAbs + Math.max(0, dates.duration.bestMonths - 1)];
      return null;
    }
    const endAbs = dates.end.year * 12 + (dates.end.month || 12);
    return endAbs >= startAbs ? [startAbs, endAbs] : null;
  };
  const merge = (intervals) => {
    if (!intervals.length) return null;
    intervals.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [curStart, curEnd] = intervals[0];
    for (let i = 1; i < intervals.length; i += 1) {
      const [s, e] = intervals[i];
      if (s <= curEnd + 1) curEnd = Math.max(curEnd, e);
      else { total += curEnd - curStart + 1; [curStart, curEnd] = [s, e]; }
    }
    total += curEnd - curStart + 1;
    return { minMonths: total, bestMonths: total, maxMonths: total };
  };
  const professional = [];
  const internship = [];
  for (const exp of experience) {
    const interval = toInterval(exp.dates);
    if (!interval) continue;
    (exp.employmentType === 'internship' ? internship : professional).push(interval);
  }
  return { professionalMonths: merge(professional), internshipMonths: merge(internship) };
}

function buildDiagnostics(lines, sections, parts) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message, ref: null });

  if (parts.contact.emails.length === 0) push('NO_EMAIL', 'No email address was detected in the resume.');
  if (parts.experience.length === 0) push('NO_EXPERIENCE', 'No work experience entries were confidently detected.');
  const undated = parts.experience.filter((e) => !e.dates).length;
  if (undated > 0) push('UNDATED_EXPERIENCE', `${undated} experience entr${undated === 1 ? 'y has' : 'ies have'} no parseable dates.`);
  if (!sections.some((s) => s.type === 'education')) push('NO_EDUCATION_SECTION', 'No education section was confidently detected.');
  if (parts.skillMentions.length === 0 && parts.skillsSection.length === 0) push('NO_SKILLS', 'No skills were confidently detected.');

  const consumed = new Set();
  const mark = (i) => { if (i >= 0 && i < lines.length) consumed.add(i); };
  sections.forEach((s) => { if (s.type !== 'other' && s.type !== 'header') mark(s.startLine); });
  parts.contact.emails.forEach((e) => mark(e.ref.lineIndex));
  if (parts.contact.name) mark(parts.contact.name.ref.lineIndex);
  parts.experience.forEach((e) => { e.headerRefs.forEach((r) => mark(r.lineIndex)); e.bullets.forEach((b) => mark(b.ref.lineIndex)); });
  parts.skillMentions.forEach((m) => mark(m.ref.lineIndex));
  parts.skillsSection.forEach((s) => mark(s.ref.lineIndex));

  return { unassignedLineCount: Math.max(0, lines.length - consumed.size), warnings };
}

module.exports = { parseResume, PARSER_VERSION };
