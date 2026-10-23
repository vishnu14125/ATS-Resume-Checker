const taxonomy = require('../../engine/taxonomy/taxonomy');
const { CERTIFICATIONS } = require('../../engine/text/lexicons');

/**
 * Deterministic guards around the model. None of this asks a model anything.
 *
 *   Before the call: text taken from documents is untrusted. Contact details
 *   are redacted, and text that addresses an automated system is withheld.
 *
 *   After the call: every output string is checked against the vocabulary of
 *   the facts that were supplied. A number, technology, certification or proper
 *   noun that the facts do not contain is an unsupported claim.
 */

// ── Untrusted text ───────────────────────────────────────────────────────────

const WITHHELD = '[withheld: this text addresses automated systems and was not passed on]';

const INJECTION = new RegExp([
  String.raw`\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,60}\b(?:instructions?|rules?|prompts?|guidelines?|polic(?:y|ies))\b`,
  String.raw`^[\s•*\-–—>]*(?:system|assistant|developer)\s*:`,
  String.raw`\byou are (?:now )?an? (?:ai|assistant|language model|chatbot|llm)\b`,
  String.raw`\b(?:mark|treat|count|consider)\b[^.\n]{0,40}\brequirements?\b[^.\n]{0,20}\b(?:satisfied|met|fulfilled)\b`,
  String.raw`\b(?:give|award|assign)\b[^.\n]{0,30}\b(?:100|perfect|full|maximum)\b[^.\n]{0,20}\b(?:score|marks?|rating)\b`,
  String.raw`\b(?:rank|rate)\b[^.\n]{0,30}\b(?:this|the) (?:candidate|resume|applicant)\b`,
  String.raw`\bsay (?:that )?(?:i|this candidate|the candidate)\b`,
].join('|'), 'im');

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{7,}\d/g;

const isInjection = (text) => INJECTION.test(text);

/** Redacts contact details; a phone number is a digit run of 9–15 digits. */
function redact(text) {
  return text
    .replace(EMAIL, '[email]')
    .replace(LINK, '[link]')
    .replace(PHONE_CANDIDATE, (m) => { const digits = m.replace(/\D/g, '').length; return digits >= 9 && digits <= 15 ? '[phone]' : m; });
}

/**
 * Returns a cleaner for document-derived text plus a count of what it withheld.
 * Use it on every string that originates from a resume or job description.
 */
function createCleaner() {
  const stats = { withheld: 0 };
  const clean = (value) => {
    const text = String(value == null ? '' : value);
    if (isInjection(text)) { stats.withheld += 1; return WITHHELD; }
    return redact(text);
  };
  return { clean, stats };
}

// ── Vocabulary of the supplied facts ─────────────────────────────────────────

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const WORD = /[A-Za-z][A-Za-z0-9+#.'/-]*/g;
const PLACEHOLDER = /\[[^\]]{1,80}\]/g;
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, hundred: 100,
};
const QUANTITY_IN_WORDS = new RegExp(String.raw`\b(${Object.keys(NUMBER_WORDS).join('|')})\b\s*\+?\s*(?:years?|yrs?|months?|percent|times)\b`, 'gi');

// Capitalised words that are ordinary product or section vocabulary, not names.
const COMMON_CAPITALISED = new Set([
  'resume', 'cv', 'health', 'job', 'match', 'score', 'ats', 'jd', 'pdf', 'docx', 'txt', 'api', 'apis', 'url', 'urls', 'id', 'ai',
  'experience', 'education', 'skills', 'projects', 'summary', 'certifications', 'languages', 'contact', 'english',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  "i'm", "i've", "i'd", "i'll",
]);

const normaliseNumber = (raw) => { const n = Number(String(raw).replace(/,/g, '')); return Number.isFinite(n) ? String(n) : null; };
const normaliseWord = (raw) => raw.replace(/'s$/i, '').replace(/[.'/-]+$/, '').toLowerCase();
/** A token and its "/"- and "-"-separated parts, normalised ("CI/CD" → ci/cd, ci, cd). */
const wordForms = (raw) => [raw, ...raw.split(/[/-]/)].map(normaliseWord).filter(Boolean);

/**
 * @param {{ texts?: string[], numbers?: number[], skillIds?: string[] }} facts
 * @returns the set of numbers, words, skills and certifications the facts contain
 */
