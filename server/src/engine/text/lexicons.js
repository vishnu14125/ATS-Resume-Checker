/**
 * Deterministic lexicons for resume parsing. Maintainable word lists and patterns,
 * not an NLP model. Section headings map common variations to canonical types.
 */

// Ordered: the first matching pattern wins. Patterns match a full heading line
// (already lower-cased, trailing ':' removed, '&' → 'and').
const SECTION_HEADINGS = [
  ['summary', /^(professional\s+)?(summary|profile|objective|about( me)?|professional profile|career objective)$/],
  ['experience', /^(work|professional|employment|relevant|industry)?\s*(experience|history|employment)$/],
  ['experience', /^(work history|employment history|career history)$/],
  ['projects', /^(personal|academic|selected|key|notable|side)?\s*projects?$/],
  ['education', /^(education|academic background|academics|qualifications|educational background)$/],
  ['skills', /^(technical\s+)?(skills|expertise|proficiencies|competencies|core competencies|technologies|technical proficiencies|tech stack)$/],
  ['certifications', /^(certifications?|certificates?|licenses?( and certifications)?|licences?|credentials)$/],
  ['achievements', /^(achievements?|awards?|honors?|honours?|accomplishments|awards and honors)$/],
  ['publications', /^(publications?|research|papers)$/],
  ['volunteering', /^(volunteer(ing)?|community( service)?|leadership|extracurriculars?|activities)$/],
  ['languages', /^languages?$/],
  ['interests', /^(interests|hobbies)$/],
];

