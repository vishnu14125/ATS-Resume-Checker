const { SECTION_HEADINGS } = require('../text/lexicons');
const { makeId } = require('../text/ids');

/** Normalizes a candidate heading for matching: lower-case, drop trailing ':', '&' → 'and'. */
function headingKey(text) {
  return text.toLowerCase().replace(/[:.\s]+$/, '').replace(/&/g, 'and').trim();
}

/**
 * Detects the section type of a line. Handles "Skills: React, Node" by splitting
 * on the first ':' — the label is the heading and the remainder is inline content.
 * @returns {{ type, inlineContent: string|null } | null}
 */
function matchHeading(text) {
  const trimmed = text.trim();
  if (trimmed.length > 60) return null;

  const colon = trimmed.indexOf(':');
  if (colon > 0) {
    const label = trimmed.slice(0, colon);
    const rest = trimmed.slice(colon + 1).trim();
    const type = headingType(label);
    if (type) return { type, inlineContent: rest || null };
  }
  const type = headingType(trimmed);
  if (type) return { type, inlineContent: null };
  return null;
}

function headingType(label) {
  if (label.trim().split(/\s+/).length > 6) return null;
  const key = headingKey(label);
  for (const [type, pattern] of SECTION_HEADINGS) if (pattern.test(key)) return type;
  return null;
}

function headingConfidence(line) {
  let confidence = 0.7;
  if (line.style.allCaps) confidence += 0.12;
  if (line.style.bold) confidence += 0.1;
  if (line.blankLineBefore) confidence += 0.06;
  return Math.min(0.98, Number(confidence.toFixed(2)));
}

/**
 * Splits a NormalizedDocument's lines into sections.
 * @returns {Array<{ id, type, heading, startLine, endLine, confidence, inlineContent }>}
 *          Content before the first heading is a 'header' section. `inlineContent`
 *          (if set) is text that appeared after "Heading:" on the heading line.
 */
function detectSections(lines) {
  const headings = [];
  lines.forEach((line, index) => {
    const match = matchHeading(line.text);
    if (match) headings.push({ index, type: match.type, headingText: line.text.replace(/:\s*.*$/, '').trim(), inlineContent: match.inlineContent, confidence: headingConfidence(line) });
  });

  const sections = [];
  if (lines.length === 0) return sections;

  const firstHeadingIndex = headings.length ? headings[0].index : lines.length;
  if (firstHeadingIndex > 0) {
    sections.push({ id: makeId('sec', 'header', '0'), type: 'header', heading: null, startLine: 0, endLine: firstHeadingIndex - 1, confidence: 0.6, inlineContent: null });
  }

  headings.forEach((heading, i) => {
    const endLine = i + 1 < headings.length ? headings[i + 1].index - 1 : lines.length - 1;
    sections.push({
      id: makeId('sec', heading.type, String(heading.index)),
      type: heading.type,
      heading: heading.headingText || null,
      startLine: heading.index,
      endLine,
      confidence: heading.confidence,
      inlineContent: heading.inlineContent,
    });
  });

  return sections;
}

module.exports = { detectSections, matchHeading, headingType };
