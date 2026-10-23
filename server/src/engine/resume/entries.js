const { makeId } = require('../text/ids');
const { findDateRange, parseSingleDate } = require('../text/dates');
const {
  ROLE_CUE, ORG_CUE, EMPLOYMENT_TYPES, DEGREE_LEVELS, AMBIGUOUS_DEGREE, FIELD_OF_STUDY,
  INSTITUTION_CUE, CERTIFICATIONS, ACTION_VERBS, detectMetrics,
} = require('../text/lexicons');

const SEPARATORS = /\s+(?:at|@)\s+|\s*[|–—]\s*|\s+-\s+|,\s*/;
const LOCATION = /\b([A-Z][A-Za-z.]+(?:\s[A-Z][A-Za-z.]+)*),\s*([A-Z]{2}|[A-Z][A-Za-z]+)\b/;

const ref = (lineIndex, text, match) => {
  const at = match && typeof text === 'string' ? text.indexOf(match) : -1;
  return at >= 0 ? { lineIndex, start: at, end: at + match.length } : { lineIndex, start: null, end: null };
};
const field = (value, lineIndex, text, match, confidence) =>
  (value ? { value, ref: ref(lineIndex, text, match), confidence } : null);

/** Groups a section's content lines into header-block + bullets records. */
function groupEntries(contentLines) {
  const groups = [];
  let current = null;
  for (const item of contentLines) {
    const { line } = item;
    const hasDate = Boolean(findDateRange(line.text));
    if (!line.isBullet) {
      const startNew = !current || current.sawBullet || line.blankLineBefore || (hasDate && current.hasDate);
      if (startNew) { current = { headers: [], bullets: [], extras: [], sawBullet: false, hasDate: false }; groups.push(current); }
      if (current.sawBullet) { /* handled by startNew */ }
      if (current.bullets.length === 0 && current.headers.length < 5) current.headers.push(item);
      else current.extras.push(item);
      if (hasDate) current.hasDate = true;
    } else if (current) {
      current.bullets.push(item);
      current.sawBullet = true;
    } else {
      current = { headers: [], bullets: [item], extras: [], sawBullet: true, hasDate: false };
      groups.push(current);
    }
  }
  return groups.filter((g) => g.headers.length || g.bullets.length);
}

function buildBullet(item) {
  const first = item.line.text.split(/\s+/)[0] || '';
  const lemma = first.toLowerCase().replace(/[^a-z]/g, '');
  const actionVerb = ACTION_VERBS.has(lemma) ? lemma : null;
  return {
    id: makeId('blt', String(item.index), item.line.text),
    ref: ref(item.index, item.line.text, null),
    text: item.line.text,
    actionVerb,
    metrics: detectMetrics(item.line.text),
    skillIds: [],
  };
}

function detectEmploymentType(text) {
  for (const [type, pattern] of EMPLOYMENT_TYPES) if (pattern.test(text)) return type;
  return 'full_time';
}

/** Splits a header piece into { title, organization } using separators and role cues. */
function splitTitleOrg(piece) {
  const parts = piece.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const roleIdx = parts.findIndex((p) => ROLE_CUE.test(p));
    if (roleIdx >= 0) {
      const title = parts[roleIdx];
      const org = parts.filter((_, i) => i !== roleIdx).find((p) => ORG_CUE.test(p)) || parts.find((_, i) => i !== roleIdx);
      return { title, organization: org || null };
    }
    const orgIdx = parts.findIndex((p) => ORG_CUE.test(p));
    if (orgIdx >= 0) return { title: parts.find((_, i) => i !== orgIdx) || null, organization: parts[orgIdx] };
    return { title: parts[0], organization: parts[1] };
  }
  if (ROLE_CUE.test(piece)) return { title: piece, organization: null };
  if (ORG_CUE.test(piece)) return { title: null, organization: piece };
  return { title: piece, organization: null };
}

