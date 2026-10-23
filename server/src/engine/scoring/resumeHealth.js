const { ResumeHealthReportSchema } = require('../../domain/contracts/resumeHealth');
const { parseContract } = require('../../domain/contracts');
const { makeId } = require('../text/ids');
const { buildBreakdown } = require('./breakdown');
const { SCORING_MODEL_VERSION, HEALTH_COMPONENT_WEIGHTS, CHECK_CREDIT, HEALTH } = require('./model');

/**
 * Resume Health — "how complete, structured, readable and well-evidenced is this
 * resume, judged only from what can be deterministically inspected?". It is
 * job-independent and says nothing about suitability for any role.
 *
 * Every signal comes from the parsed ResumeProfile or the NormalizedDocument's
 * own diagnostics. Optional sections (summary, certifications, projects, links)
 * are never penalized for being absent. Pure: no DB, network, clock or LLM.
 */

const EMBEDDED_INSTRUCTIONS = /\b(ignore (?:all |any )?(?:previous|prior|above) instructions|disregard (?:all |the )?(?:previous|prior|above)|you are an? (?:ai|assistant|language model)|rank this (?:resume|candidate))\b/i;

const LIMITATIONS = [
  'This score is a deterministic resume-quality metric. It is not a hiring probability and says nothing about fit for a specific job.',
  'Visual design (fonts, colours, spacing, graphics) is not assessed; layout checks rely on extracted text only.',
  'Technical-content checks recognise skills from the built-in taxonomy, which focuses on software and data roles.',
];

