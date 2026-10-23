const { JD_SECTION_HEADINGS } = require('../text/jdLexicons');
const { makeId } = require('../text/ids');

function headingKey(text) {
  return text.toLowerCase().replace(/[:.\s]+$/, '').replace(/&/g, 'and').trim();
}

/**
 * Detects a JD section heading. Handles "Requirements: React, Node" by splitting
 * on the first ':' (label is the heading, remainder is inline content).
 * @returns {{ type, inlineContent: string|null } | null}
 */
function matchHeading(text) {
  const trimmed = text.trim();
  if (trimmed.length > 60) return null;

  const colon = trimmed.indexOf(':');
  if (colon > 0) {
    const type = headingType(trimmed.slice(0, colon));
    if (type) return { type, inlineContent: trimmed.slice(colon + 1).trim() || null };
  }
  const type = headingType(trimmed);
  return type ? { type, inlineContent: null } : null;
}

function headingType(label) {
  if (label.trim().split(/\s+/).length > 6) return null;
  const key = headingKey(label);
  for (const [type, pattern] of JD_SECTION_HEADINGS) if (pattern.test(key)) return type;
  return null;
}

/**
 * Splits a JD's NormalizedDocument lines into sections. The lines before the
 * first heading become a 'title' section (which usually holds the job title and
 * an intro). Each heading may carry inline content after "Heading:".
 * @returns {Array<{ id, type, heading, startLine, endLine, inlineContent }>}
 */
function detectJobSections(lines) {
  const headings = [];
  lines.forEach((line, index) => {
    const match = matchHeading(line.text);
    if (match) headings.push({ index, type: match.type, headingText: line.text.replace(/:\s*.*$/, '').trim(), inlineContent: match.inlineContent });
  });

  const sections = [];
  if (lines.length === 0) return sections;

  const firstHeadingIndex = headings.length ? headings[0].index : lines.length;
  if (firstHeadingIndex > 0) {
    sections.push({ id: makeId('sec', 'title', '0'), type: 'title', heading: null, startLine: 0, endLine: firstHeadingIndex - 1, inlineContent: null });
  }

  headings.forEach((heading, i) => {
    const endLine = i + 1 < headings.length ? headings[i + 1].index - 1 : lines.length - 1;
    sections.push({
      id: makeId('sec', heading.type, String(heading.index)),
      type: heading.type,
      heading: heading.headingText || null,
      startLine: heading.index,
      endLine,
      inlineContent: heading.inlineContent,
    });
  });

  return sections;
}

module.exports = { detectJobSections, matchHeading };