function buildExperience(contentLines, referenceDate) {
  return groupEntries(contentLines).map((group) => {
    let dates = null;
    let dateLineIndex = null;
    const pieces = [];
    for (const { line, index } of group.headers) {
      const found = findDateRange(line.text, referenceDate);
      if (found && !dates) { dates = found; dateLineIndex = index; }
      const withoutDate = found ? line.text.replace(found.sourceText, '').replace(/[()\-–—|]+\s*$/, '').trim() : line.text;
      if (withoutDate) pieces.push({ text: withoutDate, index });
    }

    const headerText = pieces.map((p) => p.text).join(' ');
    let title = null;
    let organization = null;
    for (const piece of pieces) {
      const split = splitTitleOrg(piece.text);
      if (!title && split.title) title = field(split.title, piece.index, piece.text, split.title, 0.75);
      if (!organization && split.organization) organization = field(split.organization, piece.index, piece.text, split.organization, 0.75);
    }
    const locMatch = LOCATION.exec(headerText);
    const location = locMatch ? field(locMatch[0], pieces[0]?.index ?? group.headers[0]?.index ?? 0, headerText, locMatch[0], 0.5) : null;

    const headerRefs = group.headers.map((h) => ref(h.index, h.line.text, null));
    const bullets = [...group.bullets, ...group.extras.filter((e) => e.line.isBullet)].map(buildBullet);
    const descriptionRefs = group.extras.filter((e) => !e.line.isBullet).map((e) => ref(e.index, e.line.text, null));

    return {
      id: makeId('exp', String(group.headers[0]?.index ?? group.bullets[0]?.index ?? 0), headerText),
      title,
      organization,
      location,
      employmentType: detectEmploymentType(headerText),
      dates,
      headerRefs,
      bullets,
      descriptionRefs,
      skillIds: [],
      _lineRange: lineRange(group),
    };
  });
}

function buildProjects(contentLines, referenceDate) {
  return groupEntries(contentLines).map((group) => {
    const header = group.headers[0];
    const headerText = group.headers.map((h) => h.line.text).join(' ');
    // "Name | tech, tech" or "Name (tech)" or "Name – description".
    let name = null;
    let techInline = '';
    if (header) {
      const nameMatch = /^([^|(–—]+?)(?:\s*[|(–—]\s*(.*))?$/.exec(header.line.text);
      const rawName = (nameMatch ? nameMatch[1] : header.line.text).trim().replace(/\)$/, '');
      name = field(rawName, header.index, header.line.text, rawName, 0.7);
      if (nameMatch && nameMatch[2]) techInline = nameMatch[2].replace(/\)$/, '');
    }
    const techLine = group.headers.concat(group.extras).find((h) => /^(tech(nolog(y|ies))?|stack|tools?|built with)\s*:/i.test(h.line.text));
    const dates = header ? findDateRange(headerText, referenceDate) : null;
    const links = collectUrls(headerText).concat(group.bullets.flatMap((b) => collectUrls(b.line.text)));

    const bullets = [...group.bullets, ...group.extras.filter((e) => e.line.isBullet)].map(buildBullet);
    return {
      id: makeId('proj', String(header?.index ?? 0), headerText),
      name,
      context: detectProjectContext(headerText),
      dates,
      links: [...new Set(links)],
      techStack: [],
      headerRefs: group.headers.map((h) => ref(h.index, h.line.text, null)),
      bullets,
      skillIds: [],
      _techText: `${techInline} ${techLine ? techLine.line.text : ''}`.trim(),
      _lineRange: lineRange(group),
    };
  });
}

function detectProjectContext(text) {
  if (/\bhackathon\b/i.test(text)) return 'hackathon';
  if (/\b(academic|course|university|college|capstone)\b/i.test(text)) return 'academic';
  if (/\b(open[- ]source|oss)\b/i.test(text)) return 'open_source';
  if (/\b(personal|side)\b/i.test(text)) return 'personal';
  return 'unknown';
}

