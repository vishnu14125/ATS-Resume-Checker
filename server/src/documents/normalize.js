const crypto = require('crypto');
const { NormalizedDocumentSchema } = require('../domain/contracts/document');
const { parseContract } = require('../domain/contracts');
const { AppError } = require('../shared/errors');

/**
 * Turns a raw extraction (from any extractor) into a validated NormalizedDocument.
 *
 * Lossless by contract: `original` keeps each line exactly as extracted, and the
 * normalized `text` only ever (a) applies Unicode NFKC, (b) removes invisible
 * characters, (c) maps exotic spaces to a normal space, (d) lifts a leading
 * bullet glyph into a flag, and (e) collapses runs of whitespace within a line.
 * Meaningful characters (@ + # / – • % $ & | letters, digits, URLs) are preserved.
 */

// Zero-width and formatting characters that carry no meaning for parsing.
const INVISIBLE = /[​-‍⁠﻿­᠎]/g;
// Spaces that should render as an ordinary space.
const EXOTIC_SPACE = /[   -   　]/g;
// Leading list markers (glyph or hyphen/asterisk) followed by whitespace.
const BULLET_LEADER = /^(\s*)([•▪●◦‣⁃∙·■▸►–—*-])\s+/;
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>()]+/gi;

function normalizeLineText(raw) {
  let text = raw.normalize('NFKC').replace(INVISIBLE, '').replace(EXOTIC_SPACE, ' ');
  let bulletGlyph = null;
  let indentLevel = null;
  const bullet = BULLET_LEADER.exec(text);
  if (bullet) {
    indentLevel = Math.min(6, Math.ceil(bullet[1].replace(/\t/g, '  ').length / 2));
    bulletGlyph = bullet[2];
    text = text.slice(bullet[0].length);
  }
  text = text.replace(/[ \t]+/g, ' ').trim();
  return { text, bulletGlyph, indentLevel };
}

function hasLetters(text) {
  return /\p{L}/u.test(text);
}

function isAllCaps(text) {
  return hasLetters(text) && text === text.toUpperCase() && text.toUpperCase() !== text.toLowerCase();
}

function countMatches(text, regex) {
  const m = text.match(regex);
  return m ? m.length : 0;
}

/**
 * @param {object} raw  a raw extraction: { kind, extractor, extractorVersion, pageCount, lines, links, layout, warnings }
 * @returns {object} a validated NormalizedDocument
 */
function normalizeDocument(raw) {
  const lines = [];
  let pendingBlankBefore = false;

  for (const rawLine of raw.lines) {
    const originalText = typeof rawLine.text === 'string' ? rawLine.text : '';
    const { text, bulletGlyph, indentLevel } = normalizeLineText(originalText);

    if (text.length === 0) {
      pendingBlankBefore = true; // a blank source line becomes a flag on the next kept line
      continue;
    }

    const extractorBullet = rawLine.isBullet === true;
    lines.push({
      index: lines.length,
      text,
      original: originalText,
      page: rawLine.page ?? null,
      isBullet: Boolean(bulletGlyph) || extractorBullet,
      bulletGlyph: bulletGlyph || (extractorBullet ? rawLine.bulletGlyph || '•' : null),
      indentLevel: indentLevel !== null ? indentLevel : (extractorBullet ? rawLine.indentLevel ?? 1 : null),
      style: {
        fontSize: typeof rawLine.fontSize === 'number' && rawLine.fontSize > 0 ? rawLine.fontSize : null,
        bold: typeof rawLine.bold === 'boolean' ? rawLine.bold : null,
        allCaps: isAllCaps(text),
      },
      blankLineBefore: pendingBlankBefore,
    });
    pendingBlankBefore = false;
  }

  if (lines.length === 0) {
    throw new AppError('UNPROCESSABLE_DOCUMENT', { message: 'The document contained no readable text after normalization.', details: { reason: 'no_text_layer' } });
  }

  const normalizedText = lines.map((l) => l.text).join('\n');
  const charCount = normalizedText.length;
  const wordCount = (normalizedText.match(/\S+/g) || []).length;

  // Map hyperlink/annotation URLs to a line, and enrich with any bare URLs in the text.
  const links = [];
  const seen = new Set();
  const addLink = (url, anchorText, lineIndex) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ url, anchorText: anchorText || null, lineIndex: lineIndex ?? null });
  };
  for (const link of raw.links || []) {
    const idx = lines.findIndex((l) => l.text.includes(link.url) || (link.anchorText && l.text.includes(link.anchorText)));
    addLink(link.url, link.anchorText, idx >= 0 ? idx : null);
  }
  lines.forEach((line) => {
    const found = line.text.match(URL_IN_TEXT);
    if (found) found.forEach((url) => addLink(url.replace(/[.,;:)]+$/, ''), null, line.index));
  });

  const document = {
    schemaVersion: '1',
    source: {
      kind: raw.kind,
      extractor: raw.extractor,
      extractorVersion: String(raw.extractorVersion || '1'),
      pageCount: raw.pageCount ?? null,
    },
    lines,
    links,
    layout: {
      multiColumnSuspected: raw.layout?.multiColumnSuspected ?? null,
      tableCount: raw.layout?.tableCount ?? null,
      headerFooterLineIndexes: raw.layout?.headerFooterLineIndexes ?? null,
    },
    stats: {
      charCount,
      wordCount,
      lineCount: lines.length,
      nonAsciiRatio: charCount === 0 ? 0 : countMatches(normalizedText, /[^\x00-\x7F]/g) / charCount,
      replacementCharCount: countMatches(normalizedText, /�/g),
      privateUseCharCount: countMatches(normalizedText, /[-]/g),
    },
    warnings: (raw.warnings || []).map((w) => ({ code: w.code, message: w.message })),
    textHash: crypto.createHash('sha256').update(normalizedText, 'utf8').digest('hex'),
  };

  return parseContract(NormalizedDocumentSchema, document, 'NormalizedDocument');
}

module.exports = { normalizeDocument, normalizeLineText };
