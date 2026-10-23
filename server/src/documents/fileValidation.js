const { AppError } = require('../shared/errors');

/**
 * Validates an uploaded document by its actual bytes, not its filename or the
 * client-supplied MIME type. Returns a resolved source kind, or throws an
 * AppError with a canonical code (415 / 413 / 422).
 */

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_BYTES = 8;
// Text is capped far below the upload limit: a larger file cannot fit the analysis
// character limits, so it is rejected before it is decoded and normalized.
const MAX_TEXT_BYTES = 1024 * 1024;
// A .docx is a ZIP, so a small upload can expand enormously. Real resumes hold well
// under 1 MB of XML; anything declaring more than this is refused before unzipping.
const MAX_DOCX_XML_BYTES = 10 * 1024 * 1024;

const KINDS = Object.freeze({ pdf: 'pdf', docx: 'docx', txt: 'txt' });

/** @returns {'pdf'|'docx'|'txt'|null} the kind inferred from the leading bytes, or null. */
function sniffKind(buffer) {
  if (buffer.length >= 5 && buffer.toString('latin1', 0, 5) === '%PDF-') return KINDS.pdf;
  // DOCX is a ZIP (PK\x03\x04); distinguished from a plain zip by its content type entry.
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    const head = buffer.toString('latin1', 0, Math.min(buffer.length, 4096));
    if (head.includes('word/') || head.includes('[Content_Types].xml')) return KINDS.docx;
    return null; // a zip that is not a Word document
  }
  return null;
}

/**
 * Total uncompressed size the ZIP directory declares for its XML parts, or null
 * if the directory cannot be read (the extractor then reports the file as corrupt).
 * Sizes are read from the archive's own directory, without decompressing anything.
 */
function declaredXmlBytes(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > buffer.length) return null;
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  let total = 0;
  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('latin1', offset + 46, offset + 46 + nameLength);
    if (/.(xml|rels)$/i.test(name)) total += buffer.readUInt32LE(offset + 24);
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  return total;
}

/** True when the buffer contains no NUL byte in its first chunk (i.e. plausibly text, not binary). */
function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return !sample.includes(0x00);
}

const EXTENSION_KIND = { '.pdf': KINDS.pdf, '.docx': KINDS.docx, '.txt': KINDS.txt, '.text': KINDS.txt };

function extensionOf(filename) {
  const match = /(\.[a-z0-9]+)$/i.exec(String(filename || '').trim());
  return match ? match[1].toLowerCase() : '';
}

/**
 * @param {Buffer} buffer
 * @param {{ filename?: string, mimeType?: string, maxBytes?: number }} meta
 * @returns {{ kind: 'pdf'|'docx'|'txt', sizeBytes: number, filename: string|null }}
 */
function validateUpload(buffer, { filename, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new AppError('UNPROCESSABLE_DOCUMENT', { message: 'No file content was provided.' });
  if (buffer.length === 0) throw new AppError('UNPROCESSABLE_DOCUMENT', { message: 'The uploaded file is empty.' });
  if (buffer.length < MIN_BYTES) throw new AppError('UNPROCESSABLE_DOCUMENT', { message: 'The uploaded file is too small to be a valid document.' });
  if (buffer.length > maxBytes) {
    throw new AppError('PAYLOAD_TOO_LARGE', { message: `The file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit.` });
  }

  const ext = extensionOf(filename);
  const sniffed = sniffKind(buffer);

  if (sniffed === KINDS.pdf) return { kind: KINDS.pdf, sizeBytes: buffer.length, filename: filename || null };
  if (sniffed === KINDS.docx) {
    if (declaredXmlBytes(buffer) > MAX_DOCX_XML_BYTES) {
      throw new AppError('PAYLOAD_TOO_LARGE', { message: 'This Word document is too large to process once unpacked.' });
    }
    return { kind: KINDS.docx, sizeBytes: buffer.length, filename: filename || null };
  }

  // A ZIP that is not a DOCX, or a PDF-looking extension without the %PDF- header.
  if (ext === '.pdf') throw new AppError('UNSUPPORTED_MEDIA_TYPE', { message: 'This file is named like a PDF but its content is not a valid PDF.' });
  if (ext === '.docx') throw new AppError('UNSUPPORTED_MEDIA_TYPE', { message: 'This file is named like a Word document but its content is not a valid .docx.' });

  // Everything else must be plain text.
  if (looksLikeText(buffer)) {
    if (ext && !EXTENSION_KIND[ext]) {
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', { message: `Unsupported file type "${ext}". Upload a PDF, DOCX or TXT file.` });
    }
    if (buffer.length > MAX_TEXT_BYTES) {
      throw new AppError('PAYLOAD_TOO_LARGE', { message: 'Text files are limited to 1 MB.' });
    }
    return { kind: KINDS.txt, sizeBytes: buffer.length, filename: filename || null };
  }

  throw new AppError('UNSUPPORTED_MEDIA_TYPE', { message: 'Unsupported or unreadable file. Upload a PDF, DOCX or TXT file.' });
}

module.exports = { validateUpload, sniffKind, looksLikeText, extensionOf, DEFAULT_MAX_BYTES, MAX_TEXT_BYTES, MAX_DOCX_XML_BYTES, KINDS };