function buildEducation(contentLines, referenceDate) {
  return groupEntries(contentLines).map((group) => {
    const allLines = [...group.headers, ...group.extras];
    let degree = null;
    let institution = null;
    let fieldOfStudy = null;
    let dates = null;
    let gpa = null;
    let status = 'completed';

    for (const { line, index } of allLines) {
      const text = line.text;
      // Split combined lines like "B.S. Computer Science - State University (2016-2020)" into segments.
      const segments = text.split(/\s+[-–—|]\s+/).map((s) => s.trim()).filter(Boolean);
      const candidates = segments.length ? segments : [text];

      if (!degree) {
        for (const seg of candidates) {
          const level = matchDegreeLevel(seg);
          if (level) { degree = { raw: seg, level, ref: ref(index, text, seg) }; break; }
        }
      }
      if (!institution) {
        const instSeg = candidates.find((seg) => INSTITUTION_CUE.test(seg));
        if (instSeg) {
          const clean = instSeg.replace(/\s*\((?:[^)]*\d{4}[^)]*)\)\s*$/, '').replace(/\s*[,-]?\s*(?:19|20)\d{2}\s*[-–]\s*(?:present|current|(?:19|20)\d{2})\s*$/i, '').trim();
          institution = field(clean || instSeg, index, text, clean || instSeg, 0.7);
        }
      }
      if (!fieldOfStudy) {
        const fos = matchField(text);
        if (fos) fieldOfStudy = { raw: fos.raw, fieldId: fos.id };
      }
      if (!dates) dates = findDateRange(text, referenceDate);
      if (!gpa) {
        const g = /\b(?:gpa|cgpa)\s*[:=]?\s*(\d\.?\d*)\s*\/\s*(\d\.?\d*)\b/i.exec(text) || /\b(\d\.\d{1,2})\s*\/\s*(\d{1,2}(?:\.\d)?)\b/.exec(text);
        if (g) gpa = { value: Number(g[1]), scale: Number(g[2]) };
      }
      if (/\b(expected|present|ongoing|pursuing|in progress)\b/i.test(text)) status = 'in_progress';
    }
    if (!degree && !institution && !fieldOfStudy) {
      // Fall back to the first line as the institution so the entry is not empty.
      const first = allLines[0];
      if (first) institution = field(first.line.text.trim(), first.index, first.line.text, first.line.text.trim(), 0.4);
    }

    return {
      id: makeId('edu', String(group.headers[0]?.index ?? 0), allLines.map((l) => l.line.text).join(' ')),
      institution,
      degree,
      fieldOfStudy,
      dates,
      status,
      gpa,
      honors: [],
      refs: allLines.map((l) => ref(l.index, l.line.text, null)),
    };
  });
}

function buildCertifications(contentLines) {
  const certs = [];
  for (const { line, index } of contentLines) {
    if (line.isBullet && line.text.length < 3) continue;
    const text = line.text.trim();
    if (!text) continue;
    let matched = null;
    for (const [id, pattern, issuer] of CERTIFICATIONS) {
      if (pattern.test(text)) { matched = { id, issuer }; break; }
    }
    const yearMatch = /\b(19|20)\d{2}\b/.exec(text);
    const issued = yearMatch ? parseSingleDate(yearMatch[0]) : null;
    const status = /\b(in progress|pursuing|expected)\b/i.test(text) ? 'in_progress' : (matched ? 'active' : 'unknown');
    certs.push({
      id: makeId('cert', String(index), text),
      name: field(text.replace(/\s*[-–]\s*(19|20)\d{2}.*$/, '').trim() || text, index, text, null, matched ? 0.9 : 0.6),
      certificationId: matched ? matched.id : null,
      issuer: matched ? matched.issuer : null,
      issued,
      expires: null,
      status,
    });
  }
  return certs;
}

function matchDegreeLevel(text) {
  for (const [level, pattern] of DEGREE_LEVELS) if (pattern.test(text)) return level;
  if (AMBIGUOUS_DEGREE.test(text)) {
    const m = AMBIGUOUS_DEGREE.exec(text)[1].toLowerCase();
    if (m.startsWith('m')) return 'master';
    if (m.startsWith('b')) return 'bachelor';
  }
  return null;
}

function matchField(text) {
  for (const [id, pattern] of FIELD_OF_STUDY) {
    const m = pattern.exec(text);
    if (m) return { id, raw: m[0] };
  }
  return null;
}

function collectUrls(text) {
  return (text.match(/\bhttps?:\/\/[^\s<>()]+/gi) || []).map((u) => u.replace(/[.,;:)]+$/, ''));
}

function lineRange(group) {
  const indexes = [...group.headers, ...group.bullets, ...group.extras].map((i) => i.index);
  return indexes.length ? { start: Math.min(...indexes), end: Math.max(...indexes) } : { start: 0, end: 0 };
}

module.exports = { buildExperience, buildProjects, buildEducation, buildCertifications, groupEntries };