const DEGREE_LEVELS = [
  ['doctorate', /\b(ph\.?\s?d\.?|doctor(ate)? of philosophy|d\.?phil)\b/i],
  ['master', /\b(master(?:'?s)?(?: of| in| degree)?|m\.?s\.?c?\.?|m\.?tech|m\.?eng|m\.?b\.?a|m\.?a\.?|meng|msc)\b/i],
  ['bachelor', /\b(bachelor(?:'?s)?(?: of| in| degree)?|b\.?s\.?c?\.?|b\.?tech|b\.?eng|b\.?a\.?|b\.?e\.?|beng|bsc)\b/i],
  ['associate', /\b(associate(?:'?s)?(?: of| in| degree)?|a\.?s\.?|a\.?a\.?)\b/i],
  ['diploma', /\b(diploma|pg\s?diploma|post ?graduate diploma)\b/i],
  ['high_school', /\b(high school( diploma)?|secondary school|hsc|ssc|gcse|a-levels?)\b/i],
];

// Short degree abbreviations that are only safe to treat as degrees inside an
// education section or next to "in <field>"/"degree" (avoids "MS Office" etc.).
const AMBIGUOUS_DEGREE = /\b(ms|ma|ba|bs|be|bsc|msc)\b/i;

const FIELD_OF_STUDY = [
  ['computer_science', /\b(computer science|comp\.? sci\.?|cs|cse|computer engineering)\b/i],
  ['software_engineering', /\bsoftware engineering\b/i],
  ['information_technology', /\b(information technology|info(rmation)? tech|\bit\b)\b/i],
  ['electrical_engineering', /\b(electrical( and electronics)? engineering|ece|eee)\b/i],
  ['data_science', /\bdata science\b/i],
  ['mathematics', /\b(mathematics|maths?)\b/i],
  ['information_systems', /\binformation systems\b/i],
  ['electronics', /\belectronics\b/i],
  ['mechanical_engineering', /\bmechanical engineering\b/i],
  ['business', /\b(business administration|business|management)\b/i],
];

const INSTITUTION_CUE = /\b(university|college|institute|institution|school|academy|polytechnic|iit|nit|iiit)\b/i;

const ROLE_CUE = /\b(engineer|developer|programmer|intern(ship)?|analyst|scientist|manager|designer|architect|consultant|lead|specialist|administrator|researcher|associate|officer|director|coordinator|trainee|freelancer)\b/i;
const ORG_CUE = /\b(inc\.?|llc|ltd\.?|corp\.?|corporation|gmbh|pvt\.?|private limited|technologies|technology|labs?|systems|solutions|software|consulting|group|company|co\.?|university|college|institute)\b/i;

const EMPLOYMENT_TYPES = [
  ['internship', /\b(intern|internship|co-?op)\b/i],
  ['contract', /\b(contract|contractor)\b/i],
  ['freelance', /\b(freelance|freelancer)\b/i],
  ['part_time', /\bpart[- ]?time\b/i],
];

// Action verbs (lemmas) that open strong resume bullets.
const ACTION_VERBS = new Set([
  'develop', 'design', 'implement', 'build', 'create', 'architect', 'lead', 'manage', 'optimize', 'improve',
  'increase', 'reduce', 'deliver', 'launch', 'engineer', 'automate', 'integrate', 'migrate', 'deploy', 'maintain',
  'refactor', 'test', 'analyze', 'research', 'collaborate', 'coordinate', 'mentor', 'spearhead', 'streamline',
  'transform', 'drive', 'own', 'establish', 'introduce', 'scale', 'debug', 'resolve', 'configure', 'orchestrate',
  'wrote', 'built', 'led', 'created', 'designed', 'developed', 'implemented', 'improved', 'reduced', 'increased',
]);

// Common certifications for detection (issuer inferred where obvious). Extended in Phase 4.
const CERTIFICATIONS = [
  ['aws-cloud-practitioner', /\baws certified cloud practitioner\b/i, 'Amazon Web Services'],
  ['aws-certified', /\baws certified [a-z ]+(associate|professional|specialty)?\b/i, 'Amazon Web Services'],
  ['azure-fundamentals', /\b(az-900|azure fundamentals)\b/i, 'Microsoft'],
  ['azure-administrator', /\b(az-104|azure administrator)\b/i, 'Microsoft'],
  ['cka', /\b(cka|certified kubernetes administrator)\b/i, 'CNCF'],
  ['ckad', /\b(ckad|certified kubernetes application developer)\b/i, 'CNCF'],
  ['pmp', /\bpmp\b/i, 'PMI'],
  ['scrum-master', /\b(csm|certified scrum master|professional scrum master|psm)\b/i, 'Scrum.org'],
  ['cissp', /\bcissp\b/i, 'ISC2'],
  ['ccna', /\bccna\b/i, 'Cisco'],
  ['comptia-security', /\b(security\+|comptia security)\b/i, 'CompTIA'],
  ['google-cloud', /\b(google cloud certified|gcp certified)\b/i, 'Google'],
  ['oracle-java', /\boracle certified [a-z ]*java\b/i, 'Oracle'],
];

const METRIC_PATTERNS = [
  ['percent', /\b\d+(?:\.\d+)?\s?%/],
  ['currency', /[$€£₹]\s?\d[\d,]*(?:\.\d+)?\s?[kmb]?\b/i],
  ['multiplier', /\b\d+(?:\.\d+)?x\b/i],
  ['duration', /\b\d+\s?(?:ms|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\b/i],
  ['count', /\b\d[\d,]*(?:\.\d+)?\s?(?:\+|k|m|b)?\b/],
];

/** Detects metrics in a bullet. `count` is only reported when no richer metric matched. */
function detectMetrics(text) {
  const metrics = [];
  for (const [kind, pattern] of METRIC_PATTERNS) {
    if (kind === 'count' && metrics.length > 0) continue;
    const m = pattern.exec(text);
    if (m) metrics.push({ raw: m[0].trim(), kind });
  }
  return metrics;
}

module.exports = {
  SECTION_HEADINGS, DEGREE_LEVELS, AMBIGUOUS_DEGREE, FIELD_OF_STUDY, INSTITUTION_CUE,
  ROLE_CUE, ORG_CUE, EMPLOYMENT_TYPES, ACTION_VERBS, CERTIFICATIONS, detectMetrics,
};
