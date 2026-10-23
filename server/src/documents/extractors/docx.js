const mammoth = require('mammoth');
const { AppError } = require('../../shared/errors');

const EXTRACTOR = 'mammoth-html';

function mammothVersion() {
  try {
    // eslint-disable-next-line global-require
    return require('mammoth/package.json').version;
  } catch {
    return 'unknown';
  }
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

function decodeEntities(text) {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripInlineTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
}

/**
 * Converts mammoth's block-level HTML into raw lines. Handles paragraphs, list
 * items (with nesting depth), headings, table rows and hyperlinks. Anything
 * mammoth emits that is not one of these is still captured as paragraph text.
 */
function htmlToLines(html) {
  const lines = [];
  const links = [];
  let tableCount = 0;

  // Collect hyperlinks with their anchor text before tags are stripped.
  const linkRegex = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const url = decodeEntities(linkMatch[1]);
    if (url) links.push({ url, anchorText: stripInlineTags(linkMatch[2]) || null, page: null });
  }

  const blockRegex = /<(p|h[1-6]|li|tr)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let inTable = false;
  const tableOpen = /<table\b/gi;
  let m = tableOpen.exec(html);
  const tableStarts = [];
  while (m) { tableStarts.push(m.index); m = tableOpen.exec(html); }
  tableCount = tableStarts.length;

  let block;
  while ((block = blockRegex.exec(html)) !== null) {
    const tag = block[1].toLowerCase();
    const inner = block[3];

    if (tag === 'tr') {
      const cells = [];
      const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cell;
      while ((cell = cellRegex.exec(inner)) !== null) cells.push(stripInlineTags(cell[1]));
      const text = cells.filter(Boolean).join(' | ');
      if (text) lines.push({ text, page: null, fontSize: null, bold: null, isBullet: false, bulletGlyph: null, indentLevel: null });
      inTable = true;
      continue;
    }

    const text = stripInlineTags(inner);
    if (!text) continue;

    if (tag === 'li') {
      lines.push({ text, page: null, fontSize: null, bold: null, isBullet: true, bulletGlyph: '•', indentLevel: 1 });
    } else if (/^h[1-6]$/.test(tag)) {
      lines.push({ text, page: null, fontSize: null, bold: true, isBullet: false, bulletGlyph: null, indentLevel: null });
    } else {
      // A paragraph that is entirely bold/strong is very likely a heading.
      const bold = /^\s*<(strong|b)\b[^>]*>[\s\S]*<\/(strong|b)>\s*$/i.test(inner);
      lines.push({ text, page: null, fontSize: null, bold: bold || null, isBullet: false, bulletGlyph: null, indentLevel: null });
    }
  }

  return { lines, links, tableCount, hadTable: inTable };
}

async function extractDocx(buffer) {
  let result;
  try {
    result = await mammoth.convertToHtml({ buffer });
  } catch (err) {
    throw new AppError('UNPROCESSABLE_DOCUMENT', { message: 'This Word document could not be read. It may be corrupt. Export a fresh copy and try again.', details: { reason: 'corrupt' }, cause: err });
  }

  const { lines, links, tableCount } = htmlToLines(result.value || '');
  if (lines.length === 0 || lines.every((l) => l.text.trim().length === 0)) {
    throw new AppError('UNPROCESSABLE_DOCUMENT', { message: 'No readable text was found in this Word document.', details: { reason: 'no_text_layer' } });
  }

  const warnings = (result.messages || [])
    .filter((msg) => msg.type === 'warning')
    .slice(0, 20)
    .map((msg) => ({ code: 'DOCX_CONVERSION_WARNING', message: String(msg.message).slice(0, 200) }));

  return {
    kind: 'docx',
    extractor: EXTRACTOR,
    extractorVersion: mammothVersion(),
    pageCount: null, // DOCX has no fixed page model
    lines,
    links,
    layout: { multiColumnSuspected: false, tableCount, headerFooterLineIndexes: null },
    warnings,
  };
}

module.exports = { extractDocx, htmlToLines, decodeEntities, EXTRACTOR };