function buildVocabulary({ texts = [], numbers = [], skillIds = [] }) {
  const vocab = { numbers: new Set(), words: new Set(), skills: new Set(skillIds), certifications: new Set(), mentionsCertification: false };
  for (const n of numbers) {
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    vocab.numbers.add(String(n));
    vocab.numbers.add(String(Math.round(n)));
  }
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.match(NUMBER) || []) { const n = normaliseNumber(m); if (n !== null) vocab.numbers.add(n); }
    for (const m of text.match(WORD) || []) for (const form of wordForms(m)) vocab.words.add(form);
    for (const m of taxonomy.recognize(text)) vocab.skills.add(m.skillId);
    for (const [id, pattern] of CERTIFICATIONS) if (pattern.test(text)) vocab.certifications.add(id);
    if (/\bcertif/i.test(text)) vocab.mentionsCertification = true;
  }
  return vocab;
}

// ── Claims in model output ───────────────────────────────────────────────────

// Outcome and seniority claims. In a rewrite, one of these that the original
// text does not contain is an invented achievement or responsibility.
const ACHIEVEMENT_WORDS = ['won', 'led', 'cut', 'grew', 'ranked', 'winner', 'managed', 'saved', 'saving', 'scaled', 'scaling'];
const ACHIEVEMENT_STEMS = [
  'award', 'promot', 'patent', 'publish', 'honou?r', 'recogni[sz]', 'spearhead',
  'increas', 'reduc', 'improv', 'boost', 'doubl', 'tripl', 'optimi[sz]', 'accelerat',
];
const ACHIEVEMENT = new RegExp(String.raw`\b(?:(${ACHIEVEMENT_WORDS.join('|')})|(${ACHIEVEMENT_STEMS.join('|')})[a-z]*)\b`, 'gi');

const SENTENCE_BREAK = /[.!?:;([{"'“‘—–\-•*\n]/;
function isSentenceInitial(text, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) i -= 1;
  return i < 0 || SENTENCE_BREAK.test(text[i]);
}

/**
 * Finds claims in `text` that the vocabulary does not support.
 *
 * @param {string} text  model output
 * @param {object} vocab  from buildVocabulary
 * @param {{ restatementOf?: string }} [options]  set when `text` must be a rewrite of
 *   an existing line: outcome/seniority terms absent from that line are also unsupported
 * @returns {Array<{ type: 'number'|'skill'|'certification'|'proper_noun'|'achievement', value: string }>}
 */
function findUnsupportedClaims(text, vocab, { restatementOf = null } = {}) {
  const claims = [];
  const body = String(text).replace(PLACEHOLDER, ' ');

  for (const m of body.match(NUMBER) || []) {
    const n = normaliseNumber(m);
    if (n !== null && !vocab.numbers.has(n)) claims.push({ type: 'number', value: m });
  }
  for (const m of body.matchAll(QUANTITY_IN_WORDS)) {
    if (!vocab.numbers.has(String(NUMBER_WORDS[m[1].toLowerCase()]))) claims.push({ type: 'number', value: m[0] });
  }

  const skillSpans = taxonomy.recognize(body);
  for (const m of skillSpans) {
    if (!m.ambiguous && !vocab.skills.has(m.skillId)) claims.push({ type: 'skill', value: m.surface });
  }
  const insideSkill = (index) => skillSpans.some((s) => index >= s.start && index < s.end);

  for (const [id, pattern] of CERTIFICATIONS) {
    const m = pattern.exec(body);
    if (m && !vocab.certifications.has(id)) claims.push({ type: 'certification', value: m[0] });
  }
  const certWord = /\bcertif(?:ied|ication|icate)s?\b/i.exec(body);
  if (certWord && !vocab.mentionsCertification) claims.push({ type: 'certification', value: certWord[0] });

  for (const m of body.matchAll(WORD)) {
    const word = m[0];
    // A skill name is judged by the skill check above, not as a proper noun.
    if (!/^[A-Z]/.test(word) || word.length < 2 || isSentenceInitial(body, m.index) || insideSkill(m.index)) continue;
    const known = wordForms(word).some((form) => vocab.words.has(form) || COMMON_CAPITALISED.has(form));
    if (!known) claims.push({ type: 'proper_noun', value: word });
  }

  if (restatementOf !== null) {
    const original = restatementOf.toLowerCase();
    for (const m of body.matchAll(ACHIEVEMENT)) {
      const stem = (m[1] || m[2]).toLowerCase(); // letters only
      if (!new RegExp(String.raw`\b${stem}`).test(original)) claims.push({ type: 'achievement', value: m[0] });
    }
  }
  return claims;
}

module.exports = { WITHHELD, isInjection, redact, createCleaner, buildVocabulary, findUnsupportedClaims };
