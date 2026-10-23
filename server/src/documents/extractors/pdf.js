const { AppError } = require('../../shared/errors');

const EXTRACTOR = 'pdfjs-dist';
const MAX_PAGES = 15;

// We extract text only and never render, so the browser canvas APIs pdfjs would
// otherwise polyfill via the optional native `canvas` module are not needed.
// Providing minimal globals makes pdfjs skip that polyfill (and its noisy warning)
// entirely, without pulling in a native dependency.
function stubCanvasGlobals() {
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix {};
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D {};
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData {};
}

let pdfjsModule = null;
function loadPdfjs() {
  if (pdfjsModule) return pdfjsModule;
  stubCanvasGlobals();
  // eslint-disable-next-line global-require
  pdfjsModule = require('pdfjs-dist/legacy/build/pdf.js');
  return pdfjsModule;
}

/** Groups text items sharing a baseline into a single line, ordered left-to-right. */
function reconstructLines(items, pageNumber) {
  const positioned = items
    .filter((it) => typeof it.str === 'string' && it.str.length > 0)
    .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width || 0, height: it.height || 0 }));
  if (positioned.length === 0) return [];

  const fontSizes = positioned.map((p) => p.height).filter((h) => h > 0);
  const medianHeight = median(fontSizes) || 10;
  const yTolerance = Math.max(2, medianHeight * 0.5);

  positioned.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const item of positioned) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= yTolerance);
    if (row) {
      row.items.push(item);
      row.y = (row.y * row.items.length + item.y) / (row.items.length + 1);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows.map((row) => {
    const ordered = row.items.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = null;
    for (const item of ordered) {
      if (prevEnd !== null) {
        const gap = item.x - prevEnd;
        const endsSpace = /\s$/.test(text);
        const startsSpace = /^\s/.test(item.str);
        if (gap > (item.height || medianHeight) * 0.25 && !endsSpace && !startsSpace) text += ' ';
      }
      text += item.str;
      prevEnd = item.x + item.width;
    }
    const heights = ordered.map((i) => i.height).filter((h) => h > 0);
    return { text, page: pageNumber, x: ordered[0].x, fontSize: round1(median(heights)), bold: null };
  });
}

/** Conservative two-column detection from the distribution of line start x-positions. */
function detectMultiColumn(lineStarts, pageWidth) {
  if (!pageWidth || lineStarts.length < 8) return false;
  const rightStarts = lineStarts.filter((x) => x > pageWidth * 0.45);
  const leftStarts = lineStarts.filter((x) => x < pageWidth * 0.35);
  // A real second column: a substantial block of lines begins well past the centre,
  // while a comparable block still begins at the left margin.
  return rightStarts.length >= lineStarts.length * 0.25 && leftStarts.length >= lineStarts.length * 0.25;
}

async function extractPdf(buffer) {
  const pdfjs = loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const message = /password/i.test(err.message)
      ? 'This PDF is password protected. Remove the password and try again.'
      : 'This PDF could not be read. It may be corrupt or malformed. Export a fresh copy and try again.';
    throw new AppError('UNPROCESSABLE_DOCUMENT', { message, details: { reason: /password/i.test(err.message) ? 'encrypted' : 'corrupt' }, cause: err });
  }

  if (doc.numPages > MAX_PAGES) {
    await doc.cleanup().catch(() => {});
    throw new AppError('UNPROCESSABLE_DOCUMENT', { message: `This PDF has ${doc.numPages} pages; the limit is ${MAX_PAGES}.`, details: { reason: 'too_many_pages' } });
  }

  const lines = [];
  const links = [];
  const startXByPage = [];
  try {
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const [, , pageWidth] = pageDimensions(page);
      const content = await page.getTextContent();
      const pageLines = reconstructLines(content.items, p);
      startXByPage.push({ width: pageWidth, starts: pageLines.map((l) => l.x) });
      lines.push(...pageLines);

      const annotations = await page.getAnnotations().catch(() => []);
      for (const a of annotations) {
        const url = a && (a.url || (a.unsafeUrl && String(a.unsafeUrl)));
        if (url) links.push({ url, anchorText: null, page: p });
      }
    }
  } finally {
    await doc.cleanup().catch(() => {});
  }

  const hasText = lines.some((l) => l.text.trim().length > 0);
  if (!hasText) {
    throw new AppError('UNPROCESSABLE_DOCUMENT', {
      message: 'No selectable text was found. This looks like a scanned or image-only PDF. Export a text-based PDF or upload a DOCX.',
      details: { reason: 'no_text_layer' },
    });
  }

  const multiColumnSuspected = startXByPage.some((pg) => detectMultiColumn(pg.starts, pg.width));

  return {
    kind: 'pdf',
    extractor: EXTRACTOR,
    extractorVersion: pdfjsVersion(),
    pageCount: doc.numPages,
    lines: lines.map((l) => ({
      text: l.text, page: l.page, fontSize: l.fontSize, bold: l.bold, isBullet: false, bulletGlyph: null, indentLevel: null,
    })),
    links,
    layout: { multiColumnSuspected, tableCount: null, headerFooterLineIndexes: null },
    warnings: [],
  };
}

function pageDimensions(page) {
  const view = page.view || [0, 0, 0, 0];
  return [view[0], view[1], view[2] - view[0], view[3] - view[1]];
}

function pdfjsVersion() {
  try {
    // eslint-disable-next-line global-require
    return require('pdfjs-dist/package.json').version;
  } catch {
    return 'unknown';
  }
}

function median(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(n) {
  return n > 0 ? Math.round(n * 10) / 10 : null;
}

module.exports = { extractPdf, EXTRACTOR, MAX_PAGES };
