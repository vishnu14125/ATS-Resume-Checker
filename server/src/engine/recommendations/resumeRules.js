/**
 * Resume-scope recommendation rules. Each rule consumes one or more Resume Health
 * subjects (a parseability check id or a content rule id) that lost points, so
 * related findings collapse into a single recommendation. The issue text is
 * taken from the findings themselves; only the action is authored here.
 *
 * `integrityNote` is set whenever the action suggests adding content.
 */

const TRUE_ONLY = 'Only add information that is accurate and that you can stand behind.';

const RESUME_RULES = [
  {
    ruleId: 'REC-PARSE-TEXT', category: 'parseability', subjects: ['text_layer'], highWhenFailed: true,
    action: 'Export the resume as a text-based PDF or DOCX (not a scan or image) and check that all of its text can be selected and copied.',
    rationale: 'Screening software can only assess text it can extract.',
    integrityNote: null,
  },
  {
    ruleId: 'REC-PARSE-CHARACTERS', category: 'parseability', subjects: ['encoding', 'icon_glyphs'],
    action: 'Re-export the file using standard fonts and replace icon symbols (phone, email, link icons) with plain text labels.',
    rationale: 'Characters that cannot be decoded are read as noise and can hide contact details or keywords.',
    integrityNote: null,
  },
  {
    ruleId: 'REC-PARSE-LAYOUT', category: 'parseability', subjects: ['reading_order'],
    action: 'Move the main content into a single column without tables so it is read top to bottom in the intended order.',
    rationale: 'Columns and tables are often read out of order, mixing unrelated lines together.',
    integrityNote: null,
  },
  {
    ruleId: 'REC-PARSE-HEADINGS', category: 'parseability', subjects: ['standard_headings'],
    action: 'Use conventional section headings such as Experience, Education and Skills, each on its own line.',
    rationale: 'Standard headings let software assign content to the right section.',
    integrityNote: null,
  },
  {
    ruleId: 'REC-PARSE-LENGTH', category: 'parseability', subjects: ['length'],
    action: 'Tighten the resume by removing older or less relevant detail.',
    rationale: 'Very long resumes are harder to scan for the most relevant evidence.',
    integrityNote: null,
  },
  {
    ruleId: 'REC-PARSE-EMBEDDED-INSTRUCTIONS', category: 'parseability', subjects: ['embedded_instructions'], highWhenFailed: true,
    action: 'Remove the text that addresses automated screening software.',
    rationale: 'Instructions aimed at screening tools are detected and treated as an attempt to manipulate the process.',
    integrityNote: null,
  },
  {
    ruleId: 'REC-STRUCT-ROLE-HEADINGS', category: 'format', subjects: ['dated_roles', 'entry_structure'],
    action: 'Give every role a heading with the job title, the organisation and a clear date range (for example "Jan 2022 - Present").',
    rationale: 'Titles, organisations and dates are how experience is identified and how its duration is established.',
    integrityNote: 'Use your actual titles, employers and dates.',
  },
  {
    ruleId: 'REC-STRUCT-ENTRY-CONTENT', category: 'format', subjects: ['STRUCT-ENTRY-CONTENT'],
    action: 'Add a few bullet points under each role or project that has none, describing what you did.',
    rationale: 'An entry without a description gives no evidence of the work behind it.',
    integrityNote: 'Describe only work you actually did.',
  },
  {
    ruleId: 'REC-TECH-NAME-SKILLS', category: 'technical_content', subjects: ['TECH-SKILLS-RECOGNISED'],
    action: 'Name the specific technologies and tools you have genuinely worked with, rather than describing them in general terms.',
    rationale: 'Named technologies are what a resume is matched on.',
    integrityNote: 'List only technologies you have actually used.',
  },
  {
    ruleId: 'REC-TECH-DEMONSTRATE-SKILLS', category: 'technical_content', subjects: ['TECH-SKILLS-DEMONSTRATED', 'TECH-ENTRY-SKILLS'],
    action: 'For the skills you already list, mention them in the role or project where you used them and say what you did with them.',
    rationale: 'A skill shown in use is stronger evidence than the same skill appearing only in a list.',
    integrityNote: 'Attach a skill to a role or project only if you used it there.',
  },
  {
    ruleId: 'REC-IMPACT-QUANTIFY', category: 'content_quality', subjects: ['IMPACT-METRICS'],
    action: 'Where you can verify the result, add a measurable outcome to a few bullets — for example users served, time saved, latency, test coverage or volume handled.',
    rationale: 'A few quantified results make the scale and effect of the work concrete. Not every bullet needs one.',
    integrityNote: 'Use only figures you can verify. Do not estimate or invent numbers.',
  },
  {
    ruleId: 'REC-IMPACT-ACTION-VERBS', category: 'content_quality', subjects: ['IMPACT-ACTION-VERBS'],
    action: 'Start bullets with the action you took (Built, Designed, Reduced) instead of a noun phrase or "Responsible for".',
    rationale: 'Leading with the action makes your own contribution clear.',
    integrityNote: null,
  },
  {
    ruleId: 'REC-COMP-CONTACT', category: 'completeness', subjects: ['contact_email', 'contact_phone', 'COMP-NAME'], highWhenFailed: true,
    action: 'Put your full name and contact details as plain text at the top of the resume.',
    rationale: 'Without readable contact details a recruiter cannot identify or reach you.',
    integrityNote: 'Use your own, current contact details.',
  },
  {
    ruleId: 'REC-COMP-WORK-EVIDENCE', category: 'completeness', subjects: ['COMP-WORK-EVIDENCE'], highWhenFailed: true,
    action: 'Add an Experience section for any roles you have held. If you have no formal experience yet, describe projects you actually built.',
    rationale: 'Roles and projects are where skills are demonstrated rather than claimed.',
    integrityNote: TRUE_ONLY,
  },
  {
    ruleId: 'REC-COMP-EDUCATION', category: 'completeness', subjects: ['COMP-EDUCATION'],
    action: 'Add an Education section with your qualification, field and institution.',
    rationale: 'Education is a standard section and is often checked against job requirements.',
    integrityNote: 'List only qualifications you hold or are currently pursuing.',
  },
  {
    ruleId: 'REC-COMP-SKILLS-SECTION', category: 'completeness', subjects: ['COMP-SKILLS'],
    action: 'Add a dedicated Skills section that lists the technologies already evidenced elsewhere in your resume.',
    rationale: 'A skills section makes your technologies easy to find in one place.',
    integrityNote: 'List only skills you have actually used.',
  },
];

module.exports = { RESUME_RULES };
