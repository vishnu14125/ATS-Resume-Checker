const { makeId } = require('../text/ids');

// Sentence splitter that does not break on common abbreviations, version numbers,
// decimals or "Node.js"-style tokens.
const PROTECT = [
  [/\b([A-Za-z])\.([A-Za-z])\./g, '$1\u0001$2\u0001'], // e.g., i.e., U.S.
  [/\b(Node|Vue|Next|Express|Nest)\.js\b/gi, '$1\u0001js'], // Node.js
  [/\b(\d+)\.(\d+)\b/g, '$1\u0001$2'], // version/decimals
  [/\b([A-Za-z])\.(net|NET)\b/g, '$1\u0001net'], // .net already handled; asp.net safety
];

function protect(text) {
  let out = text;
  for (const [re, rep] of PROTECT) out = out.replace(re, rep);
  return out;
}
function restore(text) {
  return text.replace(/\u0001/g, '.');
}

/** Splits a line of prose into sentences (bullets are already one statement each). */
function splitSentences(text) {
  const protectedText = protect(text);
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => restore(s).trim())
    .filter((s) => s.length > 0);
}

/**
 * Builds atomic statements from the content-bearing JD sections. Each bullet is
 * one statement; non-bullet prose is split into sentences. Statements are the
 * units that requirements reference via sourceStatementIds.
 *
 * @param {object[]} lines  NormalizedDocument lines
 * @param {object[]} sections  from detectJobSections
 * @returns {Array<{ id, section, text, refs:[{lineIndex,start,end}] }>}
 */
function buildStatements(lines, sections) {
  const statements = [];
  const seen = new Set();
  const add = (section, text, lineIndex) => {
    const clean = text.trim();
    if (clean.length < 2) return;
    const key = `${lineIndex}:${clean}`;
    if (seen.has(key)) return;
    seen.add(key);
    statements.push({
      id: makeId('stm', String(lineIndex), clean),
      section,
      text: clean,
      refs: [{ lineIndex, start: null, end: null }],
    });
  };

  for (const section of sections) {
    // Inline content after "Heading:" belongs to the heading line.
    if (section.inlineContent) {
      if (isListy(section.inlineContent)) splitList(section.inlineContent).forEach((item) => add(section.type, item, section.startLine));
      else add(section.type, section.inlineContent, section.startLine);
    }
    for (let i = section.startLine + 1; i <= section.endLine && i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.text.trim()) continue;
      if (line.isBullet) add(section.type, line.text, i);
      else if (isListy(line.text)) splitList(line.text).forEach((item) => add(section.type, item, i));
      else splitSentences(line.text).forEach((sentence) => add(section.type, sentence, i));
    }
  }
  return statements;
}

// A short, comma/slash-separated line (e.g. "React, Node.js, Docker") is a list,
// not prose; split it so each item can become its own statement.
function isListy(text) {
  const commas = (text.match(/,/g) || []).length;
  return commas >= 2 && text.length < 160 && !/[.!?]$/.test(text.trim());
}
function splitList(text) {
  return text.split(/[,;]|\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
}

module.exports = { buildStatements, splitSentences };
