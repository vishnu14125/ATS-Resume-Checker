/**
 * Deterministic lexicons and patterns for job-description parsing. Maintainable
 * rules, not an NLP model. Used by the JD section detector and requirement
 * extractor. Phase 3 only answers "what does the JD ask for?" — never matching.
 */

// JD section headings → canonical JobSectionType. First match wins. Tested against
// a heading line that has been lower-cased, had a trailing ':' removed and '&'→'and'.
const JD_SECTION_HEADINGS = [
  ['responsibilities', /^(key\s+)?(responsibilities|duties)$/],
  ['responsibilities', /^(what you(?:'| wi)ll do|what you will do|the role|your impact|in this role|day[ -]?to[ -]?day|role overview|about the role)$/],
  ['requirements', /^(required|requirements|minimum qualifications|basic qualifications|required qualifications|required skills|must[ -]?haves?|what you(?:'| wi)ll bring|what you bring|who you are|what we(?:'| a)re looking for|skills and experience|qualifications)$/],
  ['preferred', /^(preferred|preferred qualifications|preferred skills|nice[ -]?to[ -]?haves?|bonus( points)?|pluses|good[ -]?to[ -]?have|desired|nice extras)$/],
  ['requirements', /^(technical skills|skills|technologies|tech stack|requirements and skills)$/], // treated as requirements-ish; importance stays contextual unless cued
  ['summary', /^(summary|overview|job summary|position summary|job description|description)$/],
  ['about_company', /^(about us|about the company|who we are|company|about)$/],
  ['benefits', /^(benefits|perks|what we offer|we offer|compensation|salary|pay|perks and benefits)$/],
  ['location', /^(location|work location|job location)$/],
  ['eeo', /^(equal opportunity.*|eeo.*|diversity.*|our commitment.*)$/],
  ['experience', /^experience$/],
  ['education', /^education$/],
];

// Importance modality (matched on the statement text, word-boundary safe).
const REQUIRED_CUES = /\b(must have|must|required|requires|mandatory|minimum|at least|need to have|essential|you must)\b/i;
const PREFERRED_CUES = /\b(preferred|nice[ -]to[ -]have|bonus|a plus|is a plus|plus|ideally|desirable|good[ -]to[ -]have|familiarity with|exposure to|would be nice|a strong plus)\b/i;
const NEGATION_CUES = /\b(not required|no .* required|optional|not necessary)\b/i;

// Experience-years patterns. Only a number + "years/yrs" is a duration requirement;
// "experience with Java" (no number) is a skill, not a duration.
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const YEARS_RANGE = /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*years?\b/i;
const YEARS_MIN = /\b(?:at least|minimum(?: of)?|min\.?|over)\s*(\d{1,2})\+?\s*years?\b/i;
const YEARS_PLUS = /\b(\d{1,2})\s*\+\s*years?\b/i;
const YEARS_WORD = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*\+?\s*years?\b/i;
const YEARS_SIMPLE = /\b(\d{1,2})\s*years?\b/i;
const ENTRY_LEVEL = /\b(entry[ -]level|fresh graduates?|new graduates?|no experience required|0\s*-\s*1\s*years?)\b/i;

// Scope of an experience requirement: "experience in/with <X>" or "<X> experience".
const EXP_SCOPE_AFTER = /years?(?:\s+of)?\s+experience\s+(?:in|with|using|building|developing)\s+([a-z0-9 ,.+#/&-]{2,60})/i;

// Education.
const DEGREE_REQ = [
  ['doctorate', /\b(ph\.?\s?d\.?|doctorate|doctoral)\b/i],
  ['master', /\b(master'?s?(?:\s+degree)?|m\.?s\.?c?\.?|m\.?tech|m\.?eng|mba|graduate degree)\b/i],
  ['bachelor', /\b(bachelor'?s?(?:\s+degree)?|b\.?s\.?c?\.?|b\.?tech|b\.?eng|b\.?e\.?|undergraduate degree|degree in)\b/i],
  ['associate', /\b(associate'?s?(?:\s+degree)?)\b/i],
];
const DEGREE_FIELD = /\b(?:degree|b\.?s\.?|b\.?tech|m\.?s\.?|bachelor'?s?|master'?s?)\s+(?:of|in)\s+([a-z0-9 ,/&-]{2,50})/i;
const RELATED_FIELD = /\b(related field|related discipline|similar field|or equivalent)\b/i;
const EQUIVALENT_EXP = /\b(or equivalent (?:practical )?experience|equivalent work experience)\b/i;

// Certifications (generic phrasing; known ones are matched via resume lexicons too).
const CERT_PHRASE = /\b([A-Z][A-Za-z0-9 .+/-]*?\s+(?:certified|certification|certificate)|(?:certified|certification)\s+[A-Za-z0-9 .+/-]{2,40})\b/;

// Language, work authorization, clearance, location.
const LANGUAGE_REQ = /\b(fluent|fluency|proficiency|proficient|native|conversational)\s+(?:in\s+)?([A-Za-z]+)\b/i;
// Only treat the captured word as a spoken language if it is a known one, so
// "proficient in React" is not misread as a language.
const SPOKEN_LANGUAGES = new Set([
  'english', 'spanish', 'french', 'german', 'mandarin', 'cantonese', 'chinese', 'hindi', 'arabic',
  'portuguese', 'japanese', 'korean', 'russian', 'italian', 'dutch', 'polish', 'turkish', 'vietnamese', 'tamil', 'telugu',
]);
const WORK_AUTH = /\b(authorized to work|work authorization|right to work|visa sponsorship|no sponsorship|us citizen|eligible to work)\b/i;
const CLEARANCE = /\b(security clearance|secret clearance|top secret|ts\/sci|active clearance)\b/i;
const WORK_MODE = [
  ['remote', /\b(fully remote|remote[ -]first|100% remote|remote)\b/i],
  ['hybrid', /\bhybrid\b/i],
  ['onsite', /\b(on[ -]?site|in[ -]office|in person)\b/i],
];
const LOCATION_LINE = /\b(?:based in|located in|location:?)\s+([A-Z][A-Za-z.]+(?:[ ,][A-Z][A-Za-z.]+)*)/;

// Seniority from the title.
const SENIORITY_TITLE = [
  ['intern', /\bintern(ship)?\b/i],
  ['director', /\bdirector\b/i],
  ['manager', /\b(manager|head of)\b/i],
  ['principal', /\bprincipal\b/i],
  ['staff', /\bstaff\b/i],
  ['lead', /\b(lead|team lead|tech lead)\b/i],
  ['senior', /\b(senior|sr\.?)\b/i],
  ['entry', /\b(junior|jr\.?|entry[ -]level|graduate|associate)\b/i],
];

const EMPLOYMENT_TYPE = [
  ['internship', /\b(intern|internship)\b/i],
  ['part_time', /\bpart[ -]?time\b/i],
  ['contract', /\b(contract|contractor|freelance|temporary|temp)\b/i],
  ['full_time', /\bfull[ -]?time\b/i],
];

const SOFT_SKILLS = [
  ['communication', /\bcommunicat(e|ion|ing)\b/i],
  ['teamwork', /\b(teamwork|team player|collaborat(e|ion|ive))\b/i],
  ['leadership', /\b(leadership|lead(ing)? (?:teams|others)|mentor(ing|ship)?)\b/i],
  ['problem solving', /\bproblem[ -]solving\b/i],
  ['analytical', /\banalytical\b/i],
  ['adaptability', /\b(adaptab(le|ility)|flexib(le|ility))\b/i],
  ['time management', /\btime management\b/i],
  ['attention to detail', /\battention to detail\b/i],
  ['organization', /\b(organized|organizational skills)\b/i],
  ['creativity', /\b(creativ(e|ity)|innovative)\b/i],
];

function matchNumberWord(word) {
  return NUMBER_WORDS[word.toLowerCase()] || null;
}

module.exports = {
  JD_SECTION_HEADINGS, REQUIRED_CUES, PREFERRED_CUES, NEGATION_CUES,
  YEARS_RANGE, YEARS_MIN, YEARS_PLUS, YEARS_WORD, YEARS_SIMPLE, ENTRY_LEVEL, EXP_SCOPE_AFTER,
  DEGREE_REQ, DEGREE_FIELD, RELATED_FIELD, EQUIVALENT_EXP, CERT_PHRASE,
  LANGUAGE_REQ, SPOKEN_LANGUAGES, WORK_AUTH, CLEARANCE, WORK_MODE, LOCATION_LINE,
  SENIORITY_TITLE, EMPLOYMENT_TYPE, SOFT_SKILLS, matchNumberWord,
};
