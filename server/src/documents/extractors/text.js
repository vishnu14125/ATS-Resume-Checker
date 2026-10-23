const { AppError } = require('../../shared/errors');

const EXTRACTOR = 'text-decoder';

/** Decodes a text buffer as UTF-8, or UTF-16 when a byte-order mark is present. */
function decodeBuffer(buffer) {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le').replace(/^﻿/, '');
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.from(buffer);
      swapped.swap16();
      return swapped.toString('utf16le').replace(/^﻿/, '');
    }
  }
  return buffer.toString('utf8').replace(/^﻿/, '');
}

/** Splits already-decoded text into raw lines. Shared by TXT files and pasted text. */
function textToRawExtraction(text, kind) {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  const lines = rawLines.map((line) => ({
    text: line, page: null, fontSize: null, bold: null, isBullet: false, bulletGlyph: null, indentLevel: null,
  }));
  return {
    kind,
    extractor: kind === 'paste' ? 'paste' : EXTRACTOR,
    extractorVersion: '1',
    pageCount: null,
    lines,
    links: [],
    layout: { multiColumnSuspected: false, tableCount: 0, headerFooterLineIndexes: null },
    warnings: [],
  };
}

function extractText(buffer) {
  const text = decodeBuffer(buffer);
  if (!text.trim()) throw new AppError('UNPROCESSABLE_DOCUMENT', { message: 'The text file is empty.', details: { reason: 'no_text_layer' } });
  return textToRawExtraction(text, 'txt');
}

/** Pasted resume text goes through exactly the same normalization as files. */
function extractPastedText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new AppError('UNPROCESSABLE_DOCUMENT', { message: 'No resume text was provided.', details: { reason: 'no_text_layer' } });
  }
  return textToRawExtraction(text, 'paste');
}

module.exports = { extractText, extractPastedText, decodeBuffer, textToRawExtraction, EXTRACTOR };
