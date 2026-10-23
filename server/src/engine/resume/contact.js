const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d[\d\s.-]{6,}\d/g;
const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_-]+\/?/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i;

/** Builds a Field { value, ref, confidence }, locating `match` within the line for a span. */
function field(value, lineIndex, lineText, match, confidence) {
  const at = typeof match === 'string' ? lineText.indexOf(match) : -1;
  const ref = at >= 0 ? { lineIndex, start: at, end: at + match.length } : { lineIndex, start: null, end: null };
  return { value, ref, confidence };
}

function looksLikeName(text) {
  const words = text.trim().split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (/[@\d]/.test(text)) return false;
  // Each word starts uppercase (allow all-caps names too).
  return words.every((w) => /^[A-Z][A-Za-z'.-]*$/.test(w) || /^[A-Z.]{2,}$/.test(w));
}

function isPhoneLike(candidate) {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  // Reject bare year ranges like "2019 2021" that survive the loose pattern.
  if (/^\s*(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\s*$/.test(candidate)) return false;
  return true;
}

const KNOWN_HOSTS = [
  ['linkedin', LINKEDIN],
  ['github', GITHUB],
];

/**
 * Extracts contact information from the header lines and document links.
 * @param {object[]} lines  all NormalizedDocument lines
 * @param {object[]} headerLines  lines in the implicit header section (with their indexes)
 * @param {object[]} docLinks  NormalizedDocument.links
 */
function extractContact(lines, headerLines, docLinks) {
  const searchLines = headerLines.length ? headerLines : lines.slice(0, 25).map((l, i) => ({ line: l, index: i }));
  const contact = { name: null, emails: [], phones: [], location: null, links: [] };
  const seenEmails = new Set();
  const seenLinks = new Set();

  for (const { line, index } of searchLines) {
    const text = line.text;

    const emails = text.match(EMAIL) || [];
    for (const email of emails) {
      const value = email.toLowerCase();
      if (!seenEmails.has(value)) { seenEmails.add(value); contact.emails.push(field(value, index, text, email, 1)); }
    }

    if (!contact.name && looksLikeName(text) && !matchesHeaderNoise(text)) {
      contact.name = field(text.trim(), index, text, null, 0.7);
    }

    if (contact.phones.length === 0) {
      const phones = text.match(PHONE) || [];
      const phone = phones.find(isPhoneLike);
      if (phone) contact.phones.push(field(phone.trim(), index, text, phone.trim(), 0.85));
    }

    if (!contact.location) {
      const loc = /\b([A-Z][A-Za-z.]+(?:\s[A-Z][A-Za-z.]+)*),\s*([A-Z]{2}|[A-Z][A-Za-z]+)\b/.exec(text);
      if (loc && !/@/.test(text) && !EMAIL.test(loc[0])) contact.location = field(loc[0], index, text, loc[0], 0.5);
    }
  }

  // Links: prefer document hyperlink annotations, then any URLs found in text.
  const allUrls = [...docLinks.map((l) => ({ url: l.url, ref: l.lineIndex })), ...collectInlineUrls(lines)];
  for (const { url, ref } of allUrls) {
    const kind = classifyLink(url);
    const normalized = url.replace(/\/$/, '');
    if (seenLinks.has(normalized)) continue;
    seenLinks.add(normalized);
    contact.links.push({ kind, url, ref: ref != null ? { lineIndex: ref, start: null, end: null } : null });
  }

  return contact;
}

function matchesHeaderNoise(text) {
  return /\b(resume|curriculum vitae|cv|profile)\b/i.test(text) && text.trim().split(/\s+/).length <= 2;
}

function collectInlineUrls(lines) {
  const urls = [];
  lines.forEach((line) => {
    for (const [, pattern] of KNOWN_HOSTS) {
      const m = pattern.exec(line.text);
      if (m) urls.push({ url: m[0], ref: line.index });
    }
    const generic = line.text.match(/\bhttps?:\/\/[^\s<>()]+/gi) || [];
    generic.forEach((u) => urls.push({ url: u.replace(/[.,;:)]+$/, ''), ref: line.index }));
  });
  return urls;
}

function classifyLink(url) {
  if (LINKEDIN.test(url)) return 'linkedin';
  if (GITHUB.test(url)) return 'github';
  if (/^https?:\/\//i.test(url)) return 'portfolio';
  return 'other';
}

module.exports = { extractContact, looksLikeName, isPhoneLike, classifyLink };