const share = (part, whole) => (whole > 0 ? part / whole : 0);
const scaled = (value, target) => Math.min(1, value / target);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function assessResumeHealth({ normalizedDocument, resumeProfile }) {
  const doc = normalizedDocument;
  const profile = resumeProfile;
  const { stats, layout, source } = doc;

  const checks = [];
  const findings = [];
  const items = { parseability: [], structure: [], technical_content: [], impact: [], completeness: [] };

  /** A parseability-style check with a pass/warn/fail result. */
  const check = (component, weight, checkId, result, evidence, fix = null, refs = []) => {
    const id = makeId('chk', checkId);
    checks.push({ id, checkId, result, evidence, fix: result === 'pass' || result === 'not_applicable' ? null : fix, refs });
    if (result === 'not_applicable') return;
    items[component].push({ subjectId: id, itemWeight: weight, credit: CHECK_CREDIT[result], cause: result === 'fail' ? 'failed_check' : 'warning_check', message: evidence });
  };

  /** A graded content rule; a finding is recorded only when credit is lost. */
  const rule = (component, weight, ruleId, area, credit, message, suggestion) => {
    const id = makeId('fnd', ruleId);
    items[component].push({ subjectId: id, itemWeight: weight, credit, cause: credit === 0 ? 'failed_check' : 'warning_check', message });
    if (credit >= 1) return;
    const severity = credit === 0 ? (weight >= 2 ? 'high' : 'medium') : credit < 0.5 ? 'medium' : 'low';
    findings.push({ id, ruleId, area, severity, message, suggestion, refs: [], evidenceIds: [] });
  };

  // ── Parseability: can software read the document? ──────────────────────────
  const words = stats.wordCount;
  check('parseability', 3, 'text_layer',
    words < HEALTH.unreadableWords ? 'fail' : words < HEALTH.thinWords ? 'warn' : 'pass',
    `${plural(words, 'word')} of text were extracted from the document.`,
    'Make sure the resume is a text-based file (not a scanned image) with its full content selectable.');

  const badChars = stats.replacementCharCount;
  check('parseability', 2, 'encoding',
    badChars === 0 ? 'pass' : share(badChars, stats.charCount) < HEALTH.encodingFailRatio ? 'warn' : 'fail',
    badChars === 0 ? 'No unreadable characters were found.' : `${plural(badChars, 'character')} could not be decoded.`,
    'Re-export the file with standard fonts so every character is readable.');

  check('parseability', 1, 'icon_glyphs',
    stats.privateUseCharCount === 0 ? 'pass' : 'warn',
    stats.privateUseCharCount === 0 ? 'No icon-font glyphs were found.' : `${plural(stats.privateUseCharCount, 'icon-font glyph')} appear in the text and may be read as garbage.`,
    'Replace icon glyphs (phone, email, link icons) with plain text labels.');

  const tables = layout.tableCount || 0;
  check('parseability', 2, 'reading_order',
    layout.multiColumnSuspected === null ? 'not_applicable' : layout.multiColumnSuspected || tables > 0 ? 'warn' : 'pass',
    layout.multiColumnSuspected === null ? 'Layout information is not available for this document.'
      : layout.multiColumnSuspected ? 'A multi-column layout was detected; text may be read out of order.'
        : tables > 0 ? `${plural(tables, 'table')} found; table content may be read out of order.` : 'Single-column reading order.',
    'Use a single-column layout without tables for the main content.');

  const headings = profile.sections.filter((s) => s.type !== 'header' && s.type !== 'other').length;
  check('parseability', 2, 'standard_headings',
    headings >= 3 ? 'pass' : headings >= 1 ? 'warn' : 'fail',
    `${plural(headings, 'standard section heading')} recognised.`,
    'Use conventional section headings such as Experience, Education and Skills.');

  const pages = source.pageCount;
  const tooLong = words > HEALTH.longWords || (pages !== null && pages > HEALTH.longPages);
  check('parseability', 1, 'length',
    tooLong ? 'warn' : 'pass',
    pages !== null ? `${plural(pages, 'page')}, ${plural(words, 'word')}.` : `${plural(words, 'word')}.`,
    'Consider tightening the resume; very long resumes are harder to scan.');

  const injected = doc.lines.find((l) => EMBEDDED_INSTRUCTIONS.test(l.text));
  check('parseability', 1, 'embedded_instructions',
    injected ? 'fail' : 'pass',
    injected ? 'The document contains text addressed to automated screening software.' : 'No instructions aimed at screening software were found.',
    'Remove any text that addresses automated systems; it is flagged by screening tools.',
    injected ? [{ lineIndex: injected.index, start: null, end: null }] : []);

  // ── Structure: are entries well formed? ────────────────────────────────────
  const experience = profile.experience;
  const entries = [...experience, ...profile.projects];
  const gradeShare = (s) => (s >= 1 ? 'pass' : s >= 0.5 ? 'warn' : 'fail');

  const dated = experience.filter((e) => e.dates).length;
  check('structure', 2, 'dated_roles',
    experience.length === 0 ? 'not_applicable' : gradeShare(share(dated, experience.length)),
    experience.length === 0 ? 'No work experience entries to check.' : `${dated} of ${experience.length} experience entries have parseable dates.`,
    'Give every role a clear date range (e.g. "Jan 2022 - Present").');

  const titled = experience.filter((e) => e.title && e.organization).length;
  check('structure', 2, 'entry_structure',
    experience.length === 0 ? 'not_applicable' : gradeShare(share(titled, experience.length)),
    experience.length === 0 ? 'No work experience entries to check.' : `${titled} of ${experience.length} experience entries have both a job title and an organisation.`,
    'State the job title and the organisation on each role\'s heading line.');

  if (entries.length > 0) {
    const described = entries.filter((e) => e.bullets.length > 0 || (e.descriptionRefs || []).length > 0).length;
    rule('structure', 2, 'STRUCT-ENTRY-CONTENT', 'format', share(described, entries.length),
      `${described} of ${entries.length} experience/project entries describe what was done.`,
      'Add a few bullet points under each role or project describing the work.');
  }

  // ── Technical content: are skills present and demonstrated? ────────────────
  const skillIds = new Set(profile.skillMentions.map((m) => m.skillId));
  const demonstrated = new Set(profile.skillMentions.filter((m) => m.entryId && /^(exp|proj)_/.test(m.entryId)).map((m) => m.skillId));
  const skillCount = skillIds.size;

  rule('technical_content', 2, 'TECH-SKILLS-RECOGNISED', 'technical_content',
    skillCount >= HEALTH.skillsFull ? 1 : skillCount >= HEALTH.skillsFair ? 0.7 : skillCount >= 1 ? 0.4 : 0,
    `${plural(skillCount, 'distinct recognised skill')} found.`,
    'Name the specific technologies and tools you have worked with.');

  if (skillCount > 0) {
    const demoShare = share(demonstrated.size, skillCount);
    rule('technical_content', 2, 'TECH-SKILLS-DEMONSTRATED', 'technical_content', scaled(demoShare, HEALTH.demonstratedShare),
      `${demonstrated.size} of ${skillCount} skills appear inside a role or project, not only in a list.`,
      'Show where each key skill was used by mentioning it in a role or project.');
  }

  if (entries.length > 0) {
    const technical = entries.filter((e) => e.skillIds.length > 0).length;
    rule('technical_content', 1, 'TECH-ENTRY-SKILLS', 'technical_content', share(technical, entries.length),
      `${technical} of ${entries.length} experience/project entries mention a recognised skill.`,
      'Mention the technologies used in each role or project.');
  }

  // ── Impact: do bullets show outcomes? (never required of every bullet) ─────
  const bullets = entries.flatMap((e) => e.bullets);
  if (bullets.length > 0) {
    const withMetric = bullets.filter((b) => b.metrics.length > 0).length;
    rule('impact', 2, 'IMPACT-METRICS', 'impact', scaled(share(withMetric, bullets.length), HEALTH.metricShare),
      `${withMetric} of ${plural(bullets.length, 'bullet')} include a measurable result.`,
      'Quantify a few achievements where you genuinely can (scale, speed, percentages).');

    const withVerb = bullets.filter((b) => b.actionVerb).length;
    rule('impact', 1, 'IMPACT-ACTION-VERBS', 'impact', scaled(share(withVerb, bullets.length), HEALTH.actionVerbShare),
      `${withVerb} of ${plural(bullets.length, 'bullet')} open with an action verb.`,
      'Start bullets with a strong action verb (Built, Led, Reduced).');
  }

  // ── Completeness: are the essentials present? ──────────────────────────────
  const { contact } = profile;
  check('completeness', 3, 'contact_email',
    contact.emails.length ? 'pass' : 'fail',
    contact.emails.length ? 'An email address was found.' : 'No email address was found.',
    'Add an email address near the top of the resume.',
    contact.emails.length ? [contact.emails[0].ref] : []);

  check('completeness', 1, 'contact_phone',
    contact.phones.length ? 'pass' : 'warn',
    contact.phones.length ? 'A phone number was found.' : 'No phone number was found.',
    'Consider adding a phone number.',
    contact.phones.length ? [contact.phones[0].ref] : []);

  rule('completeness', 1, 'COMP-NAME', 'completeness', contact.name ? 1 : 0,
    contact.name ? 'A name was found.' : 'No name could be identified at the top of the resume.',
    'Put your full name on the first line.');

  rule('completeness', 3, 'COMP-WORK-EVIDENCE', 'completeness',
    experience.length ? 1 : profile.projects.length ? 0.7 : 0,
    experience.length ? `Work experience was found (${experience.length} ${experience.length === 1 ? 'entry' : 'entries'}).`
      : profile.projects.length ? 'No work experience was found; projects are the only practical evidence.'
        : 'Neither work experience nor projects were found.',
    'Add work experience, or projects if you have no formal experience yet.');

  rule('completeness', 2, 'COMP-EDUCATION', 'completeness', profile.education.length ? 1 : 0,
    profile.education.length ? 'Education was found.' : 'No education entries were found.',
    'Add an Education section with your qualification and institution.');

  rule('completeness', 2, 'COMP-SKILLS', 'completeness',
    profile.skillsSection.length ? 1 : skillCount ? 0.7 : 0,
    profile.skillsSection.length ? 'A skills section was found.' : skillCount ? 'Skills are mentioned, but there is no dedicated skills section.' : 'No skills were found.',
    'Add a Skills section listing your key technologies.');

  // ── Assemble ────────────────────────────────────────────────────────────────
  const unreadable = words < HEALTH.unreadableWords;
  const emptyReasons = {
    structure: 'The resume has no experience or project entries whose structure could be checked.',
    impact: 'The resume has no bullet points whose impact could be assessed.',
  };
  const confidenceReasons = [];
  if (!unreadable && words < HEALTH.thinWords) confidenceReasons.push('Very little text was extracted, so the assessment rests on limited content.');
  if (layout.multiColumnSuspected) confidenceReasons.push('A multi-column layout may have affected how sections were read.');

  const score = buildBreakdown({
    kind: 'resume_health',
    forceNull: unreadable,
    nullReason: `Only ${plural(words, 'word')} of text could be extracted, which is too little to assess. The file may be empty or image-based.`,
    confidence: { label: unreadable ? 'low' : confidenceReasons.length ? 'medium' : 'high', reasons: confidenceReasons },
    components: Object.keys(HEALTH_COMPONENT_WEIGHTS).map((id) => ({
      id,
      weight: HEALTH_COMPONENT_WEIGHTS[id],
      baseWeight: HEALTH_COMPONENT_WEIGHTS[id],
      items: items[id],
      emptyStatus: 'not_evaluated',
      emptyReason: emptyReasons[id] || 'Nothing could be checked for this component.',
      statusReason: `${plural(items[id].length, 'check')} evaluated.`,
      confidence: id === 'parseability' || id === 'completeness' ? 0.95 : 0.85,
    })),
  });

  const parseability = score.components.find((c) => c.id === 'parseability').rawScore;
  const readability = unreadable ? 'unreadable' : parseability >= 0.85 ? 'good' : parseability >= 0.6 ? 'fair' : 'poor';

  return parseContract(ResumeHealthReportSchema, {
    version: SCORING_MODEL_VERSION,
    sourceKind: source.kind,
    readability,
    checks,
    findings,
    score,
    limitations: LIMITATIONS,
  }, 'ResumeHealthReport');
}

module.exports = { assessResumeHealth };
