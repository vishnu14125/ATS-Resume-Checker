const { validateUpload, DEFAULT_MAX_BYTES } = require('./fileValidation');
const { extractPdf } = require('./extractors/pdf');
const { extractDocx } = require('./extractors/docx');
const { extractText, extractPastedText } = require('./extractors/text');
const { normalizeDocument } = require('./normalize');

/**
 * The single ingestion path for every resume source:
 *   file  → validate → extract (pdf | docx | txt) → normalize → NormalizedDocument
 *   paste →                       extract (paste)  → normalize → NormalizedDocument
 * Pasted text and uploaded files converge on the same normalization and contract.
 */

const EXTRACTORS = { pdf: extractPdf, docx: extractDocx, txt: extractText };

async function ingestFile(buffer, { filename, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const { kind } = validateUpload(buffer, { filename, maxBytes });
  const raw = await EXTRACTORS[kind](buffer);
  return normalizeDocument(raw);
}

async function ingestPastedText(text) {
  const raw = extractPastedText(text);
  return normalizeDocument(raw);
}

module.exports = { ingestFile, ingestPastedText };
